/*
# WhatsApp contact stored as a normalized phone number

1. Changes to `profiles`
- New column `whatsapp_phone` (text): the advertiser's WhatsApp number as digits only with country code, for example 5531984293789. Null when no valid number is available.
- The legacy column `whatsapp_link` is kept as-is for data safety but is no longer used by the contact button.
- Existing profiles whose stored link contains a valid Brazilian number are backfilled into `whatsapp_phone`. Other rows stay null and must be updated by the advertiser.

2. Validation
- CHECK constraint: when present, the value must be "55" followed by 10 or 11 digits.

3. Contact click (`process_contact_click`)
- Billing, 24h dedupe, free views and balance logic are unchanged.
- The returned field is `whatsapp_phone` instead of `whatsapp_link`.

4. Public feed (`get_public_feed`)
- Returns `whatsapp_phone` instead of `whatsapp_link`. Ranking logic is unchanged.

5. Security
- Authenticated advertisers can read, insert and update only the new column, matching the existing column-level privileges on profiles.
- Both functions keep their previous EXECUTE grants.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_phone text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_whatsapp_phone_format'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_whatsapp_phone_format
      CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^55[0-9]{10,11}$');
  END IF;
END $$;

GRANT SELECT (whatsapp_phone), INSERT (whatsapp_phone), UPDATE (whatsapp_phone) ON profiles TO authenticated;

UPDATE profiles
SET whatsapp_phone = d.phone
FROM (
  SELECT id, substring(whatsapp_link FROM 'wa\.me/\+?([0-9]+)') AS phone
  FROM profiles
) AS d
WHERE profiles.id = d.id
  AND profiles.whatsapp_phone IS NULL
  AND d.phone ~ '^55[0-9]{10,11}$';

DROP FUNCTION IF EXISTS public.get_public_feed(integer, integer, text, text, uuid);

CREATE FUNCTION public.get_public_feed(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_city text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_viewer_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, description text, cover_url text, media_urls jsonb, price_per_hour numeric, category text, neighborhood text, city text, whatsapp_phone text, contact_channels jsonb, rating_average numeric, total_reviews integer, created_at timestamp with time zone, rank_score double precision, is_boosted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
RETURN QUERY
SELECT
p.id,
p.name,
p.description,
p.cover_url,
p.media_urls,
p.price_per_hour,
p.category,
p.neighborhood,
p.city,
p.whatsapp_phone,
p.contact_channels,
p.rating_average,
p.total_reviews,
p.created_at,
CASE
WHEN p_viewer_id IS NOT NULL AND p.id = p_viewer_id THEN 999999.0
ELSE (
(
CASE WHEN EXISTS (
SELECT 1 FROM profile_boosts pb
WHERE pb.profile_id = p.id AND pb.is_active = true AND pb.expires_at > now()
) THEN 150.0 ELSE 0.0 END
+ (p.rating_average * 20.0)
+ LEAST(p.total_reviews * 2.0, 20.0)
+ CASE WHEN p.created_at > now() - interval '7 days' THEN 50.0 ELSE 0.0 END
+ CASE WHEN p.credits_balance > 0 THEN LEAST(log(p.credits_balance + 1) * 15.0, 45.0) ELSE 0.0 END
) * (0.92 + random() * 0.16)
)
END AS rank_score,
EXISTS (
SELECT 1 FROM profile_boosts pb
WHERE pb.profile_id = p.id AND pb.is_active = true AND pb.expires_at > now()
) AS is_boosted
FROM profiles p
WHERE p.status = 'active'
AND p.is_admin = false
AND (
p_city IS NULL OR p_city = '' OR
unaccent(lower(trim(p.city))) ILIKE '%' || unaccent(lower(trim(p_city))) || '%'
)
AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
ORDER BY rank_score DESC
LIMIT p_limit
OFFSET p_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_feed(integer, integer, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_feed(integer, integer, text, text, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.process_contact_click(uuid, text);

CREATE FUNCTION public.process_contact_click(p_profile_id uuid, p_visitor_identifier text)
RETURNS TABLE(success boolean, already_contacted boolean, cost_charged numeric, new_balance numeric, profile_status text, whatsapp_phone text, contact_channels jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_profile profiles%ROWTYPE;
v_existing_click leads_clicks%ROWTYPE;
v_cost numeric(10,2);
v_new_balance numeric(10,2);
v_new_status text;
v_caller_uid uuid;
BEGIN
v_caller_uid := auth.uid();

SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id AND status = 'active';
IF NOT FOUND THEN
RETURN QUERY SELECT false, false, 0.00, 0.00, 'inactive', ''::text, '[]'::jsonb;
RETURN;
END IF;

IF v_caller_uid IS NOT NULL AND v_caller_uid = p_profile_id THEN
RETURN QUERY SELECT false, false, 0.00, v_profile.credits_balance, v_profile.status, v_profile.whatsapp_phone, v_profile.contact_channels;
RETURN;
END IF;

SELECT * INTO v_existing_click
FROM leads_clicks
WHERE profile_id = p_profile_id
AND visitor_identifier = p_visitor_identifier
AND click_type = 'contact'
AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 1;

IF FOUND THEN
RETURN QUERY SELECT true, true, 0.00, v_profile.credits_balance, v_profile.status, v_profile.whatsapp_phone, v_profile.contact_channels;
RETURN;
END IF;

v_cost := CASE v_profile.category
WHEN 'standard' THEN 15.00
WHEN 'mid' THEN 25.00
WHEN 'vip' THEN 35.00
ELSE 15.00
END;

IF v_profile.credits_balance < v_cost THEN
UPDATE profiles SET status = 'exhausted' WHERE id = p_profile_id;
RETURN QUERY SELECT false, false, 0.00, 0.00, 'exhausted', v_profile.whatsapp_phone, v_profile.contact_channels;
RETURN;
END IF;

v_new_balance := v_profile.credits_balance - v_cost;
v_new_status := CASE WHEN v_new_balance < v_cost THEN 'exhausted' ELSE 'active' END;

UPDATE profiles
SET credits_balance = v_new_balance, status = v_new_status
WHERE id = p_profile_id;

INSERT INTO leads_clicks (profile_id, visitor_identifier, click_type, cost_charged)
VALUES (p_profile_id, p_visitor_identifier, 'contact', v_cost);

RETURN QUERY SELECT true, false, v_cost, v_new_balance, v_new_status, v_profile.whatsapp_phone, v_profile.contact_channels;
RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_contact_click(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_contact_click(uuid, text) TO anon, authenticated, service_role;
