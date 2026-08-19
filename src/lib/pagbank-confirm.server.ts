/**
 * Confirmação de PIX automático: reaproveita exatamente o mesmo registro em
 * public.payments usado no fluxo manual (triggers de venda/estoque continuam iguais).
 */
export async function confirmPixPayment(orderId: string, amount: number, chargeCode: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, status, gross_amount, sale_id")
    .eq("transaction_code", orderId)
    .eq("method", "pix")
    .maybeSingle();

  if (!payment) return { ok: false, reason: "pagamento não encontrado" };
  if (payment.status === "aprovado") return { ok: true, reason: "já aprovado" };
  if (payment.status !== "aguardando") return { ok: false, reason: `status ${payment.status}` };

  const value = amount > 0 ? amount : Number(payment.gross_amount);
  const { error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "aprovado",
      gross_amount: value,
      fee_amount: 0,
      net_amount: value,
      installment_value: value,
      authorization_code: chargeCode,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payment.id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, reason: "aprovado" };
}
