import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Customer = {
  id: string;
  name: string;
  cpf: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCPF(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function isValidCPF(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number) as number[];
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i]! * (len + 1 - i);
    const rest = (sum * 10) % 11 % 10;
    if (rest !== digits[len]) return false;
  }
  return true;
}

export function useCustomers(search = "") {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("id, name, cpf, phone, whatsapp, email, address, notes, created_at")
        .order("name", { ascending: true })
        .limit(200);
      const term = search.trim();
      if (term) {
        const digits = onlyDigits(term);
        const parts = [`name.ilike.%${term}%`];
        if (digits) {
          parts.push(`cpf.ilike.%${digits}%`);
          parts.push(`phone.ilike.%${digits}%`);
          parts.push(`whatsapp.ilike.%${digits}%`);
        }
        query = query.or(parts.join(","));
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
}

export type CustomerStats = {
  count: number;
  total: number;
  lastAt: string | null;
};

export function useCustomerStats(customerId: string | null) {
  return useQuery({
    queryKey: ["customer_stats", customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<CustomerStats> => {
      const { data, error } = await supabase
        .from("appointments")
        .select("scheduled_at, status, product_price, sale_amount, deposit_amount, payments")
        .eq("customer_id", customerId!)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const { saleTotal } = await import("@/lib/agenda");
      const total = rows
        .filter((r) => r.status === "concluido")
        .reduce((sum, r) => {
          const paid = saleTotal(
            (r.payments as never) ?? [],
            r.deposit_amount as number | null,
          );
          const value = paid || Number(r.sale_amount ?? r.product_price ?? 0) || 0;
          return sum + value;
        }, 0);
      return {
        count: rows.length,
        total,
        lastAt: rows[0]?.scheduled_at ?? null,
      };
    },
  });
}