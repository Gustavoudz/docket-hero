import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [auditAction, setAuditAction] = useState<"todos" | string>("todos");
  const [auditFrom, setAuditFrom] = useState(shiftDate(todayISO(), -30));
  const [auditTo, setAuditTo] = useState(todayISO());

  const { data: auditRows = [], isLoading: auditLoading } = useQuery({
    queryKey: ["audit_logs", auditFrom, auditTo],
    enabled: role === "gerente",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .gte("created_at", `${auditFrom}T00:00:00`)
        .lte("created_at", `${auditTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const auditFiltered = useMemo(
    () => (auditAction === "todos" ? auditRows : auditRows.filter((r) => r.action === auditAction)),
    [auditRows, auditAction],
  );

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

        <Tabs defaultValue="legado" className="space-y-5">
          <TabsList>
            <TabsTrigger value="legado">Registros excluídos</TabsTrigger>
            <TabsTrigger value="acoes">Ações sensíveis</TabsTrigger>
          </TabsList>

          <TabsContent value="legado" className="space-y-5">
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
          </TabsContent>

          <TabsContent value="acoes" className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="acao">Tipo de ação</Label>
                <select
                  id="acao"
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                >
                  <option value="todos">Todas</option>
                  {Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-de">De</Label>
                <Input
                  id="audit-de"
                  type="date"
                  value={auditFrom}
                  onChange={(e) => setAuditFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-ate">Até</Label>
                <Input
                  id="audit-ate"
                  type="date"
                  value={auditTo}
                  onChange={(e) => setAuditTo(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 backdrop-blur">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Quando</th>
                    <th className="px-3 py-2.5">Ação</th>
                    <th className="px-3 py-2.5">Responsável</th>
                    <th className="px-3 py-2.5">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!auditLoading && auditFiltered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        Nenhuma ação sensível registrada nesse período.
                      </td>
                    </tr>
                  )}
                  {auditFiltered.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2.5">{AUDIT_ACTION_LABEL[r.action] ?? r.action}</td>
                      <td className="px-3 py-2.5">{r.actor_id ? nameOf(r.actor_id) : "Sistema"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {describeDetails(r.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  pagamento_aprovado: "Pagamento aprovado",
  pagamento_cancelado: "Pagamento cancelado",
  pagamento_estornado: "Pagamento estornado",
  venda_cancelada: "Venda cancelada",
  venda_estornada: "Venda estornada",
  permissao_alterada: "Permissão alterada",
};

const DETAIL_LABEL: Record<string, string> = {
  sale_id: "Venda",
  sale_number: "Venda nº",
  reference: "Referência",
  method: "Forma",
  gross_amount: "Bruto",
  net_amount: "Líquido",
  installments: "Parcelas",
  total: "Total",
  motivo: "Motivo",
  status_anterior: "Status anterior",
  status_novo: "Status novo",
  papel_anterior: "Papel anterior",
  papel_novo: "Papel novo",
};

function describeDetails(details: unknown) {
  if (!details || typeof details !== "object") return "—";
  const entries = Object.entries(details as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${DETAIL_LABEL[k] ?? k}: ${String(v)}`)
    .join(" · ");
}
