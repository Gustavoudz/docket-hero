import { useQuery } from "@tanstack/react-query";
import {
  PackagePlus,
  CalendarCheck,
  CalendarX,
  BadgeCheck,
  RotateCcw,
  Wallet,
  Settings2,
  History,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/agenda";
import { useProfiles } from "@/lib/settings";
import {
  INVENTORY_STATUS_LABEL,
  itemLabel,
  useInventoryEvents,
  type InventoryItem,
} from "@/lib/inventory";

type Meta = { label: string; icon: LucideIcon; color: string };

const EVENT_META: Record<string, Meta> = {
  cadastro: { label: "Cadastrado", icon: PackagePlus, color: "#38bdf8" },
  reservado: { label: "Reservado", icon: CalendarCheck, color: "#f59e0b" },
  reserva_cancelada: { label: "Reserva cancelada", icon: CalendarX, color: "#ef4444" },
  vendido: { label: "Vendido", icon: BadgeCheck, color: "#22c55e" },
  reversao: { label: "Venda revertida", icon: RotateCcw, color: "#f97316" },
  custo: { label: "Custo alterado", icon: Wallet, color: "#a78bfa" },
  status_manual: { label: "Situação alterada manualmente", icon: Settings2, color: "#94a3b8" },
};

function metaOf(kind: string): Meta {
  return EVENT_META[kind] ?? { label: kind, icon: History, color: "#94a3b8" };
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InventoryHistory({
  item,
  onOpenChange,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: events = [], isLoading } = useInventoryEvents(item?.id);
  const { data: profiles = [] } = useProfiles();

  const appointmentIds = [...new Set(events.map((e) => e.appointment_id).filter(Boolean))] as string[];
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", "history", appointmentIds],
    enabled: appointmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, customer_name, sale_amount, product_price, cancel_reason")
        .in("id", appointmentIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const nameOf = (id: string | null) => {
    if (!id) return "Sistema";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "Usuário";
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Histórico do item</DialogTitle>
        </DialogHeader>

        {item && (
          <div className="rounded-md border bg-card p-3">
            <p className="text-sm font-medium">{itemLabel(item)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {INVENTORY_STATUS_LABEL[item.status]} · entrada em{" "}
              {new Date(`${item.entered_at}T00:00:00`).toLocaleDateString("pt-BR")}
            </p>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Carregando histórico…</p>}
        {!isLoading && events.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum evento registrado para este item ainda.
          </p>
        )}

        <ol className="relative space-y-4 border-l border-border/70 pl-5">
          {events.map((e) => {
            const meta = metaOf(e.kind);
            const Icon = meta.icon;
            const appt = appointments.find((a) => a.id === e.appointment_id);
            const details: string[] = [];
            if (appt?.customer_name) details.push(`Cliente: ${appt.customer_name}`);
            if (e.kind === "vendido") {
              const value = appt?.sale_amount ?? appt?.product_price;
              if (value != null) details.push(`Valor: ${formatBRL(Number(value))}`);
            }
            if (e.reason) details.push(e.reason);
            if (!e.reason && e.kind === "reserva_cancelada" && appt?.cancel_reason) {
              details.push(appt.cancel_reason);
            }
            return (
              <li key={e.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[30px] flex h-5 w-5 items-center justify-center rounded-full border border-background"
                  style={{ backgroundColor: meta.color }}
                >
                  <Icon className="h-3 w-3 text-black" />
                </span>
                <p className="text-sm font-medium" style={{ color: meta.color }}>
                  {meta.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatWhen(e.created_at)} · {nameOf(e.actor_id)}
                </p>
                {details.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{details.join(" · ")}</p>
                )}
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
