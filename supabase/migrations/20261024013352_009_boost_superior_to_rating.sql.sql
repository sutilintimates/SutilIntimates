/*
# Ensure boost score stays above max possible rating score
Max rating score = 5*20 + 20 = 120, so boost must be > 120
*/
DROP FUNCTION IF EXISTS get_public_feed(integer, integer, text, text);

CREATE OR REPLACE FUNCTION get_public_feed(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_city text DEFAULT NULL, p_category text DEFAULT NULL)
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
    (
      CASE WHEN EXISTS (
        SELECT 1 FROM profile_boosts pb
        WHERE pb.profile_id = p.id AND pb.is_active = true AND pb.expires_at > now()
      ) THEN 150.0 ELSE 0.0 END
      + CASE WHEN p.created_at > now() - interval '7 days' THEN 50.0 ELSE 0.0 END
      + (p.rating_average * 20.0)
      + LEAST(p.total_reviews * 2.0, 20.0)
      + CASE WHEN p.credits_balance > 0 THEN LEAST(log(p.credits_balance + 1) * 15.0, 45.0) ELSE 0.0 END
      + (random() * 20.0)
    ) AS rank_score,
    EXISTS (
      SELECT 1 FROM profile_boosts pb
      WHERE pb.profile_id = p.id AND pb.is_active = true AND pb.expires_at > now()
    ) AS is_boosted
  FROM profiles p
  WHERE p.status = 'active'
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

REVOKE EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text) TO anon, authenticated;
