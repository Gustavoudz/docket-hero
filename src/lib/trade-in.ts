import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TradeInModel = {
  id: string;
  name: string;
  base_value: number;
  active: boolean;
  sort_order: number;
};

export type TradeInDefect = {
  id: string;
  label: string;
  discount: number;
  active: boolean;
  sort_order: number;
};

export function useTradeInModels() {
  return useQuery({
    queryKey: ["trade_in_models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_in_models")
        .select("id, name, base_value, active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ ...r, base_value: Number(r.base_value) })) as TradeInModel[];
    },
  });
}

export function useTradeInDefects() {
  return useQuery({
    queryKey: ["trade_in_defects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_in_defects")
        .select("id, label, discount, active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ ...r, discount: Number(r.discount) })) as TradeInDefect[];
    },
  });
}

export function tradeInValue(base: number, discounts: number[]) {
  return Math.max(0, base - discounts.reduce((sum, d) => sum + d, 0));
}
