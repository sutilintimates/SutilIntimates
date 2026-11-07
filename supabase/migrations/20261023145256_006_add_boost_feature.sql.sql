/*
# Add Boost Feature for NÉCTAR Platform (fix)

Adds profile_boosts table, activate_boost(), get_active_boost(),
and updates get_public_feed + get_dashboard_stats to include boost data.
*/

CREATE TABLE IF NOT EXISTS profile_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cost_charged numeric(10,2) NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 days'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_boosts_profile_id ON profile_boosts(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_boosts_expires_at ON profile_boosts(expires_at);

ALTER TABLE profile_boosts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profile_boosts TO authenticated;
GRANT INSERT ON profile_boosts TO service_role;

DROP POLICY IF EXISTS "owner_select_boosts" ON profile_boosts;
CREATE POLICY "owner_select_boosts" ON profile_boosts FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Drop functions with changed return types
DROP FUNCTION IF EXISTS get_public_feed(integer, integer, text, text);
DROP FUNCTION IF EXISTS get_dashboard_stats(uuid);
DROP FUNCTION IF EXISTS get_active_boost(uuid);

-- activate_boost
CREATE OR REPLACE FUNCTION activate_boost()
RETURNS TABLE (success boolean, message text, boost_expires timestamptz, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_cpc numeric(10,2);
  v_boost_cost numeric(10,2);
  v_new_balance numeric(10,2);
  v_existing_boost record;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Perfil não encontrado.'::text, now(), 0.00;
    RETURN;
  END IF;

  v_cpc := CASE v_profile.category
    WHEN 'standard' THEN 15.00
    WHEN 'mid' THEN 25.00
    WHEN 'vip' THEN 35.00
    ELSE 15.00
  END;

  v_boost_cost := v_cpc * 8;

  SELECT * INTO v_existing_boost
  FROM profile_boosts
  WHERE profile_id = auth.uid()
    AND is_active = true
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT false, ('Você já tem um destaque ativo até ' || to_char(v_existing_boost.expires_at, 'DD/MM/YYYY') || '.')::text, v_existing_boost.expires_at, v_profile.credits_balance;
    RETURN;
  END IF;

  IF v_profile.credits_balance < v_boost_cost THEN
    RETURN QUERY SELECT false, ('Saldo insuficiente. O destaque custa ' || v_boost_cost::text || ' (8 cliques).')::text, now(), v_profile.credits_balance;
    RETURN;
  END IF;

  v_new_balance := v_profile.credits_balance - v_boost_cost;
  v_expires := now() + interval '10 days';

  UPDATE profiles SET credits_balance = v_new_balance WHERE id = auth.uid();

  INSERT INTO profile_boosts (profile_id, cost_charged, starts_at, expires_at, is_active)
  VALUES (auth.uid(), v_boost_cost, now(), v_expires, true);

  RETURN QUERY SELECT true, 'Destaque ativado com sucesso!'::text, v_expires, v_new_balance;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION activate_boost() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION activate_boost() TO authenticated;

-- get_active_boost (output column renamed to avoid ambiguity)
CREATE OR REPLACE FUNCTION get_active_boost(p_profile_id uuid)
RETURNS TABLE (has_boost boolean, boost_expires timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT expires_at INTO v_rec
  FROM profile_boosts
  WHERE profile_id = p_profile_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_rec IS NOT NULL THEN
    RETURN QUERY SELECT true, v_rec.expires_at;
  ELSE
    RETURN QUERY SELECT false, NULL::timestamptz;
  END IF;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_active_boost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_active_boost(uuid) TO anon, authenticated;

-- get_public_feed (now with is_boosted column)
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
      + (p.rating_average * 10.0)
      + CASE WHEN p.credits_balance > 0 THEN LEAST(log(p.credits_balance + 1) * 15.0, 45.0) ELSE 0.0 END
      + (random() * 30.0)
    ) AS rank_score,
    EXISTS (
      SELECT 1 FROM profile_boosts pb
      WHERE pb.profile_id = p.id AND pb.is_active = true AND pb.expires_at > now()
    ) AS is_boosted
  FROM profiles p
  WHERE p.status = 'active'
    AND (p_city IS NULL OR p.city ILIKE '%' || p_city || '%')
    AND (p_category IS NULL OR p.category = p_category)
  ORDER BY rank_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_public_feed(integer, integer, text, text) TO anon, authenticated;

-- get_dashboard_stats (now with boost_expires_at)
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
    ), '[]'::jsonb),
    v_boost_expires;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;