import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentStatus } from "@/lib/agenda";

export type DeviceModel = { id: string; name: string; active: boolean; sort_order: number };
export type CancelReason = { id: string; label: string; active: boolean; sort_order: number };
export type AppointmentTag = {
  id: string;
  label: string;
  color: string;
  active: boolean;
  sort_order: number;
};
export type StatusColor = { status: AppointmentStatus; color: string };
export type AttendantColor = { user_id: string; color: string };

export const DEFAULT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  pendente: "#f59e0b",
  concluido: "#22c55e",
  cancelado: "#ef4444",
  legado: "#64748b",
  convertido: "#38bdf8",
};

/** Listas de configuração mudam pouco: ficam em cache na sessão e só
 *  recarregam quando algo é cadastrado/alterado (invalidateQueries). */
const CONFIG_CACHE = { staleTime: 30 * 60_000, gcTime: 60 * 60_000 } as const;

export function useDeviceModels() {
  return useQuery({
    queryKey: ["device_models"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_models")
        .select("id, name, active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeviceModel[];
    },
  });
}

export function useCancelReasons() {
  return useQuery({
    queryKey: ["cancel_reasons"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cancel_reasons")
        .select("id, label, active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CancelReason[];
    },
  });
}

export function useAppointmentTags() {
  return useQuery({
    queryKey: ["appointment_tags"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_tags")
        .select("id, label, color, active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentTag[];
    },
  });
}

export function useStatusColors() {
  const query = useQuery({
    queryKey: ["status_colors"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase.from("status_colors").select("status, color");
      if (error) throw error;
      return (data ?? []) as StatusColor[];
    },
  });
  const colors = { ...DEFAULT_STATUS_COLORS };
  for (const row of query.data ?? []) colors[row.status] = row.color;
  return colors;
}

export function useAttendantColors() {
  const query = useQuery({
    queryKey: ["attendant_colors"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendant_colors").select("user_id, color");
      if (error) throw error;
      return (data ?? []) as AttendantColor[];
    },
  });
  const map: Record<string, string> = {};
  for (const row of query.data ?? []) map[row.user_id] = row.color;
  return map;
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type UserRoleRow = { user_id: string; role: "gerente" | "atendente" | "vendedora" };

export function useUserRoles() {
  return useQuery({
    queryKey: ["user_roles"],
    ...CONFIG_CACHE,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as UserRoleRow[];
    },
  });
}
