export type AppointmentStatus = "pendente" | "concluido" | "cancelado";

export type PaymentEntry = {
  method: string;
  amount?: number | null;
  installments?: number | null;
  installment_value?: number | null;
};

export type Appointment = {
  id: string;
  attendant_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_instagram?: string | null;
  device_model: string;
  scheduled_at: string;
  scheduled_date: string;
  deposit_paid: boolean;
  deposit_amount?: number | null;
  payment_method?: string | null;
  installments?: number | null;
  installment_value?: number | null;
  payments?: PaymentEntry[] | null;
  product_price?: number | null;
  notes: string | null;
  status: AppointmentStatus;
  cancel_reason: string | null;
  completed_at: string | null;
  tag?: string | null;
  inventory_device_id?: string | null;
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro vivo" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
] as const;

export const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.value, p.label]),
);

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function paymentEntryTotal(p: PaymentEntry) {
  if (p.amount != null && Number(p.amount) > 0) return Number(p.amount);
  if (p.method === "credito" && p.installments && p.installment_value)
    return Number(p.installments) * Number(p.installment_value);
  return 0;
}

export function paymentsTotal(payments: PaymentEntry[] | null | undefined) {
  return (payments ?? []).reduce((sum, p) => sum + paymentEntryTotal(p), 0);
}

export function saleTotal(
  payments: PaymentEntry[] | null | undefined,
  depositAmount?: number | null,
) {
  return paymentsTotal(payments) + (Number(depositAmount) || 0);
}

export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d);
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

export function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function conversionRate(completed: number, total: number) {
  if (!total) return 0;
  return Math.round((completed / total) * 1000) / 10;
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return toISODate(date);
}

export function weekDays(startISO: string) {
  return Array.from({ length: 7 }, (_, i) => shiftDate(startISO, i));
}

export function shiftMonth(iso: string, months: number) {
  const [y, m] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1 + months, 1);
  return toISODate(date);
}

export function startOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return toISODate(new Date(y!, m!, 0));
}

/** Calendar grid (monday-first) covering the whole month of `iso`. */
export function monthGrid(iso: string) {
  const first = startOfMonth(iso);
  const last = endOfMonth(iso);
  const start = startOfWeek(first);
  const cells: string[] = [];
  let cursor = start;
  while (cursor <= last || cells.length % 7 !== 0) {
    cells.push(cursor);
    cursor = shiftDate(cursor, 1);
    if (cells.length > 42) break;
  }
  return cells;
}

export function formatMonthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function formatShortDay(iso: string) {
  return Number(iso.slice(8, 10));
}

export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];