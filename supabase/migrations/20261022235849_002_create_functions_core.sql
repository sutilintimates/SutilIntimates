/*
# Create Database Functions for I♡PUTs Platform (Part 1)

## Overview
Creates SECURITY DEFINER functions for feed, contact clicks, views, and reviews.
*/

-- ============================================================
-- get_public_feed: returns active profiles with democratic ranking
-- ============================================================
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
  rank_score double precision
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
      CASE WHEN p.created_at > now() - interval '7 days' THEN 50.0 ELSE 0.0 END
      + (p.rating_average * 10.0)
      + CASE WHEN p.credits_balance > 0 THEN LEAST(log(p.credits_balance + 1) * 15.0, 45.0) ELSE 0.0 END
      + (random() * 30.0)
    ) AS rank_score
  FROM profiles p
  WHERE p.status = 'active'
    AND (p_city IS NULL OR p.city ILIKE '%' || p_city || '%')
    AND (p_category IS NULL OR p.category = p_category)
  ORDER BY rank_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text) TO anon, authenticated;

-- ============================================================
-- process_contact_click: anti-spam + credit deduction
-- ============================================================
CREATE OR REPLACE FUNCTION process_contact_click(
  p_profile_id uuid,
  p_visitor_identifier text
)
RETURNS TABLE (
  success boolean,
  already_contacted boolean,
  cost_charged numeric,
  new_balance numeric,
  profile_status text,
  whatsapp_link text,
  contact_channels jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_existing_click leads_clicks%ROWTYPE;
  v_cost numeric(10,2);
  v_new_balance numeric(10,2);
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 0.00, 0.00, 'inactive', '', '[]'::jsonb;
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
    RETURN QUERY SELECT true, true, 0.00, v_profile.credits_balance, v_profile.status, v_profile.whatsapp_link, v_profile.contact_channels;
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
    RETURN QUERY SELECT false, false, 0.00, 0.00, 'exhausted', v_profile.whatsapp_link, v_profile.contact_channels;
    RETURN;
  END IF;

  v_new_balance := v_profile.credits_balance - v_cost;
  UPDATE profiles SET credits_balance = v_new_balance WHERE id = p_profile_id;

  IF v_new_balance < 15.00 THEN
    UPDATE profiles SET status = 'exhausted' WHERE id = p_profile_id;
  END IF;

  INSERT INTO leads_clicks (profile_id, visitor_identifier, click_type, cost_charged)
  VALUES (p_profile_id, p_visitor_identifier, 'contact', v_cost);

  RETURN QUERY SELECT true, false, v_cost, v_new_balance, v_profile.status, v_profile.whatsapp_link, v_profile.contact_channels;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION process_contact_click(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION process_contact_click(uuid, text) TO anon, authenticated;

-- ============================================================
-- record_profile_view: records a modal/profile view
-- ============================================================
CREATE OR REPLACE FUNCTION record_profile_view(
  p_profile_id uuid,
  p_visitor_identifier text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO leads_clicks (profile_id, visitor_identifier, click_type, cost_charged)
  VALUES (p_profile_id, p_visitor_identifier, 'view', 0.00);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_profile_view(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION record_profile_view(uuid, text) TO anon, authenticated;

-- ============================================================
-- submit_review: validated review with rating recalculation
-- ============================================================
CREATE OR REPLACE FUNCTION submit_review(
  p_profile_id uuid,
  p_visitor_identifier text,
  p_rating integer,
  p_comment text
)
RETURNS TABLE (success boolean, message text, new_rating_average numeric, new_total_reviews integer)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_contact_click boolean;
  v_avg numeric(3,2);
  v_count integer;
  v_existing_review reviews%ROWTYPE;
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN
    RETURN QUERY SELECT false, 'Avaliação inválida. Use 1 a 5 estrelas.'::text, 0.00, 0;
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM leads_clicks
    WHERE profile_id = p_profile_id
      AND visitor_identifier = p_visitor_identifier
      AND click_type = 'contact'
  ) INTO v_has_contact_click;

  IF NOT v_has_contact_click THEN
    RETURN QUERY SELECT false, 'Você precisa iniciar contato com este perfil antes de avaliar.'::text, 0.00, 0;
    RETURN;
  END IF;

  SELECT * INTO v_existing_review
  FROM reviews
  WHERE profile_id = p_profile_id
    AND visitor_identifier = p_visitor_identifier
  LIMIT 1;

  IF FOUND THEN
    UPDATE reviews SET rating = p_rating, comment = p_comment WHERE id = v_existing_review.id;
  ELSE
    INSERT INTO reviews (profile_id, visitor_identifier, rating, comment)
    VALUES (p_profile_id, p_visitor_identifier, p_rating, p_comment);
  END IF;

  SELECT ROUND(AVG(rating)::numeric, 2), COUNT(*)
  INTO v_avg, v_count
  FROM reviews WHERE profile_id = p_profile_id;

  UPDATE profiles
  SET rating_average = COALESCE(v_avg, 0.00),
      total_reviews = COALESCE(v_count, 0)
  WHERE id = p_profile_id;

  RETURN QUERY SELECT true, 'Avaliação enviada com sucesso!'::text, COALESCE(v_avg, 0.00), COALESCE(v_count, 0);
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_review(uuid, text, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION submit_review(uuid, text, integer, text) TO anon, authenticated;