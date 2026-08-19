import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/lib/settings";
import { formatBRL, formatTime, shiftDate, todayISO, type Appointment } from "@/lib/agenda";
import { RECORD_TYPE_LABEL, type RecordType } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico e auditoria — Agenda da Loja" },
      {
        name: "description",
        content: "Registros excluídos (status Legado) mantidos para auditoria do gerente.",
      },
      { property: "og:title", content: "Histórico e auditoria — Agenda da Loja" },
      {
        property: "og:description",
        content: "Registros excluídos (status Legado) mantidos para auditoria do gerente.",
      },
    ],
  }),
  component: HistoricoPage,
});

function HistoricoPage() {
  const { role } = useAuth();
  const [type, setType] = useState<"todos" | RecordType>("todos");
  const [from, setFrom] = useState(shiftDate(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const { data: profiles = [] } = useProfiles();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["appointments", "legado", from, to],
    enabled: role === "gerente",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("status", "legado")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Appointment[];
    },
  });

  const filtered = useMemo(
    () =>
      type === "todos"
        ? rows
        : rows.filter((r) => (r.record_type ?? "agendamento") === type),
    [rows, type],
  );

  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "Atendente";
  };

  if (role && role !== "gerente") {
    return (
      <AppShell>
        <AccessDenied message="O histórico de auditoria é exclusivo do gerente." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Histórico / Auditoria</h1>
        </header>
        <p className="text-sm text-muted-foreground">
          Registros excluídos continuam salvos aqui com o status <strong>Legado</strong>.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <select
              id="tipo"
              value={type}
              onChange={(e) => setType(e.target.value as "todos" | RecordType)}
              className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
            >
              <option value="todos">Todos</option>
              <option value="agendamento">Agendamento</option>
              <option value="venda">Venda</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="de">De</Label>
            <Input id="de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 backdrop-blur">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Modelo</th>
                <th className="px-3 py-2.5">Valor</th>
                <th className="px-3 py-2.5">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum registro excluído nesse período.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2.5">
                    {r.scheduled_date} · {formatTime(r.scheduled_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    {RECORD_TYPE_LABEL[(r.record_type ?? "agendamento") as RecordType]}
                  </td>
                  <td className="px-3 py-2.5">{r.customer_name}</td>
                  <td className="px-3 py-2.5">{r.device_model}</td>
                  <td className="px-3 py-2.5">
                    {r.product_price != null ? formatBRL(Number(r.product_price)) : "—"}
                  </td>
                  <td className="px-3 py-2.5">{nameOf(r.attendant_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
