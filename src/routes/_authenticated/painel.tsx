import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { AppointmentCard } from "@/components/AppointmentCard";
import { InventoryTurnover } from "@/components/InventoryTurnover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { conversionRate, shiftDate, todayISO, type Appointment } from "@/lib/agenda";
import { formatBRL } from "@/lib/agenda";
import { isStale, useInventoryCosts, useInventoryItems, useStaleDays } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel do gerente — Agenda da Loja" },
      {
        name: "description",
        content: "Visão consolidada de agendamentos por atendente e período.",
      },
      { property: "og:title", content: "Painel do gerente — Agenda da Loja" },
      {
        property: "og:description",
        content: "Visão consolidada de agendamentos por atendente e período.",
      },
    ],
  }),
  component: PainelPage,
});

function PainelPage() {
  const { role } = useAuth();
  const [from, setFrom] = useState(shiftDate(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [attendant, setAttendant] = useState("todas");
  const isGerente = role === "gerente";
  const { data: inventory = [] } = useInventoryItems();
  const inventoryCosts = useInventoryCosts(isGerente);
  const staleDays = useStaleDays();
  const staleItems = inventory.filter((i) => isStale(i, staleDays));
  const staleCost = staleItems.reduce((sum, i) => sum + (inventoryCosts[i.id] ?? 0), 0);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", "range", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return activeRecords((data ?? []) as unknown as Appointment[]);
    },
  });

  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "Atendente";
  };

  const filtered = useMemo(
    () => (attendant === "todas" ? appointments : appointments.filter((a) => a.attendant_id === attendant)),
    [appointments, attendant],
  );

  const completed = filtered.filter((a) => a.status === "concluido").length;
  const cancelled = filtered.filter((a) => a.status === "cancelado");
  const pending = filtered.filter((a) => a.status === "pendente").length;

  const topReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cancelled) {
      const key = (c.cancel_reason ?? "").trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [cancelled]);

  if (role && role !== "gerente") {
    return (
      <AppShell>
        <AccessDenied message="Este painel é exclusivo do gerente." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-lg font-semibold">Painel do gerente</h1>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">De</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Até</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attendant">Atendente</Label>
          <select
            id="attendant"
            value={attendant}
            onChange={(e) => setAttendant(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
          >
            <option value="todas">Todas</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={filtered.length} />
        <Stat label="Concluídos" value={completed} />
        <Stat label="Cancelados" value={cancelled.length} />
        <Stat label="Conversão" value={`${conversionRate(completed, filtered.length)}%`} />
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{pending} ainda pendente(s) no período.</p>

      <section className="mt-5 rounded-lg border border-amber-500/60 bg-card p-3 backdrop-blur-xl">
        <h2 className="text-sm font-medium">Estoque parado</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Itens disponíveis há mais de {staleDays} dias.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Stat label="Itens parados" value={staleItems.length} />
          <Stat label="Custo parado" value={formatBRL(staleCost)} />
        </div>
      </section>

      <InventoryTurnover />

      {topReasons.length > 0 && (
        <section className="mt-5 rounded-lg border bg-card p-3 backdrop-blur-xl">
          <h2 className="text-sm font-medium">Motivos de cancelamento mais comuns</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {topReasons.map(([reason, count]) => (
              <li key={reason} className="flex justify-between gap-3">
                <span className="truncate">{reason}</span>
                <span className="font-medium text-foreground">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-6 text-sm font-medium">Agendamentos do período</h2>
      <ul className="mt-2 space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento no período selecionado.
          </li>
        )}
        {filtered.map((a) => (
          <AppointmentCard key={a.id} appointment={a} attendantName={nameOf(a.attendant_id)} />
        ))}
      </ul>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card p-3 backdrop-blur-xl">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}