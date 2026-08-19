import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Clock, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, toCents } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Legado Phones" },
      {
        name: "description",
        content:
          "Faturamento, lucro calculado e valores confirmados na conferência PagBank (D+1) por período.",
      },
      { property: "og:title", content: "Financeiro — Legado Phones" },
      {
        property: "og:description",
        content: "Resumo financeiro por período com faturamento, lucro, taxas e comissões.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

type PeriodKey = "hoje" | "semana" | "mes" | "custom";

const isoDay = (d: Date) => {
  const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
};

function rangeFor(period: PeriodKey, from: string, to: string) {
  const today = new Date();
  if (period === "custom") return { from, to };
  if (period === "hoje") return { from: isoDay(today), to: isoDay(today) };
  if (period === "semana") {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return { from: isoDay(start), to: isoDay(today) };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: isoDay(start), to: isoDay(today) };
}

type SaleRow = {
  id: string;
  sale_number: number;
  created_at: string;
  total: number | null;
  appointment_id: string | null;
  customers: { name: string } | null;
  inventory_items: { device_model: string } | null;
  appointments: {
    profit_cents: number | null;
    device_model: string | null;
    customer_name: string | null;
    record_type: string | null;
    converted_from_appointment_id: string | null;
  } | null;
  payments:
    | {
        method: string;
        status: string;
        gross_amount: number | null;
        fee_amount: number | null;
        net_amount: number | null;
        confirmed_at: string | null;
      }[]
    | null;
};

type Reconciliation = "conferida" | "divergente" | "pendente";

async function fetchFinanceiro(from: string, to: string) {
  const start = `${from}T00:00:00-03:00`;
  const end = `${to}T23:59:59.999-03:00`;

  const [salesRes, commissionsRes] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, sale_number, created_at, total, appointment_id, customers(name), inventory_items(device_model), appointments(profit_cents, device_model, customer_name, record_type, converted_from_appointment_id), payments(method, status, gross_amount, fee_amount, net_amount, confirmed_at)",
      )
      .eq("status", "pago")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false }),
    supabase
      .from("commissions")
      .select("amount, completed_at, status")
      .eq("status", "ativa")
      .gte("completed_at", start)
      .lte("completed_at", end),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (commissionsRes.error) throw new Error(commissionsRes.error.message);

  const rows = (salesRes.data ?? []) as unknown as SaleRow[];

  const sales = rows.map((s) => {
    const payments = (s.payments ?? []).filter((p) => p.status === "aprovado");
    const grossCents = payments.reduce((acc, p) => acc + toCents(p.gross_amount), 0);
    const feeCents = payments.reduce((acc, p) => acc + toCents(p.fee_amount), 0);
    const netCents = payments.reduce((acc, p) => acc + toCents(p.net_amount), 0);
    const checked = payments.length > 0 && payments.every((p) => Boolean(p.confirmed_at));
    const totalCents = toCents(s.total);
    // esperado = bruto da venda menos as taxas já identificadas no extrato
    const expectedNet = totalCents - feeCents;
    const diffCents = netCents - expectedNet;
    const reconciliation: Reconciliation = !checked
      ? "pendente"
      : diffCents === 0
        ? "conferida"
        : "divergente";

    return {
      id: s.id,
      saleNumber: s.sale_number,
      createdAt: s.created_at,
      customer: s.customers?.name ?? s.appointments?.customer_name ?? "—",
      model: s.inventory_items?.device_model ?? s.appointments?.device_model ?? "—",
      methods: [...new Set(payments.map((p) => p.method))],
      totalCents,
      profitCents: s.appointments?.profit_cents ?? 0,
      grossCents,
      feeCents,
      netCents,
      diffCents,
      reconciliation,
      viaAppointment: Boolean(s.appointments?.converted_from_appointment_id) ||
        (Boolean(s.appointment_id) && s.appointments?.record_type === "agendamento"),
    };
  });

  const revenueCents = sales.reduce((acc, s) => acc + s.totalCents, 0);
  const profitCents = sales.reduce((acc, s) => acc + s.profitCents, 0);
  const confirmedNetCents = sales
    .filter((s) => s.reconciliation !== "pendente")
    .reduce((acc, s) => acc + s.netCents, 0);
  const feesCents = sales
    .filter((s) => s.reconciliation !== "pendente")
    .reduce((acc, s) => acc + s.feeCents, 0);
  const commissionsCents = (commissionsRes.data ?? []).reduce(
    (acc, c) => acc + toCents(c.amount),
    0,
  );

  const byDay = new Map<string, { day: string; faturamento: number; lucro: number }>();
  for (const s of sales) {
    const day = s.createdAt.slice(0, 10);
    const entry = byDay.get(day) ?? { day, faturamento: 0, lucro: 0 };
    entry.faturamento += s.totalCents / 100;
    entry.lucro += s.profitCents / 100;
    byDay.set(day, entry);
  }
  const chart = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  return {
    sales,
    revenueCents,
    profitCents,
    confirmedNetCents,
    feesCents,
    commissionsCents,
    pendingCount: sales.filter((s) => s.reconciliation === "pendente").length,
    divergentCount: sales.filter((s) => s.reconciliation === "divergente").length,
    chart,
  };
}

const RECON_STYLE: Record<Reconciliation, { label: string; className: string }> = {
  conferida: {
    label: "Conferida",
    className: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40",
  },
  divergente: {
    label: "Divergente",
    className: "bg-red-500/15 text-red-400 ring-1 ring-red-500/40",
  },
  pendente: {
    label: "Pendente",
    className: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40",
  },
};

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Wallet;
  tone?: string;
}) {
  return (
    <div className="glass rounded-xl border border-border/20 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} />
        {label}
      </div>
      <p className={`mt-2 text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FinanceiroPage() {
  const { role } = useAuth();
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const today = isoDay(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const range = useMemo(() => rangeFor(period, from, to), [period, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro", range.from, range.to],
    enabled: role === "gerente",
    staleTime: 0,
    queryFn: () => fetchFinanceiro(range.from, range.to),
  });

  if (role !== "gerente") {
    return (
      <AppShell>
        <AccessDenied message="O financeiro é exclusivo do gerente." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Faturamento e lucro calculados internamente, com o líquido confirmado pela conferência
              PagBank (D+1).
            </p>
          </div>
        </header>

        <section className="glass flex flex-wrap items-center gap-2 rounded-xl border border-border/20 p-3">
          {(
            [
              ["hoje", "Hoje"],
              ["semana", "Semana"],
              ["mes", "Mês"],
              ["custom", "Personalizado"],
            ] as [PeriodKey, string][]
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={period === key ? "default" : "outline"}
              onClick={() => setPeriod(key)}
            >
              {label}
            </Button>
          ))}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={period === "custom" ? "default" : "outline"}
                className="gap-1.5"
                title="Escolher data específica"
              >
                <span aria-hidden className="text-base leading-none">
                  🗓️
                </span>
                {period === "custom"
                  ? from === to
                    ? new Date(`${from}T12:00:00`).toLocaleDateString("pt-BR")
                    : `${new Date(`${from}T12:00:00`).toLocaleDateString("pt-BR")} – ${new Date(`${to}T12:00:00`).toLocaleDateString("pt-BR")}`
                  : "Escolher data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={new Date(`${from}T12:00:00`)}
                selected={{
                  from: new Date(`${from}T12:00:00`),
                  to: new Date(`${to}T12:00:00`),
                }}
                onSelect={(r) => {
                  if (!r?.from) return;
                  const start = isoDay(r.from);
                  const finish = isoDay(r.to ?? r.from);
                  setFrom(start);
                  setTo(finish);
                  setPeriod("custom");
                  if (r.to) setCalendarOpen(false);
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <p className="border-t border-border/20 px-3 py-2 text-[11px] text-muted-foreground">
                Clique em um dia para ver só ele, ou em dois dias para um intervalo.
              </p>
            </PopoverContent>
          </Popover>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Faturamento bruto"
            value={formatCents(data?.revenueCents ?? 0)}
            hint="Vendas concluídas no período"
            icon={Wallet}
          />
          <SummaryCard
            label="Lucro calculado"
            value={formatCents(data?.profitCents ?? 0)}
            hint="Valor de venda − custo, desde a conclusão"
            icon={CheckCircle2}
            tone="text-emerald-400"
          />
          <SummaryCard
            label="Valor líquido confirmado"
            value={formatCents(data?.confirmedNetCents ?? 0)}
            hint={`${data?.pendingCount ?? 0} venda(s) ainda pendente(s) de conferência`}
            icon={Clock}
            tone={
              (data?.divergentCount ?? 0) > 0
                ? "text-red-400"
                : (data?.pendingCount ?? 0) > 0
                  ? "text-amber-400"
                  : "text-emerald-400"
            }
          />
          <SummaryCard
            label="Taxas pagas"
            value={formatCents(data?.feesCents ?? 0)}
            hint="Somente vendas já conferidas"
            icon={AlertTriangle}
            tone="text-red-400"
          />
        </section>

        <section className="glass rounded-xl border border-border/20 p-4">
          <p className="text-xs text-muted-foreground">
            Comissões geradas no período (referência de custo operacional)
          </p>
          <p className="mt-1 text-lg font-semibold">{formatCents(data?.commissionsCents ?? 0)}</p>
        </section>

        <section className="glass rounded-xl border border-border/20 p-4">
          <h2 className="mb-3 text-sm font-medium">Vendas concluídas no período</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (data?.sales.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda concluída no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border/20 text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Data/hora</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Modelo</th>
                    <th className="py-2 pr-3">Pagamento</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 pr-3 text-right">Lucro</th>
                    <th className="py-2">Conferência</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.sales.map((s) => {
                    const style = RECON_STYLE[s.reconciliation];
                    return (
                      <tr key={s.id} className="border-b border-border/10 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          {new Date(s.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{s.customer}</span>
                          {s.viaAppointment && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300 ring-1 ring-sky-500/30">
                              <CalendarClock className="h-3 w-3" />
                              Via agendamento
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{s.model}</td>
                        <td className="py-2 pr-3 capitalize">
                          {s.methods.length ? s.methods.join(", ") : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right">{formatCents(s.totalCents)}</td>
                        <td className="py-2 pr-3 text-right text-emerald-400">
                          {formatCents(s.profitCents)}
                        </td>
                        <td className="py-2">
                          <Badge className={`border-0 ${style.className}`}>{style.label}</Badge>
                          {s.reconciliation === "divergente" && (
                            <span className="ml-2 text-xs text-red-400">
                              {s.diffCents > 0 ? "+" : ""}
                              {formatCents(s.diffCents)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
