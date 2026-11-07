/*
 * Create Payment — Sutil Intimates
 *
 * Creates a payment charge in Asaas for credit recharge.
 * Generates a unique internal operation reference and sends it as externalReference.
 * Persists the Asaas customer ID and payment ID for unambiguous webhook matching.
 *
 * Auth: requires a valid Supabase JWT (verify_jwt = true).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreatePaymentRequest {
  amount: number;
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD";
  userEmail: string;
  userName?: string;
}

async function asaasErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  console.error("Asaas error:", res.status, text);
  try {
    const description = JSON.parse(text)?.errors?.[0]?.description;
    return typeof description === "string" && description ? description : fallback;
  } catch {
    return fallback;
  }
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

  try {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ============================================================
    // Auth: verify the caller's JWT
    // ============================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userSupabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, billingType = "PIX", userEmail, userName } = await req.json() as CreatePaymentRequest;

    // Validate input
    if (!amount || amount <= 0 || !userEmail) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Amount in cents for exact comparison
    const amountCents = Math.round(amount * 100);

    // ============================================================
    // Read Asaas config from app_config
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
      return new Response(JSON.stringify({
        error: "Asaas não configurado. O administrador precisa definir a chave da API no painel administrativo.",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const asaasHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
    };

    // ============================================================
    // Read the user's profile for cpfCnpj and existing asaas_customer_id
    // ============================================================
    const { data: profileData } = await supabase
      .from("profiles")
      .select("cpf_cnpj, asaas_customer_id, name")
      .eq("id", user.id)
      .maybeSingle();

    const cpfCnpj = profileData?.cpf_cnpj || "";
    const existingCustomerId = profileData?.asaas_customer_id || null;
    const profileName = profileData?.name || userName || userEmail.split("@")[0];

    if (!cpfCnpj) {
      return new Response(JSON.stringify({
        error: "CPF/CNPJ não cadastrado. Solicite à anunciante que informe seu CPF ou CNPJ antes de recarregar.",
        code: "MISSING_CPF_CNPJ",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // Generate unique operation reference
    // ============================================================
    const operationRef = `SUTIL-${user.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // ============================================================
    // Step 1: Create or reuse customer in Asaas
    // ============================================================
    let customerId: string;

    if (existingCustomerId) {
      // Verify the existing customer still exists in Asaas
      const verifyRes = await fetch(`${ASAAS_API_URL}/customers/${existingCustomerId}`, {
        method: "GET",
        headers: asaasHeaders,
      });
      if (verifyRes.ok) {
        customerId = existingCustomerId;
      } else {
        // Customer no longer exists — create a new one
        const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
          method: "POST",
          headers: asaasHeaders,
          body: JSON.stringify({
            name: profileName,
            email: userEmail,
            cpfCnpj,
            externalReference: user.id,
            notificationDisabled: true,
          }),
        });
        if (!customerRes.ok) {
          const message = await asaasErrorMessage(customerRes, "Falha ao criar cliente no Asaas");
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const customer = await customerRes.json();
        customerId = customer.id;
        // Save the new customer ID to the profile
        await supabase.from("profiles").update({ asaas_customer_id: customerId }).eq("id", user.id);
      }
    } else {
      // No existing customer — create a new one
      const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: "POST",
        headers: asaasHeaders,
        body: JSON.stringify({
          name: profileName,
          email: userEmail,
          cpfCnpj,
          externalReference: user.id,
          notificationDisabled: true,
        }),
      });

      if (!customerRes.ok) {
        const message = await asaasErrorMessage(customerRes, "Falha ao criar cliente no Asaas");
        return new Response(JSON.stringify({ error: message }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customer = await customerRes.json();
      customerId = customer.id;
      // Save the customer ID to the profile for future reuse
      await supabase.from("profiles").update({ asaas_customer_id: customerId }).eq("id", user.id);
    }

    // ============================================================
    // Step 2: Create payment with externalReference
    // ============================================================
    const dueDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const paymentBody: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value: amount,
      dueDate,
      description: "Recarga de créditos - Sutil Intimates",
      externalReference: operationRef,
    };

    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: asaasHeaders,
      body: JSON.stringify(paymentBody),
    });

    if (!paymentRes.ok) {
      const message = await asaasErrorMessage(paymentRes, "Falha ao criar cobrança no Asaas");
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await paymentRes.json();

    // ============================================================
    // Step 3: Create payment operation record (for unambiguous matching)
    // ============================================================
    const { error: opErr } = await supabase.from("asaas_payment_operations").insert({
      operation_reference: operationRef,
      user_id: user.id,
      expected_amount: amount,
      expected_amount_cents: amountCents,
      purpose: "credit_recharge",
      asaas_customer_id: customerId,
      asaas_payment_id: payment.id,
      status: "created",
    });

    if (opErr) {
      console.error("Failed to create payment operation record:", opErr);
    }

    // ============================================================
    // Step 4: Create transaction record with full association data
    // ============================================================
    const { error: txErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      amount,
      status: "pending",
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl || null,
      external_reference: operationRef,
      asaas_customer_id: customerId,
      webhook_status: "pending",
    });

    if (txErr) {
      console.error("Failed to create transaction record:", txErr);
    }

    // ============================================================
    // Step 5: Get PIX QR code if PIX
    // ============================================================
    let pixData = null;
    if (billingType === "PIX" && payment.id) {
      const pixRes = await fetch(`${ASAAS_API_URL}/payments/${payment.id}/pixQrCode`, {
        method: "GET",
        headers: asaasHeaders,
      });
      if (pixRes.ok) {
        pixData = await pixRes.json();
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      paymentId: payment.id,
      invoiceUrl: payment.invoiceUrl || null,
      pixQrCode: pixData?.encodedImage || null,
      pixCopyPaste: pixData?.payload || null,
      dueDate,
      operationReference: operationRef,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Create payment error:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
