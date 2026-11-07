/*
# Protect advertiser CPF/CNPJ and add secure save/check functions

1. Summary
- Stops the public and signed-in app roles from reading the stored CPF/CNPJ and the Asaas customer ID.
- Adds two functions: one to check whether a document is saved, one to save it once.
- Locks the document once saved so it cannot be changed through the app.

2. Security changes
- Revokes table-wide SELECT on `profiles` from `anon` and `authenticated`, then re-grants SELECT only on the public profile columns.
- `cpf_cnpj` and `asaas_customer_id` are no longer readable by app roles. Edge functions use the service role and are unaffected.
- New `has_cpf_cnpj()` returns only true/false for the signed-in user.
- New `save_cpf_cnpj(text)` stores digits only (11 or 14), for the signed-in user only.
- New trigger blocks changing `cpf_cnpj` after it has been saved.

3. Important notes
- The functions are SECURITY DEFINER with a fixed search_path. They are callable only by `authenticated`.
- Trigger functions are not exposed to any API role.
*/

REVOKE SELECT ON profiles FROM anon, authenticated;

GRANT SELECT (
  id, name, description, cover_url, media_urls, price_per_hour, category,
  neighborhood, city, whatsapp_link, contact_channels, payment_identifier,
  credits_balance, status, rating_average, total_reviews, is_admin, created_at
) ON profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_cpf_cnpj()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND cpf_cnpj IS NOT NULL AND cpf_cnpj <> ''
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_cpf_cnpj() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_cpf_cnpj() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_cpf_cnpj(p_document text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_digits text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF length(v_digits) NOT IN (11, 14) THEN
    RAISE EXCEPTION 'invalid_document' USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET cpf_cnpj = v_digits
  WHERE id = v_uid AND (cpf_cnpj IS NULL OR cpf_cnpj = '');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_cpf_cnpj(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cpf_cnpj(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_cpf_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.cpf_cnpj IS NOT NULL AND OLD.cpf_cnpj <> ''
     AND NEW.cpf_cnpj IS DISTINCT FROM OLD.cpf_cnpj THEN
    RAISE EXCEPTION 'cpf_cnpj_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_cpf_cnpj() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_cpf_cnpj_trigger ON profiles;
CREATE TRIGGER protect_cpf_cnpj_trigger
BEFORE UPDATE OF cpf_cnpj ON profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_cpf_cnpj();
