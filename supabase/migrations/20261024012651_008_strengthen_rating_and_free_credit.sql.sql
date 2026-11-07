/*
# Strengthen rating influence in feed ranking + grant free welcome credit

1. Increases rating_average weight from x10 to x20
2. Adds bonus for review count (up to 20 points for 10+ reviews)
3. Creates claim_free_welcome_credit() function that grants 1 free click
   based on the profile's category cost-per-click, only once per profile.
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
      ) THEN 100.0 ELSE 0.0 END
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

-- ============================================================
-- Free welcome credit function
-- ============================================================

CREATE OR REPLACE FUNCTION claim_free_welcome_credit()
RETURNS TABLE (success boolean, message text, credit_amount numeric, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_cpc numeric;
  v_already_claimed boolean;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Perfil não encontrado.'::text, 0.00::numeric, 0.00::numeric;
    RETURN;
  END IF;

  -- Check if already claimed (credits_balance was set to free credit amount
  -- and there are no transactions)
  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE user_id = auth.uid() AND status = 'paid'
  ) INTO v_already_claimed;

  -- If they already have a positive balance from a paid transaction, don't grant
  IF v_already_claimed AND v_profile.credits_balance > 0 THEN
    RETURN QUERY SELECT false, 'Crédito de boas-vindas já utilizado.'::text, 0.00::numeric, v_profile.credits_balance;
    RETURN;
  END IF;

  -- Also check a flag in transactions for the free credit
  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE user_id = auth.uid()
    AND asaas_payment_id = 'FREE_WELCOME_CREDIT'
  ) INTO v_already_claimed;

  IF v_already_claimed THEN
    RETURN QUERY SELECT false, 'Crédito de boas-vindas já resgatado.'::text, 0.00::numeric, v_profile.credits_balance;
    RETURN;
  END IF;

  -- Determine CPC based on category
  v_cpc := CASE v_profile.category
    WHEN 'standard' THEN 15.00
    WHEN 'mid' THEN 25.00
    WHEN 'vip' THEN 35.00
    ELSE 15.00
  END;

  -- Grant the free credit
  UPDATE profiles
  SET credits_balance = credits_balance + v_cpc,
      status = CASE WHEN credits_balance + v_cpc > 0 THEN 'active' ELSE status END
  WHERE id = auth.uid();

  -- Record the transaction for tracking
  INSERT INTO transactions (user_id, amount, status, asaas_payment_id)
  VALUES (auth.uid(), v_cpc, 'paid', 'FREE_WELCOME_CREDIT');

  RETURN QUERY SELECT true, 'Crédito de boas-vindas concedido!'::text, v_cpc, v_profile.credits_balance + v_cpc;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_free_welcome_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_free_welcome_credit() TO authenticated;
