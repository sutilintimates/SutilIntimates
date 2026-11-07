/*
# Add 'receiving' as valid webhook_status and add unique constraint on asaas_payment_id

## Overview
This migration ensures:
1. The `transactions.asaas_payment_id` column has a unique constraint, so no two transactions
   can ever be created for the same Asaas payment — a hard database-level guarantee
   that a payment is associated with exactly one advertiser.
2. Documentation note: webhook_status may temporarily be 'receiving' during the atomic
   credit-grant guard in the webhook handler.

## Changes
- Add UNIQUE constraint on `transactions(asaas_payment_id)` where it is not null.
  (Partial unique index — bonus credits with sentinel 'FREE_WELCOME_CREDIT' are excluded
  since multiple bonus transactions can share that sentinel value.)
- Add UNIQUE constraint on `asaas_payment_operations(asaas_payment_id)` where not null.
*/

-- Unique constraint on transactions.asaas_payment_id, excluding bonus sentinel
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_asaas_payment_id_unique
ON transactions (asaas_payment_id)
WHERE asaas_payment_id IS NOT NULL AND asaas_payment_id != 'FREE_WELCOME_CREDIT';

-- Unique constraint on asaas_payment_operations.asaas_payment_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ops_asaas_payment_id_unique
ON asaas_payment_operations (asaas_payment_id)
WHERE asaas_payment_id IS NOT NULL;
