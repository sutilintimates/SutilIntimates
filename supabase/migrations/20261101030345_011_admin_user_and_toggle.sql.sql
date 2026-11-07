/*
# Admin user + admin profile toggle function + metric fixes

## Overview
1. Creates the admin auth user 311519@gmail.com with password "HPL" if it does not exist, marks its profile row as is_admin = true.
2. Adds admin_toggle_profile(p_profile_id uuid) SECURITY DEFINER function: lets an admin pause or reactivate any profile. Only callable by profiles with is_admin = true.
3. Recreates get_dashboard_stats: total_contact_clicks now counts only PAID contact clicks (cost_charged > 0). Free repeats within 24h are NOT counted as a chargeable click.
4. Recreates get_admin_stats: adds total_paid_contact_clicks (paid only) alongside total_contact_clicks (all). total_revenue = sum of paid transactions. Excludes the admin profile from counts.
5. Recreates get_admin_profiles: counts only paid contact clicks.

## Security
- admin_toggle_profile: REVOKE from PUBLIC/anon, GRANT to authenticated.
- All functions remain SECURITY DEFINER with fixed public search_path.
- No new tables; no destructive changes to user data.
*/

-- ============================================================
-- 1. Ensure admin user exists
-- ============================================================
DO $$
DECLARE
  v_admin_uid uuid;
BEGIN
  SELECT id INTO v_admin_uid FROM auth.users WHERE email = '311519@gmail.com';
  IF NOT FOUND THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      '311519@gmail.com',
      crypt('HPL', gen_salt('bf')),
      now(), now(), now(),
      '{}'::jsonb, '{}'::jsonb
    )
    RETURNING id INTO v_admin_uid;
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('HPL', gen_salt('bf')) WHERE id = v_admin_uid;
  END IF;

  INSERT INTO profiles (id, name, is_admin, status, credits_balance, price_per_hour, category, cover_url, media_urls, contact_channels, whatsapp_link, description, neighborhood, city, payment_identifier, rating_average, total_reviews)
  VALUES (
    v_admin_uid, 'Administrador', true, 'active', 0.00, 0, 'standard',
    '', '[]'::jsonb, '[]'::jsonb, '', '', '', '', '', 0.00, 0
  )
  ON CONFLICT (id) DO UPDATE SET is_admin = true;
END $$;

-- ============================================================
-- 2. admin_toggle_profile
-- ============================================================
CREATE OR REPLACE FUNCTION admin_toggle_profile(p_profile_id uuid)
RETURNS TABLE (success boolean, new_status text, message text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_profile profiles%ROWTYPE;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT false, ''::text, 'Permissão negada.'::text;
    RETURN;
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ''::text, 'Perfil não encontrado.'::text;
    RETURN;
  END IF;

  IF v_profile.is_admin THEN
    RETURN QUERY SELECT false, v_profile.status::text, 'Não é possível alterar o perfil do administrador.'::text;
    RETURN;
  END IF;

  IF v_profile.status = 'paused' THEN
    IF v_profile.credits_balance >= 15.00 THEN
      UPDATE profiles SET status = 'active' WHERE id = p_profile_id;
      RETURN QUERY SELECT true, 'active'::text, 'Perfil reativado pela administração.'::text;
    ELSE
      UPDATE profiles SET status = 'exhausted' WHERE id = p_profile_id;
      RETURN QUERY SELECT true, 'exhausted'::text, 'Perfil está sem créditos. Foi marcado como esgotado.'::text;
    END IF;
  ELSE
    UPDATE profiles SET status = 'paused' WHERE id = p_profile_id;
    RETURN QUERY SELECT true, 'paused'::text, 'Perfil pausado pela administração.'::text;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_toggle_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_toggle_profile(uuid) TO authenticated;

-- ============================================================
-- 3. Recreate get_dashboard_stats (paid-only contact count)
-- ============================================================
DROP FUNCTION IF EXISTS get_dashboard_stats(uuid);

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
  daily_spending jsonb,
  boost_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_cpc numeric(10,2);
  v_boost_expires timestamptz;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0.00, 0.00, 0::bigint, 0::bigint, 'inactive'::text, 0.00, 'standard'::text, 15.00, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL::timestamptz;
    RETURN;
  END IF;

  v_cpc := CASE v_profile.category
    WHEN 'standard' THEN 15.00
    WHEN 'mid' THEN 25.00
    WHEN 'vip' THEN 35.00
    ELSE 15.00
  END;

  SELECT expires_at INTO v_boost_expires
  FROM profile_boosts
  WHERE profile_id = p_user_id AND is_active = true AND expires_at > now()
  ORDER BY expires_at DESC LIMIT 1;

  RETURN QUERY
  SELECT
    v_profile.credits_balance,
    COALESCE((SELECT SUM(cost_charged) FROM leads_clicks WHERE profile_id = p_user_id AND click_type = 'contact'), 0.00),
    COALESCE((SELECT COUNT(*) FROM leads_clicks WHERE profile_id = p_user_id AND click_type = 'contact' AND cost_charged > 0), 0)::bigint,
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
    ), '[]'::jsonb),
    v_boost_expires;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;

-- ============================================================
-- 4. Recreate get_admin_stats (paid contact clicks + revenue)
-- ============================================================
DROP FUNCTION IF EXISTS get_admin_stats();

CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS TABLE (
  total_profiles bigint,
  active_profiles bigint,
  paused_profiles bigint,
  exhausted_profiles bigint,
  total_revenue numeric,
  total_paid_contact_clicks bigint,
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
    (SELECT COUNT(*)::bigint FROM profiles WHERE is_admin = false),
    (SELECT COUNT(*)::bigint FROM profiles WHERE status = 'active' AND is_admin = false),
    (SELECT COUNT(*)::bigint FROM profiles WHERE status = 'paused' AND is_admin = false),
    (SELECT COUNT(*)::bigint FROM profiles WHERE status = 'exhausted' AND is_admin = false),
    COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'paid'), 0.00),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE click_type = 'contact' AND cost_charged > 0),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE click_type = 'contact'),
    (SELECT COUNT(*)::bigint FROM leads_clicks WHERE click_type = 'view'),
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

-- ============================================================
-- 5. Recreate get_admin_profiles (paid contact clicks)
-- ============================================================
DROP FUNCTION IF EXISTS get_admin_profiles();

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
      COUNT(*) FILTER (WHERE lc.click_type = 'contact' AND lc.cost_charged > 0) AS total_contact_clicks,
      COUNT(*) FILTER (WHERE lc.click_type = 'view') AS total_views
    FROM leads_clicks lc WHERE lc.profile_id = p.id
  ) s ON true
  WHERE p.is_admin = false
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_admin_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO authenticated;
