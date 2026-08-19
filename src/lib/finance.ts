import { supabase } from "@/integrations/supabase/client";

export type DayFinance = {
  receivedCents: number;
  byMethodCents: { pix: number; debito: number; credito: number };
  feesCents: number;
  netCents: number;
  paidSales: number;
  awaitingSales: number;
  refundedSales: number;
};

export const toCents = (v: unknown) =>
  v == null || Number.isNaN(Number(v)) ? 0 : Math.round(Number(v) * 100);

export function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dayRange(date: string) {
  return { start: `${date}T00:00:00-03:00`, end: `${date}T23:59:59.999-03:00` };
}

/** Resumo financeiro do dia, calculado em tempo real a partir de sales/payments. */
export async function fetchDayFinance(
  date: string,
  sellerId?: string | null,
): Promise<DayFinance> {
  const { start, end } = dayRange(date);

  let paymentsQuery = supabase
    .from("payments")
    .select("method, status, gross_amount, fee_amount, net_amount, created_at, sales!inner(seller_id)")
    .eq("status", "aprovado")
    .gte("created_at", start)
    .lte("created_at", end);
  if (sellerId) paymentsQuery = paymentsQuery.eq("sales.seller_id", sellerId);

  let salesQuery = supabase
    .from("sales")
    .select("id, status, created_at, updated_at, cancelled_at, seller_id")
    .gte("created_at", start)
    .lte("created_at", end);
  if (sellerId) salesQuery = salesQuery.eq("seller_id", sellerId);

  const [{ data: payments, error: pErr }, { data: sales, error: sErr }] = await Promise.all([
    paymentsQuery,
    salesQuery,
  ]);
  if (pErr) throw new Error(pErr.message);
  if (sErr) throw new Error(sErr.message);

  const result: DayFinance = {
    receivedCents: 0,
    byMethodCents: { pix: 0, debito: 0, credito: 0 },
    feesCents: 0,
    netCents: 0,
    paidSales: 0,
    awaitingSales: 0,
    refundedSales: 0,
  };

  for (const p of payments ?? []) {
    const gross = toCents(p.gross_amount);
    result.receivedCents += gross;
    result.feesCents += toCents(p.fee_amount);
    result.netCents += toCents(p.net_amount);
    const m = p.method as keyof DayFinance["byMethodCents"];
    if (m in result.byMethodCents) result.byMethodCents[m] += gross;
  }

  for (const s of sales ?? []) {
    if (s.status === "pago") result.paidSales += 1;
    else if (s.status === "aguardando_pagamento") result.awaitingSales += 1;
    else if (s.status === "cancelado" || s.status === "estornado") result.refundedSales += 1;
  }

  return result;
}
