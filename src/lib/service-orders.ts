import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServiceOrder = {
  id: string;
  os_number: number;
  kind: string;
  status: string;
  device_model: string;
  total: number;
  public_token: string;
  opened_at: string;
  finished_at: string | null;
};

export const OS_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  finalizado: "Finalizado - aguardando retirada",
  entregue: "Entregue",
};

export function useCustomerServiceOrders(customerId: string | null) {
  return useQuery({
    queryKey: ["service_orders", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, os_number, kind, status, device_model, total, public_token, opened_at, finished_at")
        .eq("customer_id", customerId!)
        .order("opened_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ServiceOrder[];
    },
  });
}

/** Última venda paga do cliente — usada para abrir o recibo/contrato pelo menu. */
export function useLatestCustomerSale(customerId: string | null) {
  return useQuery({
    queryKey: ["customer_latest_sale", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, status, created_at")
        .eq("customer_id", customerId!)
        .in("status", ["pago", "aguardando_pagamento"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return (data?.[0] ?? null) as { id: string; status: string } | null;
    },
  });
}
