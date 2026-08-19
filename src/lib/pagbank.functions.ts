import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Gera (ou reaproveita) uma cobrança PIX automática da PagBank para uma venda. */
export const createSalePixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { saleId: string }) => {
    if (!input?.saleId) throw new Error("Venda inválida");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { createPagbankPixOrder } = await import("@/lib/pagbank.server");
    const { supabase, userId } = context;

    const { data: sale, error } = await supabase
      .from("sales")
      .select("id, reference, total, status, customers(name, email, cpf)")
      .eq("id", data.saleId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sale) throw new Error("Venda não encontrada");
    if (sale.status === "cancelado" || sale.status === "estornado") {
      throw new Error("Esta venda não aceita novos pagamentos");
    }

    // Já existe um PIX automático aguardando? Reaproveita.
    const { data: pending } = await supabase
      .from("payments")
      .select("id, transaction_code, notes, gross_amount, status")
      .eq("sale_id", sale.id)
      .eq("method", "pix")
      .eq("status", "aguardando")
      .not("transaction_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const amount = Number(sale.total) || 0;
    if (amount <= 0) throw new Error("Valor da venda inválido");

    const origin = new URL(getRequest().url).origin;
    const notificationUrl = `${origin}/api/public/pagbank-webhook`;

    const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
    const charge = await createPagbankPixOrder({
      reference: sale.reference,
      amountCents: Math.round(amount * 100),
      description: `Venda ${sale.reference}`,
      notificationUrl,
      customer: { name: customer?.name, email: customer?.email, taxId: customer?.cpf },
    });

    let paymentId = pending?.[0]?.id ?? null;
    if (paymentId) {
      await supabase
        .from("payments")
        .update({ transaction_code: charge.orderId, gross_amount: amount, net_amount: amount })
        .eq("id", paymentId);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("payments")
        .insert({
          sale_id: sale.id,
          method: "pix",
          status: "aguardando",
          gross_amount: amount,
          fee_amount: 0,
          net_amount: amount,
          installments: 1,
          installment_value: amount,
          transaction_code: charge.orderId,
          notes: "PIX automático (PagBank)",
          confirmed_by: userId,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      paymentId = inserted.id;
    }

    return {
      paymentId,
      orderId: charge.orderId,
      qrText: charge.qrText,
      qrImageUrl: charge.qrImageUrl,
      amount,
    };
  });

/** Consulta a PagBank e confirma o pagamento caso já esteja pago (fallback do webhook). */
export const syncSalePixStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paymentId: string }) => {
    if (!input?.paymentId) throw new Error("Pagamento inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: payment } = await context.supabase
      .from("payments")
      .select("id, status, transaction_code")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) return { status: "desconhecido" as const };
    if (payment.status !== "aguardando" || !payment.transaction_code) {
      return { status: payment.status };
    }

    const { getPagbankOrder, findPaidCharge } = await import("@/lib/pagbank.server");
    const { confirmPixPayment } = await import("@/lib/pagbank-confirm.server");
    const order = await getPagbankOrder(payment.transaction_code);
    const paid = order ? findPaidCharge(order) : null;
    if (!paid) return { status: "aguardando" as const };
    await confirmPixPayment(payment.transaction_code, paid.amount, paid.code);
    return { status: "aprovado" as const };
  });
