/** Helpers server-only para a Order API da PagBank (PIX). O token nunca sai do servidor. */
const PAGBANK_BASE = "https://api.pagseguro.com";

export type PixCharge = {
  orderId: string;
  qrText: string;
  qrImageUrl: string | null;
  amount: number;
};

function token() {
  const t = process.env["PAGBANK_API_TOKEN"];
  if (!t) throw new Error("PAGBANK_API_TOKEN não configurado no Cloud → Secrets");
  return t;
}

export async function createPagbankPixOrder(params: {
  reference: string;
  amountCents: number;
  description: string;
  notificationUrl: string;
  customer?: { name?: string | null; email?: string | null; taxId?: string | null };
}): Promise<PixCharge> {
  const digits = (params.customer?.taxId ?? "").replace(/\D/g, "");
  const body: Record<string, unknown> = {
    reference_id: params.reference,
    items: [
      {
        name: params.description.slice(0, 100),
        quantity: 1,
        unit_amount: params.amountCents,
      },
    ],
    qr_codes: [
      {
        amount: { value: params.amountCents },
        expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    notification_urls: [params.notificationUrl],
  };
  if (digits.length === 11 || digits.length === 14) {
    body["customer"] = {
      name: params.customer?.name || "Cliente",
      email: params.customer?.email || "cliente@example.com",
      tax_id: digits,
    };
  }

  const res = await fetch(`${PAGBANK_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error_messages?.[0]?.description ?? `Falha na PagBank (${res.status})`;
    throw new Error(msg);
  }
  const qr = json?.qr_codes?.[0];
  const image = (qr?.links ?? []).find((l: any) => l?.media === "image/png")?.href ?? null;
  if (!qr?.text) throw new Error("A PagBank não retornou o código PIX");
  return {
    orderId: String(json.id),
    qrText: String(qr.text),
    qrImageUrl: image,
    amount: params.amountCents / 100,
  };
}

/** Consulta o pedido na PagBank — fonte da verdade para confirmar o pagamento. */
export async function getPagbankOrder(orderId: string) {
  const res = await fetch(`${PAGBANK_BASE}/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token()}`, accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as any;
}

/** Encontra uma cobrança paga dentro do pedido, se houver. */
export function findPaidCharge(order: any): { amount: number; code: string } | null {
  const charge = (order?.charges ?? []).find((c: any) => c?.status === "PAID");
  if (!charge) return null;
  return {
    amount: Number(charge?.amount?.value ?? 0) / 100,
    code: String(charge?.id ?? order?.id ?? ""),
  };
}
