/*
# Referral program (indicações)

1. Referral code per advertiser
- New column `profiles.referral_code`: a permanent, unique 8-character code (A-F and 0-9) generated automatically for every profile, including existing ones.
- Advertisers can read their own code. Nobody can write it from the client.

2. New table `referrals`
- One row per referred advertiser (`referred_profile_id` is unique, so a new advertiser can only ever belong to one referrer).
- `status`: pending (waiting for a complete profile and an active ad), rewarded (credit paid), ineligible (cap reached).
- Stores the referrer's category and the reward amount at the moment the referral became valid, so later category changes never alter past rewards.
- A CHECK constraint blocks self-referral.
- Direct table access is revoked from anon and authenticated; all access goes through the functions below.

3. Functions
- `claim_referral(code)`: attributes the referral to a brand-new profile (created in the last 30 minutes, without prior attribution). Rejects unknown codes, self-referral, and reciprocal referrals. Never overwrites an existing attribution.
- `profile_is_complete(profile)`: name, description, cover, city, WhatsApp number and a positive price must be filled in.
- `try_release_referral_reward(profile_id)`: when the referred advertiser is complete and active, locks the referral and the referrer, enforces the cap of 5 rewarded referrals, credits the referrer's wallet with R$30 (standard), R$50 (mid) or R$70 (vip), records a paid transaction marked `REFERRAL:<referral id>` and marks the referral as rewarded. Repeated calls do nothing once rewarded.
- Trigger on profile updates of status or the qualifying fields runs the release check.
- `get_my_referral_summary()`: the advertiser's code, counters, earnings and per-referral stage.
- `get_admin_referrals()`: admin-only audit view of all referrals and rewards.

4. Security
- All reward credit is performed inside SECURITY DEFINER functions and never trusts client-supplied amounts.
- Internal functions are not executable by anon or authenticated.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

CREATE OR REPLACE FUNCTION public.assign_profile_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referral_code_format') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_format
      CHECK (referral_code ~ '^[A-F0-9]{8}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code_unique ON public.profiles (referral_code);

DROP TRIGGER IF EXISTS profiles_assign_referral_code ON public.profiles;
CREATE TRIGGER profiles_assign_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_profile_referral_code();

GRANT SELECT (referral_code) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'ineligible')),
  referrer_category text,
  reward_amount numeric(10,2),
  ineligible_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz,
  rewarded_at timestamptz,
  CONSTRAINT referrals_no_self_referral CHECK (referrer_profile_id <> referred_profile_id),
  CONSTRAINT referrals_rewarded_has_amount CHECK (status <> 'rewarded' OR reward_amount IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status ON public.referrals (referrer_profile_id, status);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referrals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.profile_is_complete(p public.profiles)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.is_admin = false
    AND btrim(coalesce(p.name, '')) <> ''
    AND btrim(coalesce(p.description, '')) <> ''
    AND btrim(coalesce(p.cover_url, '')) <> ''
    AND btrim(coalesce(p.city, '')) <> ''
    AND p.whatsapp_phone IS NOT NULL
    AND p.price_per_hour IS NOT NULL
    AND p.price_per_hour > 0;
$$;

CREATE OR REPLACE FUNCTION public.try_release_referral_reward(p_referred_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referred public.profiles%ROWTYPE;
  v_ref public.referrals%ROWTYPE;
  v_referrer_category text;
  v_referrer_cpc numeric(10,2);
  v_count integer;
  v_amount numeric(10,2);
BEGIN
  SELECT * INTO v_referred FROM public.profiles WHERE id = p_referred_id;
  IF NOT FOUND OR v_referred.status <> 'active' OR NOT public.profile_is_complete(v_referred) THEN
    RETURN;
  END IF;

  SELECT * INTO v_ref FROM public.referrals
  WHERE referred_profile_id = p_referred_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_ref.referrer_profile_id FOR UPDATE;
  SELECT category INTO v_referrer_category FROM public.profiles WHERE id = v_ref.referrer_profile_id;

  SELECT count(*) INTO v_count FROM public.referrals
  WHERE referrer_profile_id = v_ref.referrer_profile_id AND status = 'rewarded';

  IF v_count >= 5 THEN
    UPDATE public.referrals
    SET status = 'ineligible', ineligible_reason = 'limit_reached', evaluated_at = now()
    WHERE id = v_ref.id;
    RETURN;
  END IF;

  v_amount := CASE v_referrer_category WHEN 'mid' THEN 50.00 WHEN 'vip' THEN 70.00 ELSE 30.00 END;
  v_referrer_cpc := CASE v_referrer_category WHEN 'mid' THEN 25.00 WHEN 'vip' THEN 35.00 ELSE 15.00 END;

  UPDATE public.profiles
  SET credits_balance = credits_balance + v_amount,
      status = CASE WHEN status = 'exhausted' AND credits_balance + v_amount >= v_referrer_cpc THEN 'active' ELSE status END
  WHERE id = v_ref.referrer_profile_id;

  INSERT INTO public.transactions (user_id, amount, status, asaas_payment_id)
  VALUES (v_ref.referrer_profile_id, v_amount, 'paid', 'REFERRAL:' || v_ref.id::text);

  UPDATE public.referrals
  SET status = 'rewarded',
      reward_amount = v_amount,
      referrer_category = v_referrer_category,
      evaluated_at = now(),
      rewarded_at = now()
  WHERE id = v_ref.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_profile_referral_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.try_release_referral_reward(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_referral_reward ON public.profiles;
CREATE TRIGGER profiles_referral_reward
  AFTER UPDATE OF status, name, description, cover_url, city, whatsapp_phone, price_per_hour ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_referral_check();

CREATE OR REPLACE FUNCTION public.claim_referral(p_code text)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_me public.profiles%ROWTYPE;
  v_referrer public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'Sessão inválida.'::text;
    RETURN;
  END IF;

  IF v_code !~ '^[A-F0-9]{8}$' THEN
    RETURN QUERY SELECT false, 'Código de indicação inválido.'::text;
    RETURN;
  END IF;

  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Perfil ainda não criado.'::text;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_profile_id = v_uid) THEN
    RETURN QUERY SELECT false, 'Esta conta já possui uma indicação registrada.'::text;
    RETURN;
  END IF;

  IF v_me.created_at < now() - interval '30 minutes' THEN
    RETURN QUERY SELECT false, 'Conta já existente: a indicação não se aplica.'::text;
    RETURN;
  END IF;

  SELECT * INTO v_referrer FROM public.profiles WHERE referral_code = v_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Código de indicação não encontrado.'::text;
    RETURN;
  END IF;

  IF v_referrer.id = v_uid THEN
    RETURN QUERY SELECT false, 'Não é possível indicar a própria conta.'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referrer_profile_id = v_uid AND referred_profile_id = v_referrer.id
  ) THEN
    RETURN QUERY SELECT false, 'Indicação recíproca não permitida.'::text;
    RETURN;
  END IF;

  INSERT INTO public.referrals (referrer_profile_id, referred_profile_id, referral_code)
  VALUES (v_referrer.id, v_uid, v_code);

  PERFORM public.try_release_referral_reward(v_uid);

  RETURN QUERY SELECT true, 'Indicação registrada.'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_referral_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me public.profiles%ROWTYPE;
  v_per_referral numeric(10,2);
  v_rewarded integer;
  v_total numeric(10,2);
  v_items jsonb;
BEGIN
  SELECT * INTO v_me FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_per_referral := CASE v_me.category WHEN 'mid' THEN 50.00 WHEN 'vip' THEN 70.00 ELSE 30.00 END;

  SELECT count(*), COALESCE(sum(reward_amount), 0)
  INTO v_rewarded, v_total
  FROM public.referrals
  WHERE referrer_profile_id = v_me.id AND status = 'rewarded';

  SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT r.created_at,
           r.rewarded_at,
           r.reward_amount,
           r.ineligible_reason,
           CASE
             WHEN r.status = 'rewarded' THEN 'rewarded'
             WHEN r.status = 'ineligible' THEN 'ineligible'
             WHEN NOT public.profile_is_complete(p) THEN 'awaiting_profile'
             ELSE 'awaiting_approval'
           END AS stage
    FROM public.referrals r
    JOIN public.profiles p ON p.id = r.referred_profile_id
    WHERE r.referrer_profile_id = v_me.id
  ) x;

  RETURN jsonb_build_object(
    'code', v_me.referral_code,
    'category', v_me.category,
    'reward_per_referral', v_per_referral,
    'max_rewards', 5,
    'rewarded_count', v_rewarded,
    'remaining_rewards', GREATEST(5 - v_rewarded, 0),
    'total_earned', v_total,
    'potential_remaining', v_per_referral * GREATEST(5 - v_rewarded, 0),
    'referrals', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_referrals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('rewarded_count', 0, 'total_paid', 0, 'pending_count', 0, 'ineligible_count', 0, 'rows', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'rewarded_count', (SELECT count(*) FROM public.referrals WHERE status = 'rewarded'),
    'total_paid', (SELECT COALESCE(sum(reward_amount), 0) FROM public.referrals WHERE status = 'rewarded'),
    'pending_count', (SELECT count(*) FROM public.referrals WHERE status = 'pending'),
    'ineligible_count', (SELECT count(*) FROM public.referrals WHERE status = 'ineligible'),
    'rows', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT r.id, r.created_at, r.rewarded_at, r.status, r.reward_amount,
               r.referrer_category, r.ineligible_reason, r.referral_code,
               ref.name AS referrer_name, red.name AS referred_name, red.status AS referred_status
        FROM public.referrals r
        JOIN public.profiles ref ON ref.id = r.referrer_profile_id
        JOIN public.profiles red ON red.id = r.referred_profile_id
        ORDER BY r.created_at DESC
        LIMIT 200
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_profile_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_profile_referral_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_release_referral_reward(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profile_is_complete(public.profiles) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_referral_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_summary() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_referrals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_referrals() TO authenticated;
