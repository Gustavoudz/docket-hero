import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const COMMISSION_AMOUNT_DEFAULT = 50;

export type Commission = {
  id: string;
  seller_id: string;
  sale_appointment_id: string;
  amount: number;
  device_model: string | null;
  completed_at: string;
  status: "ativa" | "cancelada";
};

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function useCommissionAmount() {
  const query = useQuery({
    queryKey: ["app_settings", "commission_amount"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "commission_amount")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.value ?? String(COMMISSION_AMOUNT_DEFAULT);
    },
  });
  const parsed = Number(query.data);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : COMMISSION_AMOUNT_DEFAULT;
}

/** Comissões visíveis para o perfil logado (RLS já filtra vendedora). */
export function useCommissions() {
  return useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("id, seller_id, sale_appointment_id, amount, device_model, completed_at, status")
        .order("completed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((c) => ({ ...c, amount: Number(c.amount) })) as Commission[];
    },
  });
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - day);
  return x;
}
export function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function sumBetween(list: Commission[], from: Date, to: Date) {
  return list
    .filter((c) => c.status === "ativa")
    .filter((c) => {
      const t = new Date(c.completed_at).getTime();
      return t >= from.getTime() && t < to.getTime();
    })
    .reduce((acc, c) => acc + c.amount, 0);
}

export function periodTotals(list: Commission[], ref: Date) {
  const dayStart = startOfDay(ref);
  const weekStart = startOfWeek(ref);
  const monthStart = startOfMonth(ref);
  return {
    day: sumBetween(list, dayStart, addDays(dayStart, 1)),
    week: sumBetween(list, weekStart, addDays(weekStart, 7)),
    month: sumBetween(list, monthStart, addMonths(monthStart, 1)),
  };
}

export function groupByDay(list: Commission[]) {
  const map = new Map<string, Commission[]>();
  for (const c of list) {
    const key = new Date(c.completed_at).toISOString().slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({
      day,
      items: items.sort(
        (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
      ),
      total: items.filter((i) => i.status === "ativa").reduce((acc, i) => acc + i.amount, 0),
    }));
}
