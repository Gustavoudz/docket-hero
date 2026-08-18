export type AppointmentStatus = "pendente" | "concluido" | "cancelado";

export type Appointment = {
  id: string;
  attendant_id: string;
  customer_name: string;
  customer_phone: string | null;
  device_model: string;
  scheduled_at: string;
  scheduled_date: string;
  deposit_paid: boolean;
  notes: string | null;
  status: AppointmentStatus;
  cancel_reason: string | null;
  completed_at: string | null;
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

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