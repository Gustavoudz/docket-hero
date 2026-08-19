import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Gera o PDF do recibo de uma venda concluída (atendente e gerente). */
export const getSaleReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { saleId: string }) => {
    if (!input?.saleId) throw new Error("Venda inválida");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { loadReceiptData, buildReceiptPdf } = await import("@/lib/receipt.server");
    const receipt = await loadReceiptData(context.supabase, { saleId: data.saleId });
    if (!receipt) throw new Error("Recibo não disponível para esta venda");
    const bytes = await buildReceiptPdf(receipt);
    return {
      number: receipt.number,
      token: receipt.token,
      customerEmail: receipt.customerEmail,
      fileName: `recibo-${String(receipt.number).padStart(4, "0")}.pdf`,
      pdfBase64: Buffer.from(bytes).toString("base64"),
    };
  });

/** Envia (ou reenvia) o recibo por e-mail para o cliente. */
export const sendSaleReceiptEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { saleId: string }) => {
    if (!input?.saleId) throw new Error("Venda inválida");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { loadReceiptData } = await import("@/lib/receipt.server");
    const receipt = await loadReceiptData(context.supabase, { saleId: data.saleId });
    if (!receipt) throw new Error("Recibo não disponível para esta venda");
    if (!receipt.customerEmail) return { sent: false, reason: "sem_email" as const };

    const origin = new URL(getRequest().url).origin;
    const link = `${origin}/api/public/recibo/${receipt.token}`;
    const { sendReceiptEmail } = await import("@/lib/receipt-email.server");
    const result = await sendReceiptEmail({
      to: receipt.customerEmail,
      storeName: receipt.store.name,
      customerName: receipt.customerName,
      number: receipt.number,
      link,
    });
    if (result.sent) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("receipts")
        .update({ sent_at: new Date().toISOString(), customer_email: receipt.customerEmail })
        .eq("public_token", receipt.token);
    }
    return result;
  });
