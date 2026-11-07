/*
# Create Management Functions for I♡PUTs Platform

## Overview
Creates dashboard stats, profile pause/resume, account deletion, and credit addition functions.
*/

-- ============================================================
-- get_dashboard_stats: analytics for advertiser
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  credits_balance numeric,
  total_spent numeric,
  total_contact_clicks bigint,
  total_profile_views bigint,
  profile_status text,
  price_per_hour numeric,
  category text,
  cost_per_click numeric,
  recent_clicks jsonb,
  recent_transactions jsonb,
  daily_spending jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_cpc numeric(10,2);
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0.00, 0.00, 0::bigint, 0::bigint, 'inactive'::text, 0.00, 'standard'::text, 15.00, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

  v_cpc := CASE v_profile.category
    WHEN 'standard' THEN 15.00
    WHEN 'mid' THEN 25.00
    WHEN 'vip' THEN 35.00
    ELSE 15.00
  END;

  RETURN QUERY
  SELECT
    v_profile.credits_balance,
    COALESCE((SELECT SUM(cost_charged) FROM leads_clicks WHERE profile_id = p_user_id AND click_type = 'contact'), 0.00),
    COALESCE((SELECT COUNT(*) FROM leads_clicks WHERE profile_id = p_user_id AND click_type = 'contact'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM leads_clicks WHERE profile_id = p_user_id AND click_type = 'view'), 0)::bigint,
    v_profile.status,
    v_profile.price_per_hour,
    v_profile.category,
    v_cpc,
    COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT id, click_type AS type, cost_charged AS cost, created_at
        FROM leads_clicks WHERE profile_id = p_user_id ORDER BY created_at DESC LIMIT 50
      ) x
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT id, amount, status, created_at
        FROM transactions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT date_trunc('day', created_at)::date::text AS date, SUM(cost_charged) AS spent
        FROM leads_clicks
        WHERE profile_id = p_user_id AND click_type = 'contact'
          AND created_at > now() - interval '30 days'
        GROUP BY date_trunc('day', created_at)
        ORDER BY date_trunc('day', created_at)
      ) x
    ), '[]'::jsonb);

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_dashboard_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;

-- ============================================================
-- toggle_profile_pause: pause/resume profile
-- ============================================================
CREATE OR REPLACE FUNCTION toggle_profile_pause()
RETURNS TABLE (success boolean, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current text;
BEGIN
  SELECT status INTO v_current FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_current = 'paused' THEN
    UPDATE profiles SET status = 'active' WHERE id = auth.uid() AND credits_balance >= 15.00;
    IF NOT FOUND THEN
      UPDATE profiles SET status = 'exhausted' WHERE id = auth.uid();
      RETURN QUERY SELECT true, 'exhausted'::text;
    ELSE
      RETURN QUERY SELECT true, 'active'::text;
    END IF;
  ELSE
    UPDATE profiles SET status = 'paused' WHERE id = auth.uid();
    RETURN QUERY SELECT true, 'paused'::text;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION toggle_profile_pause() FROM anon;
GRANT EXECUTE ON FUNCTION toggle_profile_pause() TO authenticated;

-- ============================================================
-- delete_profile: permanent account deletion
-- ============================================================
CREATE OR REPLACE FUNCTION delete_profile()
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RETURN QUERY SELECT false, 'Perfil não encontrado.'::text;
    RETURN;
  END IF;

  DELETE FROM profiles WHERE id = auth.uid();

  RETURN QUERY SELECT true, 'Conta excluída permanentemente. Saldos remanescentes não são reembolsáveis.'::text;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_profile() FROM anon;
GRANT EXECUTE ON FUNCTION delete_profile() TO authenticated;

-- ============================================================
-- add_credits: credit balance after Asaas payment confirmation
-- ============================================================
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id uuid,
  p_amount numeric
)
RETURNS TABLE (success boolean, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance numeric(10,2);
BEGIN
  UPDATE profiles
  SET credits_balance = credits_balance + p_amount,
      status = CASE
        WHEN credits_balance + p_amount >= 15.00 THEN 'active'
        ELSE status
      END
  WHERE id = p_user_id
  RETURNING credits_balance INTO v_balance;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0.00;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_balance;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_credits(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION add_credits(uuid, numeric) TO authenticated;