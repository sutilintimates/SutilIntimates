/*
# Asaas Webhook Integration — Schema & Functions

## Overview
This migration implements the database layer for a production-grade Asaas webhook integration:
- Stores webhook events durably with idempotency protection.
- Tracks payment operations with external references for unambiguous payer matching.
- Manages the webhook authentication token securely.
- Provides admin-only RPCs for monitoring and configuration.

## 1. New Columns on `transactions`
- `external_reference` (text, nullable): internal unique ID sent to Asaas as `externalReference`.
- `asaas_customer_id` (text, nullable): the Asaas customer ID returned when creating a customer.
- `webhook_status` (text, default 'pending'): tracks the payment lifecycle from webhook events.
  Values: 'pending', 'confirmed', 'received', 'refunded', 'partially_refunded', 'refund_in_progress', 'overdue', 'deleted'.

## 2. New Table: `webhook_events`
Durable store for every Asaas webhook notification received.
- `id` (uuid PK)
- `event_id` (text, unique): the `id` field from the Asaas webhook payload — enforces idempotency.
- `event_type` (text): e.g. `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`.
- `payment_id` (text): Asaas payment ID from the event.
- `transaction_id` (uuid, nullable): FK to `transactions` if matched.
- `user_id` (uuid, nullable): the advertiser associated, if identified.
- `expected_amount` (numeric, nullable): the amount we expect from the matched transaction.
- `received_amount` (numeric, nullable): the amount reported in the webhook.
- `customer_id` (text, nullable): Asaas customer ID from the event.
- `external_reference` (text, nullable): the externalReference from the event.
- `processing_status` (text): 'persisted', 'processed', 'ignored', 'rejected', 'error', 'pending_retry'.
- `rejection_reason` (text, nullable): why the event was rejected or diverged.
- `raw_payload` (jsonb): the full event body for audit (never contains API keys or auth tokens).
- `received_at` (timestamptz, default now())
- `processed_at` (timestamptz, nullable)

## 3. New Table: `asaas_payment_operations`
Tracks each payment operation created in the `create-payment` edge function, with the full
association data needed for unambiguous matching.
- `id` (uuid PK)
- `operation_reference` (text, unique): the internal unique identifier sent to Asaas.
- `user_id` (uuid, not null): the advertiser who initiated the payment.
- `expected_amount` (numeric, not null): the amount in reais (stored also in cents for exact comparison).
- `expected_amount_cents` (bigint, not null): amount in cents for exact integer comparison.
- `purpose` (text, default 'credit_recharge')
- `asaas_customer_id` (text, nullable): Asaas customer ID created/found for this user.
- `asaas_payment_id` (text, nullable): Asaas payment ID returned by the API.
- `status` (text, default 'created'): 'created', 'confirmed', 'received', 'refunded', 'partially_refunded', 'failed'.

## 4. Security
- `webhook_events` and `asaas_payment_operations`: RLS enabled. No anon/authenticated policies — these
  are internal tables accessed only by the service role (edge functions) and admin RPCs. GRANT to
  `service_role` only.
- `transactions`: existing columns + grants remain. New columns are accessible to the service role.
  No additional grants needed — the existing `authenticated` grant covers SELECT of all columns.

## 5. Functions
- `get_webhook_token()`: admin-only SECURITY DEFINER that returns the webhook auth token from `app_config`.
- `set_webhook_token(p_token text)`: admin-only SECURITY DEFINER that sets the webhook auth token.
- `get_webhook_events(p_limit int, p_offset int)`: admin-only SECURITY DEFINER that returns recent webhook events for monitoring.
- `get_webhook_config()`: admin-only SECURITY DEFINER that returns the webhook URL, token, and Asaas API settings.
*/

-- ============================================================
-- 1. Add columns to transactions
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'external_reference') THEN
    ALTER TABLE transactions ADD COLUMN external_reference text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'asaas_customer_id') THEN
    ALTER TABLE transactions ADD COLUMN asaas_customer_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'webhook_status') THEN
    ALTER TABLE transactions ADD COLUMN webhook_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- ============================================================
-- 2. webhook_events table
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  payment_id text,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  user_id uuid,
  expected_amount numeric,
  received_amount numeric,
  customer_id text,
  external_reference text,
  processing_status text NOT NULL DEFAULT 'persisted',
  rejection_reason text,
  raw_payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON webhook_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id ON webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at DESC);

-- ============================================================
-- 3. asaas_payment_operations table
-- ============================================================

CREATE TABLE IF NOT EXISTS asaas_payment_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_reference text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  expected_amount numeric NOT NULL,
  expected_amount_cents bigint NOT NULL,
  purpose text NOT NULL DEFAULT 'credit_recharge',
  asaas_customer_id text,
  asaas_payment_id text,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asaas_payment_operations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON asaas_payment_operations TO service_role;

CREATE INDEX IF NOT EXISTS idx_payment_ops_user ON asaas_payment_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_ops_payment_id ON asaas_payment_operations(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_ops_reference ON asaas_payment_operations(operation_reference);

-- ============================================================
-- 4. Functions
-- ============================================================

-- get_webhook_token: admin-only, returns the webhook auth token
CREATE OR REPLACE FUNCTION get_webhook_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_token text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN
    RETURN '';
  END IF;
  SELECT value INTO v_token FROM app_config WHERE key = 'asaas_webhook_token';
  RETURN COALESCE(v_token, '');
END;
$$;

REVOKE EXECUTE ON FUNCTION get_webhook_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_webhook_token() TO authenticated;

-- set_webhook_token: admin-only, sets the webhook auth token
CREATE OR REPLACE FUNCTION set_webhook_token(p_token text)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN
    RETURN QUERY SELECT false, 'Acesso negado.'::text;
    RETURN;
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) < 32 THEN
    RETURN QUERY SELECT false, 'O token deve ter no mínimo 32 caracteres.'::text;
    RETURN;
  END IF;
  IF length(trim(p_token)) > 255 THEN
    RETURN QUERY SELECT false, 'O token deve ter no máximo 255 caracteres.'::text;
    RETURN;
  END IF;
  IF position(' ' IN p_token) > 0 THEN
    RETURN QUERY SELECT false, 'O token não pode conter espaços.'::text;
    RETURN;
  END IF;
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('asaas_webhook_token', p_token, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN QUERY SELECT true, 'Token do webhook atualizado com sucesso.'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_webhook_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_webhook_token(text) TO authenticated;

-- get_webhook_events: admin-only, returns recent webhook events for monitoring
CREATE OR REPLACE FUNCTION get_webhook_events(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE(
  ev_event_id text,
  ev_event_type text,
  ev_payment_id text,
  ev_transaction_id uuid,
  ev_user_id uuid,
  ev_profile_name text,
  ev_expected_amount numeric,
  ev_received_amount numeric,
  ev_customer_id text,
  ev_external_reference text,
  ev_processing_status text,
  ev_rejection_reason text,
  ev_received_at timestamptz,
  ev_processed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    we.event_id,
    we.event_type,
    we.payment_id,
    we.transaction_id,
    we.user_id,
    COALESCE(p.name, '') AS profile_name,
    we.expected_amount,
    we.received_amount,
    we.customer_id,
    we.external_reference,
    we.processing_status,
    we.rejection_reason,
    we.received_at,
    we.processed_at
  FROM webhook_events we
  LEFT JOIN profiles p ON p.id = we.user_id
  ORDER BY we.received_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_webhook_events(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_webhook_events(int, int) TO authenticated;

-- get_webhook_config: admin-only, returns webhook URL + token + Asaas API config for the admin panel
CREATE OR REPLACE FUNCTION get_webhook_config()
RETURNS TABLE(
  cfg_key text,
  cfg_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT key, value FROM app_config
  WHERE key IN ('asaas_api_key', 'asaas_api_url', 'asaas_pix_key', 'asaas_webhook_token')
  ORDER BY key;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_webhook_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_webhook_config() TO authenticated;
