/*
# Admin stats: separate real revenue from bonus credits, add unique visitors, add admin delete account

1. Modified Functions
- `get_admin_stats` — now returns:
  - `total_revenue` = SUM of transactions WHERE status = 'paid' (real money transferred via Asaas)
  - `total_bonus_credits` = SUM of bonus credits given to advertisers on signup (cost_per_click for each profile's category, counted once per profile)
  - `unique_visitors` = COUNT DISTINCT visitor_identifier from leads_clicks (views + contacts)
- `admin_delete_account(p_profile_id)` — SECURITY DEFINER function that deletes a non-admin profile and all related data (leads_clicks, reviews, profile_boosts, transactions) and the auth user

2. Security
- `admin_delete_account` is SECURITY DEFINER, callable only by authenticated admin users
- REVOKE EXECUTE from PUBLIC/anon, GRANT only to authenticated
- search_path set to public
*/

-- Recreate get_admin_stats with new fields
DROP FUNCTION IF EXISTS get_admin_stats;

CREATE FUNCTION get_admin_stats()
RETURNS TABLE(
  total_profiles bigint,
  active_profiles bigint,
  paused_profiles bigint,
  exhausted_profiles bigint,
  total_revenue numeric,
  total_bonus_credits numeric,
  total_paid_contact_clicks bigint,
  total_contact_clicks bigint,
  total_profile_views bigint,
  unique_visitors bigint,
  recent_profiles jsonb,
  recent_transactions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT
      0::bigint, 0::bigint, 0::bigint, 0::bigint,
      0.00::numeric, 0.00::numeric,
      0::bigint, 0::bigint, 0::bigint, 0::bigint,
      '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint FROM profiles WHERE is_admin = false),
    (SELECT COUNT(*)::bigint FROM profiles WHERE status = 'active' AND is_admin = false),
    (SELECT COUNT(*)::bigint FROM profiles WHERE status = 'paused' AND is_admin = false),
    (SELECT COUNT(*)::bigint FROM profiles WHERE status = 'exhausted' AND is_admin = false),
    COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'paid'), 0.00),
    COALESCE((
      SELECT SUM(
        CASE category
          WHEN 'standard' THEN 15.00
          WHEN 'mid' THEN 25.00
          WHEN 'vip' THEN 35.00
          ELSE 15.00
        END
      )
      FROM profiles WHERE is_admin = false
    ), 0.00),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE click_type = 'contact' AND cost_charged > 0),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE click_type = 'contact'),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE click_type = 'view'),
    (SELECT COUNT(DISTINCT visitor_identifier)::bigint FROM leads_clicks),
    COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT profiles.id, profiles.name, profiles.city,
        profiles.status, profiles.credits_balance,
        profiles.created_at
        FROM profiles WHERE profiles.is_admin = false
        ORDER BY profiles.created_at DESC LIMIT 50
      ) x
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT t.id, t.user_id, t.amount,
        t.status, t.created_at,
        p.name AS profile_name
        FROM transactions t
        JOIN profiles p ON p.id = t.user_id
        ORDER BY t.created_at DESC LIMIT 50
      ) x
    ), '[]'::jsonb);

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;

-- Admin delete account function
CREATE OR REPLACE FUNCTION admin_delete_account(p_profile_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_target_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT false, 'Apenas administradores podem excluir contas.'::text;
    RETURN;
  END IF;

  SELECT is_admin INTO v_target_is_admin FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Perfil não encontrado.'::text;
    RETURN;
  END IF;

  IF v_target_is_admin THEN
    RETURN QUERY SELECT false, 'Não é possível excluir uma conta de administrador.'::text;
    RETURN;
  END IF;

  DELETE FROM leads_clicks WHERE profile_id = p_profile_id;
  DELETE FROM reviews WHERE profile_id = p_profile_id;
  DELETE FROM profile_boosts WHERE profile_id = p_profile_id;
  DELETE FROM transactions WHERE user_id = p_profile_id;
  DELETE FROM profiles WHERE id = p_profile_id;

  DELETE FROM auth.users WHERE id = p_profile_id;

  RETURN QUERY SELECT true, 'Conta excluída com sucesso.'::text;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_delete_account(uuid) TO authenticated;
