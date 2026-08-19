/**
 * Envio do recibo por e-mail. O PDF vai como link seguro (o envio gerenciado
 * não aceita anexos). Enquanto o domínio de e-mail da loja não estiver
 * configurado, a função responde sem enviar — a venda nunca é bloqueada.
 */
export async function sendReceiptEmail(params: {
  to: string;
  storeName: string;
  customerName: string;
  number: number;
  link: string;
}): Promise<{ sent: boolean; reason?: string; link: string }> {
  try {
    const mod: any = await import("@lovable.dev/email-js").catch(() => null);
    if (!mod?.sendEmail) {
      return { sent: false, reason: "email_nao_configurado", link: params.link };
    }
    await mod.sendEmail({
      to: params.to,
      subject: `Seu comprovante de compra — ${params.storeName}`,
      html: `<p>Olá, ${escapeHtml(params.customerName)}!</p>
<p>Segue o seu comprovante de compra (Recibo Nº ${String(params.number).padStart(4, "0")}) na ${escapeHtml(params.storeName)}.</p>
<p><a href="${params.link}">Baixar o recibo em PDF</a></p>
<p>Este documento é um recibo/comprovante de venda e não possui valor fiscal.</p>`,
    });
    return { sent: true, link: params.link };
  } catch (e) {
    return { sent: false, reason: (e as Error).message, link: params.link };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
