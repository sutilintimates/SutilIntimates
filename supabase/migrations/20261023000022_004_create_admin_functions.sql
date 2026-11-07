/*
# Create Admin Functions for I♡PUTs Platform

## Overview
Creates admin-only functions for platform-wide metrics and advertiser listing.
Uses LATERAL joins with table-qualified column names. Output column aliases
are omitted in RETURN QUERY SELECT to avoid ambiguity with function output params.
*/

-- ============================================================
-- get_admin_stats: platform-wide metrics for admin
-- ============================================================
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS TABLE (
  total_profiles bigint,
  active_profiles bigint,
  paused_profiles bigint,
  exhausted_profiles bigint,
  total_revenue numeric,
  total_clicks bigint,
  total_contact_clicks bigint,
  total_profile_views bigint,
  recent_profiles jsonb,
  recent_transactions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0.00, 0::bigint, 0::bigint, 0::bigint, '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint FROM profiles),
    (SELECT COUNT(*)::bigint FROM profiles WHERE profiles.status = 'active'),
    (SELECT COUNT(*)::bigint FROM profiles WHERE profiles.status = 'paused'),
    (SELECT COUNT(*)::bigint FROM profiles WHERE profiles.status = 'exhausted'),
    COALESCE((SELECT SUM(amount) FROM transactions WHERE transactions.status = 'paid'), 0.00),
    (SELECT COUNT(*)::bigint FROM leads_clicks),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE leads_clicks.click_type = 'contact'),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE leads_clicks.click_type = 'view'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(x)) FROM (
        SELECT profiles.id, profiles.name, profiles.city,
               profiles.status, profiles.credits_balance,
               profiles.created_at
        FROM profiles ORDER BY profiles.created_at DESC LIMIT 50
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

REVOKE EXECUTE ON FUNCTION get_admin_stats() FROM anon;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;

-- ============================================================
-- get_admin_profiles: detailed list for admin
-- ============================================================
CREATE OR REPLACE FUNCTION get_admin_profiles()
RETURNS TABLE (
  pid uuid,
  pname text,
  pcity text,
  pcategory text,
  pstatus text,
  pcredits_balance numeric,
  pprice_per_hour numeric,
  prating_average numeric,
  ptotal_reviews integer,
  ptotal_spent numeric,
  ptotal_contact_clicks bigint,
  ptotal_views bigint,
  pcreated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.city,
    p.category,
    p.status,
    p.credits_balance,
    p.price_per_hour,
    p.rating_average,
    p.total_reviews,
    COALESCE(s.total_spent, 0.00),
    COALESCE(s.total_contact_clicks, 0)::bigint,
    COALESCE(s.total_views, 0)::bigint,
    p.created_at
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT
      SUM(lc.cost_charged) AS total_spent,
      COUNT(*) FILTER (WHERE lc.click_type = 'contact') AS total_contact_clicks,
      COUNT(*) FILTER (WHERE lc.click_type = 'view') AS total_views
    FROM leads_clicks lc WHERE lc.profile_id = p.id
  ) s ON true
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_admin_profiles() FROM anon;
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO authenticated;