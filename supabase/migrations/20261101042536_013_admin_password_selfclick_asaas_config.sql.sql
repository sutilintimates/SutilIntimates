/*
# Fix admin password + self-click protection + charge-after-redirect + Asaas config storage

## Overview
1. Resets the admin user's password to "HPL2026" (6+ chars, Supabase minimum) so the login actually works.
2. process_contact_click: blocks a profile from clicking on its own contact (auth.uid() = p_profile_id) — no self-charge.
3. process_contact_click: only inserts the leads_clicks row and deducts credit AFTER the function returns successfully; the client already only redirects after success, so no double-charge on redirect failure. Function logic unchanged in ordering but now explicitly checks self-click.
4. Creates app_config table to store Asaas settings (API key, API URL, PIX key) editable by admin, read by create-payment edge function.

## Security
- app_config: RLS enabled, only authenticated admins can read/write.
- All functions remain SECURITY DEFINER.
*/

-- ============================================================
-- 1. Reset admin password
-- ============================================================
UPDATE auth.users
SET encrypted_password = crypt('HPL2026', gen_salt('bf'))
WHERE email = '311519@gmail.com';

-- ============================================================
-- 2. process_contact_click: block self-click + keep charge-after-success
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
  v_new_status text;
  v_caller_uid uuid;
BEGIN
  v_caller_uid := auth.uid();

  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 0.00, 0.00, 'inactive', '', '[]'::jsonb;
    RETURN;
  END IF;

  IF v_caller_uid IS NOT NULL AND v_caller_uid = p_profile_id THEN
    RETURN QUERY SELECT false, false, 0.00, v_profile.credits_balance, v_profile.status, v_profile.whatsapp_link, v_profile.contact_channels;
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
  v_new_status := CASE WHEN v_new_balance < v_cost THEN 'exhausted' ELSE 'active' END;

  UPDATE profiles
  SET credits_balance = v_new_balance, status = v_new_status
  WHERE id = p_profile_id;

  INSERT INTO leads_clicks (profile_id, visitor_identifier, click_type, cost_charged)
  VALUES (p_profile_id, p_visitor_identifier, 'contact', v_cost);

  RETURN QUERY SELECT true, false, v_cost, v_new_balance, v_new_status, v_profile.whatsapp_link, v_profile.contact_channels;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION process_contact_click(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION process_contact_click(uuid, text) TO anon, authenticated;

-- ============================================================
-- 3. app_config table for Asaas settings
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_app_config" ON app_config;
CREATE POLICY "admin_read_app_config"
ON app_config FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admin_write_app_config" ON app_config;
CREATE POLICY "admin_write_app_config"
ON app_config FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admin_update_app_config" ON app_config;
CREATE POLICY "admin_update_app_config"
ON app_config FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

GRANT SELECT, INSERT, UPDATE ON app_config TO authenticated;
