/*
# Admin config functions + own-profile-first feed

## Overview
1. get_app_config: admin-only function to read all app_config rows.
2. set_app_config: admin-only function to upsert a config key/value.
3. get_public_feed: accepts an optional p_viewer_id. If the viewer is an advertiser, their own profile is pinned to position 1.

## Security
- get_app_config / set_app_config: REVOKE from PUBLIC/anon, GRANT to authenticated. Admin check inside.
- get_public_feed: public, unchanged grants.
*/

CREATE OR REPLACE FUNCTION get_app_config()
RETURNS TABLE (cfg_key text, cfg_value text, cfg_updated_at timestamptz)
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
  RETURN QUERY SELECT ac.key, ac.value, ac.updated_at FROM app_config ac ORDER BY ac.key;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_app_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_app_config() TO authenticated;

CREATE OR REPLACE FUNCTION set_app_config(p_key text, p_value text)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RETURN QUERY SELECT false, 'Permissão negada.'::text;
    RETURN;
  END IF;

  INSERT INTO app_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_by = auth.uid(), updated_at = now();

  RETURN QUERY SELECT true, 'Configuração salva.'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_app_config(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_app_config(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION get_public_feed(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  cover_url text,
  media_urls jsonb,
  price_per_hour numeric,
  category text,
  neighborhood text,
  city text,
  whatsapp_link text,
  contact_channels jsonb,
  rating_average numeric,
  total_reviews integer,
  created_at timestamptz,
  rank_score double precision,
  is_boosted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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
    p.whatsapp_link,
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
$$;

REVOKE EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text, uuid) TO anon, authenticated;
