import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/agenda";

export const todayForInventory = todayISO;

export type InventoryStatus = "disponivel" | "reservado" | "vendido" | "manutencao";

export type InventoryItem = {
  id: string;
  device_model: string;
  color: string | null;
  storage: string | null;
  apple_id: string;
  serial_number: string | null;
  imei: string | null;
  condition: "lacrado" | "seminovo";
  sale_price: number | null;
  notes: string | null;
  status: InventoryStatus;
  entered_at: string;
  sold_at: string | null;
  appointment_id: string | null;
  created_by: string | null;
};

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  manutencao: "Em manutenção",
};

export const INVENTORY_STATUS_COLOR: Record<InventoryStatus, string> = {
  disponivel: "#22c55e",
  reservado: "#f59e0b",
  vendido: "#94a3b8",
  manutencao: "#38bdf8",
};

export const INVENTORY_STATUSES: InventoryStatus[] = [
  "disponivel",
  "reservado",
  "vendido",
  "manutencao",
];

const ITEM_COLUMNS =
  "id, device_model, color, storage, apple_id, serial_number, imei, condition, sale_price, notes, status, entered_at, sold_at, appointment_id, created_by";

export function useInventoryItems() {
  return useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select(ITEM_COLUMNS)
        .order("entered_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as InventoryItem[];
    },
  });
}

/** Custos são visíveis apenas para o gerente (RLS). Retorna mapa item_id -> custo. */
export function useInventoryCosts(enabled = true) {
  const query = useQuery({
    queryKey: ["inventory_costs"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_costs").select("item_id, cost_price");
      if (error) throw new Error(error.message);
      return (data ?? []) as { item_id: string; cost_price: number }[];
    },
  });
  const map: Record<string, number> = {};
  for (const row of query.data ?? []) map[row.item_id] = Number(row.cost_price);
  return map;
}

/** Itens que podem ser vinculados a um agendamento daquele modelo. */
export function useAvailableItems(model: string, currentItemId?: string | null) {
  return useQuery({
    queryKey: ["inventory_items", "available", model, currentItemId ?? null],
    enabled: !!model,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select(ITEM_COLUMNS)
        .eq("device_model", model)
        .order("entered_at", { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as InventoryItem[];
      return rows.filter((i) => i.status === "disponivel" || i.id === currentItemId);
    },
  });
}

export function itemLabel(item: InventoryItem) {
  const bits = [item.device_model, item.color, item.storage].filter(Boolean).join(" · ");
  return `${bits} — ${item.apple_id}`;
}

export async function logInventoryEvent(input: {
  itemId: string;
  kind: string;
  reason?: string | null;
  appointmentId?: string | null;
  actorId?: string | null;
}) {
  await supabase.from("inventory_events").insert({
    item_id: input.itemId,
    kind: input.kind,
    reason: input.reason ?? null,
    appointment_id: input.appointmentId ?? null,
    actor_id: input.actorId ?? null,
  });
}