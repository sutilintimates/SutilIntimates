/*
# Audit: lock sensitive columns and tables against direct client writes

1. Summary
Closes permission gaps found in a security audit. Users could previously change
their own admin flag, credit balance, and review stats, insert transactions, and
truncate tables straight through the Data API. The app itself never needs those
direct writes: they are performed by server functions and the payment webhook,
which run with elevated rights and are not affected by these changes.

2. Security changes
- Every table: removed all direct privileges for the anon and authenticated roles,
  then re-granted only what the app actually uses (column by column where needed).
- profiles: anon can no longer read is_admin, credits_balance, asaas_customer_id,
  or payment_identifier. Signed-in users can no longer set is_admin, credits_balance,
  rating_average, total_reviews, status (after creation), asaas_customer_id, or
  created_at directly.
- transactions, reviews, leads_clicks, profile_boosts: read-only for clients.
  Inserts and updates happen through server functions and the payment webhook.
- Dropped three policies that allowed direct inserts that bypassed the rules in
  the submit_review and process_contact_click functions.
- get_dashboard_stats: returns data only for the signed-in user's own profile.
  Previously any signed-in user could pass another user's id.

3. Important notes
- Server-side code uses the service role key, which is not affected by these grants.
- No existing screens read or write the restricted columns directly.
*/

REVOKE ALL ON app_config, asaas_payment_operations, leads_clicks, profile_boosts,
  profiles, reviews, transactions, webhook_events FROM anon, authenticated;

DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOR t IN SELECT unnest(ARRAY['app_config','asaas_payment_operations','leads_clicks',
    'profile_boosts','profiles','reviews','transactions','webhook_events']) LOOP
    FOR r IN SELECT attname FROM pg_attribute
      WHERE attrelid = ('public.' || t)::regclass AND attnum > 0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM anon, authenticated', r.attname, t);
    END LOOP;
  END LOOP;
END $$;

GRANT SELECT ON app_config TO authenticated;
GRANT SELECT ON leads_clicks TO authenticated;
GRANT SELECT ON profile_boosts TO authenticated;
GRANT SELECT ON reviews TO anon, authenticated;
GRANT SELECT ON transactions TO authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT SELECT (id, name, description, price_per_hour, category, city, neighborhood,
  whatsapp_link, cover_url, media_urls, contact_channels, status, rating_average,
  total_reviews, created_at) ON profiles TO anon;
GRANT INSERT (id, name, description, cover_url, media_urls, price_per_hour, category,
  neighborhood, city, whatsapp_link, contact_channels, payment_identifier, status) ON profiles TO authenticated;
GRANT UPDATE (name, description, price_per_hour, city, neighborhood, whatsapp_link,
  cover_url, media_urls, category, contact_channels, payment_identifier) ON profiles TO authenticated;

DROP POLICY IF EXISTS "public_insert_reviews" ON reviews;
DROP POLICY IF EXISTS "public_insert_leads_clicks" ON leads_clicks;
DROP POLICY IF EXISTS "owner_insert_transactions" ON transactions;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(credits_balance numeric, total_spent numeric, total_contact_clicks bigint, total_profile_views bigint, profile_status text, price_per_hour numeric, category text, cost_per_click numeric, recent_clicks jsonb, recent_transactions jsonb, daily_spending jsonb, boost_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_profile profiles%ROWTYPE;
v_cpc numeric(10,2);
v_boost_expires timestamptz;
BEGIN
IF p_user_id IS DISTINCT FROM auth.uid() THEN
RETURN;
END IF;

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
$function$;
