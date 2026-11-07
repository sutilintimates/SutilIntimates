/*
# Add cpf_cnpj and asaas_customer_id to profiles

## Overview
The Asaas API requires a CPF or CNPJ to create a customer record. This migration
adds two columns to the `profiles` table:
- `cpf_cnpj` (text, nullable): the advertiser's CPF or CNPJ, collected before the
  first PIX recharge and reused for all subsequent payments.
- `asaas_customer_id` (text, nullable): the Asaas customer ID returned when creating
  the customer in Asaas. Stored so we can reuse the same customer for future recharges
  instead of creating duplicates.

## Security
- `cpf_cnpj` is sensitive personal data. It is only readable/writable by the profile owner
  (authenticated, via existing profiles RLS policies). The admin stats functions do not
  expose it. The create-payment edge function reads it via the service role key.
- `asaas_customer_id` is an internal identifier, not sensitive on its own.
- No new policies needed — the existing profiles RLS policies already cover SELECT/UPDATE
  for the owner. The service_role bypasses RLS for edge function access.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'cpf_cnpj') THEN
    ALTER TABLE profiles ADD COLUMN cpf_cnpj text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'asaas_customer_id') THEN
    ALTER TABLE profiles ADD COLUMN asaas_customer_id text;
  END IF;
END $$;
