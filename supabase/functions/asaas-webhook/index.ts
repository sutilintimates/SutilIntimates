/*
 * Asaas Webhook Handler — Sutil Intimates
 *
 * Receives POST notifications from Asaas v3 API.
 *
 * Asaas v3 webhook payload format:
 *   {
 *     "id": "evt_xxx",            // top-level event id (used for idempotency)
 *     "event": "PAYMENT_RECEIVED", // top-level event type string
 *     "dateCreated": "...",
 *     "payment": { "object": "payment", "id": "pay_xxx" }
 *   }
 *
 * The payment object in the webhook only contains "id". To verify amount,
 * customer, and externalReference, we fetch the full payment from the Asaas API.
 *
 * Flow:
 *  1. Validate asaas-access-token header.
 *  2. Parse event: top-level "id" (event id) and "event" (event type string).
 *  3. Idempotency: check if event_id already exists in webhook_events.
 *  4. Persist raw event to webhook_events (processing_status = 'persisted').
 *  5. Respond HTTP 200.
 *  6. Process: fetch full payment from Asaas API, match to transaction by payment_id,
 *     verify externalReference + customer + amount in cents, apply state machine.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, asaas-access-token",
};

// Events we handle
const HANDLED_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
]);

interface AsaasWebhookPayload {
  id: string;              // top-level event id
  event: string;           // top-level event type, e.g. "PAYMENT_RECEIVED"
  dateCreated?: string;
  payment: {
    object: string;
    id: string;            // Asaas payment id
  };
}

interface AsaasPaymentDetail {
  id: string;
  status: string;
  value: number;
  customer: string;
  externalReference?: string;
  billingType?: string;
  dueDate?: string;
  invoiceUrl?: string;
  description?: string;
  refundedValue?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // Step 1: Validate auth token from asaas-access-token header
  // ============================================================
  const authToken = req.headers.get("asaas-access-token");
  if (!authToken) {
    return new Response(JSON.stringify({ error: "Missing auth token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch the stored webhook token from app_config
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "asaas_webhook_token")
    .maybeSingle();

  if (tokenErr || !tokenRow?.value) {
    return new Response(JSON.stringify({ error: "Webhook token not configured" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Constant-time comparison to prevent timing attacks
  const storedToken = tokenRow.value;
  if (authToken.length !== storedToken.length) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let tokenMatch = true;
  for (let i = 0; i < authToken.length; i++) {
    if (authToken[i] !== storedToken[i]) tokenMatch = false;
  }
  if (!tokenMatch) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // Step 2: Parse the event
  // ============================================================
  let payload: AsaasWebhookPayload;
  try {
    payload = await req.json() as AsaasWebhookPayload;
  } catch (e) {
    console.error("Failed to parse JSON body:", e);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventId = payload.id;
  const eventType = payload.event;
  const paymentId = payload.payment?.id;

  if (!eventId) {
    return new Response(JSON.stringify({ error: "Missing event id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!eventType) {
    return new Response(JSON.stringify({ error: "Missing event type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!paymentId) {
    return new Response(JSON.stringify({ error: "Missing payment id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // Step 3: Idempotency check
  // ============================================================
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id, processing_status")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent && existingEvent.processing_status !== "error") {
    return new Response(JSON.stringify({
      ok: true,
      message: "Duplicate event, already processed",
      status: existingEvent.processing_status,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // Step 4: Persist the event (or reuse a previously failed one so Asaas retries can reprocess it)
  // ============================================================
  let webhookEventDbId: string;

  if (existingEvent) {
    webhookEventDbId = existingEvent.id;
  } else {
    const safePayload = { id: eventId, event: eventType, paymentId, dateCreated: payload.dateCreated };

    const { data: insertedEvent, error: insertErr } = await supabase
      .from("webhook_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        payment_id: paymentId,
        processing_status: "persisted",
        raw_payload: safePayload,
      })
      .select("id")
      .single();

    if (insertErr || !insertedEvent) {
      console.error("Failed to persist webhook event:", insertErr);
      return new Response(JSON.stringify({ error: "Persistence failure" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webhookEventDbId = insertedEvent.id;
  }

  // ============================================================
  // Step 5: Process the event
  // ============================================================
  await processEvent(supabase, webhookEventDbId, eventType, paymentId);

  return new Response(JSON.stringify({ ok: true, message: "Event received and processed" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ============================================================
// Event processing logic
// ============================================================
async function processEvent(
  supabase: ReturnType<typeof createClientType>,
  webhookEventDbId: string,
  eventType: string,
  paymentId: string,
): Promise<void> {
  const updateEvent = (
    status: string,
    reason: string | null,
    txId: string | null,
    userId: string | null,
    expectedAmount: number | null,
    receivedAmount: number | null,
  ) =>
    supabase
      .from("webhook_events")
      .update({
        processing_status: status,
        rejection_reason: reason,
        transaction_id: txId,
        user_id: userId,
        expected_amount: expectedAmount,
        received_amount: receivedAmount,
        processed_at: new Date().toISOString(),
      })
      .eq("id", webhookEventDbId);

  // If event is not one we handle, log as ignored
  if (!HANDLED_EVENTS.has(eventType)) {
    await updateEvent("ignored", `Evento não tratado: ${eventType}`, null, null, null, null);
    return;
  }

  try {
    // ============================================================
    // Fetch full payment details from Asaas API
    // ============================================================
    const { data: configData } = await supabase
      .from("app_config")
      .select("key, value");

    const config: Record<string, string> = {};
    for (const row of configData || []) {
      config[row.key] = row.value || "";
    }

    const ASAAS_API_URL = config["asaas_api_url"] || "https://sandbox.asaas.com/api/v3";
    const ASAAS_API_KEY = config["asaas_api_key"] || "";

    if (!ASAAS_API_KEY) {
      await updateEvent("error", "Chave da API Asaas não configurada", null, null, null, null);
      return;
    }

    const asaasHeaders: Record<string, string> = {
      "access_token": ASAAS_API_KEY,
    };

    const paymentDetailRes = await fetch(`${ASAAS_API_URL}/payments/${paymentId}`, {
      method: "GET",
      headers: asaasHeaders,
    });

    if (!paymentDetailRes.ok) {
      const errText = await paymentDetailRes.text();
      console.error("Failed to fetch payment detail from Asaas:", errText);
      await updateEvent("error", `Falha ao consultar pagamento na API Asaas (${paymentDetailRes.status})`, null, null, null, null);
      return;
    }

    const paymentDetail: AsaasPaymentDetail = await paymentDetailRes.json();
    const paidAmount = Number(paymentDetail.value) || 0;
    const customerId = paymentDetail.customer || null;
    const externalRef = paymentDetail.externalReference || null;

    // Update the webhook event with the fetched details
    await supabase
      .from("webhook_events")
      .update({
        received_amount: paidAmount,
        customer_id: customerId,
        external_reference: externalRef,
      })
      .eq("id", webhookEventDbId);

    // ============================================================
    // Match transaction by payment_id
    // ============================================================
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("asaas_payment_id", paymentId)
      .maybeSingle();

    if (txError || !transaction) {
      await updateEvent("rejected", "Transação não encontrada para o payment_id informado", null, null, null, paidAmount);
      console.error("Transaction not found for payment:", paymentId);
      return;
    }

    // ============================================================
    // Verify external_reference if both are available
    // ============================================================
    if (externalRef && transaction.external_reference && externalRef !== transaction.external_reference) {
      await updateEvent("rejected", "Divergência na referência externa (externalReference)", transaction.id, transaction.user_id, Number(transaction.amount), paidAmount);
      console.error("External reference mismatch:", externalRef, "vs", transaction.external_reference);
      return;
    }

    // ============================================================
    // Verify customer (payer) identity
    // ============================================================
    if (customerId && transaction.asaas_customer_id && customerId !== transaction.asaas_customer_id) {
      await updateEvent("rejected", "Divergência no ID do cliente (customer)", transaction.id, transaction.user_id, Number(transaction.amount), paidAmount);
      console.error("Customer mismatch:", customerId, "vs", transaction.asaas_customer_id);
      return;
    }

    // ============================================================
    // Verify amount in cents (exact integer comparison)
    // ============================================================
    const expectedCents = Math.round(Number(transaction.amount) * 100);
    const receivedCents = Math.round(paidAmount * 100);
    if (expectedCents !== receivedCents) {
      await updateEvent("rejected", `Divergência no valor: esperado ${expectedCents} centavos, recebido ${receivedCents} centavos`, transaction.id, transaction.user_id, Number(transaction.amount), paidAmount);
      console.error("Amount mismatch:", expectedCents, "vs", receivedCents);
      return;
    }

    const txId = transaction.id;
    const userId = transaction.user_id;
    const expectedAmount = Number(transaction.amount);

    // ============================================================
    // Event-specific state machine
    // ============================================================
    const currentWebhookStatus = transaction.webhook_status || "pending";
    const isFinalState = (state: string) => ["received", "refunded", "partially_refunded", "deleted"].includes(state);

    switch (eventType) {
      case "PAYMENT_CONFIRMED": {
        if (currentWebhookStatus === "received") {
          await updateEvent("ignored", "Pagamento já recebido, ignorando confirmação intermediária", txId, userId, expectedAmount, paidAmount);
          return;
        }
        await supabase.from("transactions").update({ webhook_status: "confirmed" }).eq("id", txId);
        await updateEvent("processed", null, txId, userId, expectedAmount, paidAmount);
        return;
      }

      case "PAYMENT_RECEIVED": {
        // This is the ONLY event that grants credits.
        // Idempotency: check current status before granting.
        if (currentWebhookStatus === "received") {
          await updateEvent("ignored", "Pagamento já processado — créditos já concedidos", txId, userId, expectedAmount, paidAmount);
          return;
        }

        // Race condition guard: atomically update webhook_status from its current
        // value to "receiving" using a filtered UPDATE. If another concurrent event
        // already changed it, this will update 0 rows and we abort.
        const { data: guardResult, error: guardErr } = await supabase
          .from("transactions")
          .update({ webhook_status: "receiving" })
          .eq("id", txId)
          .eq("webhook_status", currentWebhookStatus)
          .select("id")
          .maybeSingle();

        if (guardErr || !guardResult) {
          // Another event beat us to it — don't grant credits
          await updateEvent("ignored", "Pagamento já em processamento por outra notificação", txId, userId, expectedAmount, paidAmount);
          return;
        }

        // Mark transaction as paid and received
        const { error: updateTxErr } = await supabase
          .from("transactions")
          .update({ status: "paid", webhook_status: "received" })
          .eq("id", txId);

        if (updateTxErr) {
          // Revert to previous status so a retry can work
          await supabase.from("transactions").update({ webhook_status: currentWebhookStatus }).eq("id", txId);
          console.error("Failed to update transaction status:", updateTxErr);
          await updateEvent("error", "Falha ao atualizar status da transação", txId, userId, expectedAmount, paidAmount);
          return;
        }

        // Update payment operation if it exists
        await supabase
          .from("asaas_payment_operations")
          .update({ status: "received", updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", paymentId);

        // Add credits to the user's profile
        const { error: creditError } = await supabase.rpc("add_credits", {
          p_user_id: userId,
          p_amount: paidAmount,
        });

        if (creditError) {
          console.error("Failed to add credits:", creditError);
          await updateEvent("error", "Falha ao adicionar créditos — transação marcada como paga", txId, userId, expectedAmount, paidAmount);
          return;
        }

        console.log("Credits added for user:", userId, "amount:", paidAmount);
        await updateEvent("processed", null, txId, userId, expectedAmount, paidAmount);
        return;
      }

      case "PAYMENT_REFUNDED": {
        if (currentWebhookStatus === "refunded") {
          await updateEvent("ignored", "Estorno já processado", txId, userId, expectedAmount, paidAmount);
          return;
        }
        await supabase.from("transactions").update({ webhook_status: "refunded" }).eq("id", txId);
        await supabase
          .from("asaas_payment_operations")
          .update({ status: "refunded", updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", paymentId);
        await updateEvent("processed", "Estorno registrado — créditos podem necessitar ajuste manual", txId, userId, expectedAmount, paidAmount);
        return;
      }

      case "PAYMENT_PARTIALLY_REFUNDED": {
        if (currentWebhookStatus === "partially_refunded") {
          await updateEvent("ignored", "Estorno parcial já processado", txId, userId, expectedAmount, paidAmount);
          return;
        }
        await supabase.from("transactions").update({ webhook_status: "partially_refunded" }).eq("id", txId);
        await supabase
          .from("asaas_payment_operations")
          .update({ status: "partially_refunded", updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", paymentId);
        await updateEvent("processed", "Estorno parcial registrado — créditos podem necessitar ajuste manual", txId, userId, expectedAmount, paidAmount);
        return;
      }

      case "PAYMENT_REFUND_IN_PROGRESS": {
        await supabase.from("transactions").update({ webhook_status: "refund_in_progress" }).eq("id", txId);
        await updateEvent("processed", "Estorno em processamento", txId, userId, expectedAmount, paidAmount);
        return;
      }

      case "PAYMENT_OVERDUE": {
        if (isFinalState(currentWebhookStatus)) {
          await updateEvent("ignored", `Pagamento já em estado final (${currentWebhookStatus}), ignorando vencimento`, txId, userId, expectedAmount, paidAmount);
          return;
        }
        await supabase.from("transactions").update({ webhook_status: "overdue" }).eq("id", txId);
        await updateEvent("processed", "Cobrança vencida", txId, userId, expectedAmount, paidAmount);
        return;
      }

      case "PAYMENT_DELETED": {
        if (currentWebhookStatus === "received") {
          await updateEvent("ignored", "Pagamento já recebido, ignorando exclusão", txId, userId, expectedAmount, paidAmount);
          return;
        }
        await supabase.from("transactions").update({ webhook_status: "deleted" }).eq("id", txId);
        await supabase
          .from("asaas_payment_operations")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("asaas_payment_id", paymentId);
        await updateEvent("processed", "Cobrança removida", txId, userId, expectedAmount, paidAmount);
        return;
      }

      default: {
        await updateEvent("ignored", `Evento não tratado: ${eventType}`, txId, userId, expectedAmount, paidAmount);
        return;
      }
    }
  } catch (err) {
    console.error("Event processing error:", err);
    await supabase
      .from("webhook_events")
      .update({
        processing_status: "error",
        rejection_reason: err instanceof Error ? err.message : "Erro interno de processamento",
        processed_at: new Date().toISOString(),
      })
      .eq("id", webhookEventDbId);
  }
}

// Type placeholder to avoid circular type references
type createClientType = typeof import("npm:@supabase/supabase-js@2").createClient;
