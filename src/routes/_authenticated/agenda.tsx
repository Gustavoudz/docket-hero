import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { AppointmentCard } from "@/components/AppointmentCard";
import { AppointmentForm } from "@/components/AppointmentForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  activeRecords,
  conversionRate,
  formatDateLabel,
  shiftDate,
  todayISO,
  type Appointment,
} from "@/lib/agenda";
import { fetchDayFinance } from "@/lib/finance";
import { allowedRecordTypes, canViewRecord, type RecordType } from "@/lib/permissions";
import { RecordTypePicker } from "@/components/RecordTypePicker";
import { AccessDenied } from "@/components/AccessDenied";

export const Route = createFileRoute("/_authenticated/agenda")({
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search['date'] === "string" ? { date: search['date'] } : {},
  head: () => ({
    meta: [
      { title: "Agenda do dia — Agenda da Loja" },
      { name: "description", content: "Agendamentos do dia, criação rápida e fechamento diário." },
      { property: "og:title", content: "Agenda do dia — Agenda da Loja" },
      {
        property: "og:description",
        content: "Agendamentos do dia, criação rápida e fechamento diário.",
      },
    ],
  }),
  component: AgendaPage,
});

type DaySummary = {
  total: number;
  completedCount: number;
  cancelledCount: number;
  totalCents: number;
  cancelReasons: string[];
};

const toCents = (v: unknown) =>
  v == null || Number.isNaN(Number(v)) ? 0 : Math.round(Number(v) * 100);

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Recalcula o dia em tempo real, direto do banco (nunca cache/snapshot). */
async function fetchDaySummary(date: string, attendantId: string): Promise<DaySummary> {
  const start = `${date}T00:00:00-03:00`;
  const end = `${date}T23:59:59.999-03:00`;
  const { data, error } = await supabase
    .from("appointments")
    .select("id, status, sale_amount, product_price, cancel_reason, scheduled_date, scheduled_at")
    .eq("attendant_id", attendantId)
    .neq("status", "legado")
    .or(
      `scheduled_date.eq.${date},and(scheduled_date.is.null,scheduled_at.gte.${start},scheduled_at.lte.${end})`,
    );
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const completed = rows.filter((r) => r.status === "concluido");
  const cancelled = rows.filter((r) => r.status === "cancelado");
  return {
    total: rows.length,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    totalCents: completed.reduce(
      (sum, r) => sum + toCents(r.sale_amount ?? r.product_price ?? 0),
      0,
    ),
    cancelReasons: cancelled.map((c) => c.cancel_reason ?? ""),
  };
}

function AgendaPage() {
  const { user, role } = useAuth();
  const { date: dateParam } = Route.useSearch();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dateParam ?? todayISO());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [closedSummary, setClosedSummary] = useState<DaySummary | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [newType, setNewType] = useState<RecordType>("agendamento");
  const [converting, setConverting] = useState<Appointment | null>(null);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", "day", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("scheduled_date", date)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return activeRecords((data ?? []) as unknown as Appointment[]);
    },
  });

  const mine = useMemo(
    () => appointments.filter((a) => a.attendant_id === user?.id),
    [appointments, user?.id],
  );
  const pending = mine.filter((a) => a.status === "pendente");
  const completed = mine.filter((a) => a.status === "concluido");
  const cancelled = mine.filter((a) => a.status === "cancelado");

  const { data: closure } = useQuery({
    queryKey: ["closure", date, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_closures")
        .select("*")
        .eq("closure_date", date)
        .eq("attendant_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: daySummary } = useQuery({
    queryKey: ["daySummary", date, user?.id, appointments.length],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    queryFn: () => fetchDaySummary(date, user!.id),
  });

  const { data: dayFinance } = useQuery({
    queryKey: ["dayFinance", date, user?.id, appointments.length],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    queryFn: () => fetchDayFinance(date, user!.id),
  });

  const closeDay = useMutation({
    mutationFn: async () => {
      if (pending.length > 0) {
        throw new Error(`${pending.length} agendamento(s) ainda estão pendentes`);
      }
      // Sempre recalcula em tempo real, direto do banco (sem cache/snapshot)
      const summary = await fetchDaySummary(date, user!.id);
      const payload = {
        attendant_id: user!.id,
        closure_date: date,
        total_appointments: summary.total,
        completed_count: summary.completedCount,
        cancelled_count: summary.cancelledCount,
        conversion_rate: conversionRate(summary.completedCount, summary.total),
        cancel_reasons: summary.cancelReasons,
      };
      const { error } = await supabase
        .from("day_closures")
        .upsert(payload, { onConflict: "attendant_id,closure_date" });
      if (error) throw new Error(error.message);
      return summary;
    },
    onSuccess: (summary) => {
      setClosedSummary(summary);
      queryClient.invalidateQueries({ queryKey: ["closure"] });
      queryClient.invalidateQueries({ queryKey: ["appointments", "day", date] });
      setSummaryOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const creatable = allowedRecordTypes(role);
  const visible = useMemo(
    () => appointments.filter((a) => canViewRecord(role, a, user?.id)),
    [appointments, role, user?.id],
  );

  const startNew = () => {
    setEditing(null);
    if (creatable.length === 1) {
      setNewType(creatable[0]!);
      setFormOpen(true);
      return;
    }
    setTypePickerOpen(true);
  };

  if (role && creatable.length === 0) {
    return (
      <AppShell>
        <AccessDenied message="Seu perfil não tem permissão para ver a agenda." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Dia anterior"
          onClick={() => setDate(shiftDate(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próximo dia"
          onClick={() => setDate(shiftDate(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold capitalize">{formatDateLabel(date)}</h1>
        <p className="text-sm text-muted-foreground">
          {visible.length} agendamento{visible.length === 1 ? "" : "s"} · {pending.length} pendente
          {pending.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {isLoading && <li className="text-sm text-muted-foreground">Carregando…</li>}
        {!isLoading && visible.length === 0 && (
          <li className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento neste dia.
          </li>
        )}
        {visible.map((a) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            onEdit={
              a.attendant_id === user?.id
                ? (item) => {
                    setEditing(item);
                    setFormOpen(true);
                  }
                : undefined
            }
            onConvert={(item) => {
              setEditing(null);
              setConverting(item);
              setNewType("venda");
              setFormOpen(true);
            }}
          />
        ))}
      </ul>

      <div className="mt-6 rounded-lg border bg-card p-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Fechamento do dia</p>
            <p className="text-xs text-muted-foreground">
              {closure
                ? `Dia fechado · ${daySummary?.completedCount ?? 0} venda(s) concluída(s) · ${formatCents(daySummary?.totalCents ?? 0)} faturado`
                : pending.length > 0
                  ? `Faltam ${pending.length} agendamento(s) sem status definido`
                  : "Tudo definido, pode fechar o dia"}
            </p>
          </div>
          <Button
            variant={pending.length > 0 ? "outline" : "default"}
            disabled={pending.length > 0 || mine.length === 0 || closeDay.isPending}
            onClick={() => closeDay.mutate()}
          >
            {closure ? "Refazer resumo" : "Fechar o dia"}
          </Button>
        </div>
        {pending.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {pending.map((p) => (
              <li key={p.id}>
                • {p.customer_name} — {p.device_model}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        size="lg"
        className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 shadow-lg"
        onClick={startNew}
      >
        <Plus className="mr-1 h-5 w-5" /> Novo
      </Button>

      <RecordTypePicker
        open={typePickerOpen}
        onOpenChange={setTypePickerOpen}
        onSelect={(t) => {
          setNewType(t);
          setTypePickerOpen(false);
          setFormOpen(true);
        }}
      />

      {formOpen && (
        <AppointmentForm
          key={editing?.id ?? converting?.id ?? `new-${newType}`}
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o);
            if (!o) setConverting(null);
          }}
          defaultDate={date}
          appointment={editing}
          convertFrom={editing ? null : converting}
          recordType={editing ? undefined : newType}
        />
      )}

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resumo do dia — {formatDateLabel(date)}</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total" value={(closedSummary ?? daySummary)?.total ?? mine.length} />
            <Stat label="Vendas concluídas" value={(closedSummary ?? daySummary)?.completedCount ?? completed.length} />
            <Stat
              label="Total faturado"
              value={formatCents((closedSummary ?? daySummary)?.totalCents ?? 0)}
            />
            <Stat label="Cancelados" value={(closedSummary ?? daySummary)?.cancelledCount ?? cancelled.length} />
            <Stat
              label="Conversão"
              value={`${conversionRate((closedSummary ?? daySummary)?.completedCount ?? completed.length, (closedSummary ?? daySummary)?.total ?? mine.length)}%`}
            />
          </dl>
          {((closedSummary ?? daySummary)?.cancelReasons.length ?? cancelled.length) > 0 && (
            <div>
              <p className="text-sm font-medium">Motivos de cancelamento</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {cancelled.map((c) => (
                  <li key={c.id}>
                    • {c.customer_name}: {c.cancel_reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-1">
            <p className="text-sm font-medium">Financeiro do dia</p>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Total recebido" value={formatCents(dayFinance?.receivedCents ?? 0)} />
              <Stat label="Líquido" value={formatCents(dayFinance?.netCents ?? 0)} />
              <Stat label="PIX" value={formatCents(dayFinance?.byMethodCents.pix ?? 0)} />
              <Stat label="Débito" value={formatCents(dayFinance?.byMethodCents.debito ?? 0)} />
              <Stat label="Crédito" value={formatCents(dayFinance?.byMethodCents.credito ?? 0)} />
              <Stat label="Taxas" value={formatCents(dayFinance?.feesCents ?? 0)} />
              <Stat label="Vendas pagas" value={dayFinance?.paidSales ?? 0} />
              <Stat label="Aguardando pagamento" value={dayFinance?.awaitingSales ?? 0} />
              <Stat
                label="Estornos/cancelamentos"
                value={dayFinance?.refundedSales ?? 0}
              />
            </dl>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}