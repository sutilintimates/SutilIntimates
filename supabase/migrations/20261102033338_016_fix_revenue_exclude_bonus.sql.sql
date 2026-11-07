/*
# Fix admin revenue calculation: exclude welcome bonus credits from real revenue

1. Modified Functions
- `get_admin_stats` — `total_revenue` now excludes transactions where `asaas_payment_id = 'FREE_WELCOME_CREDIT'`,
  so only real money transferred via Asaas is counted as revenue.
  The `recent_transactions` query now includes a `is_bonus` boolean field so the admin UI can distinguish
  bonus credit transactions from real payments.
*/

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
    COALESCE((
      SELECT SUM(amount) FROM transactions
      WHERE status = 'paid' AND asaas_payment_id != 'FREE_WELCOME_CREDIT'
    ), 0.00),
    COALESCE((
      SELECT SUM(amount) FROM transactions
      WHERE status = 'paid' AND asaas_payment_id = 'FREE_WELCOME_CREDIT'
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
        p.name AS profile_name,
        (t.asaas_payment_id = 'FREE_WELCOME_CREDIT') AS is_bonus
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
