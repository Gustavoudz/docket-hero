import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Scale } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, toCents } from "@/lib/finance";
import { AccessDenied } from "@/components/AccessDenied";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({
    meta: [
      { title: "Conciliação — Legado Phones" },
      {
        name: "description",
        content:
          "Confira vendas aguardando pagamento, divergências entre vendas pagas e pagamentos aprovados e itens de estoque fora de sincronia.",
      },
      { property: "og:title", content: "Conciliação — Legado Phones" },
      {
        property: "og:description",
        content:
          "Vendas em aberto, divergências financeiras e checagem de baixa de estoque em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConciliacaoPage,
});

type Row = {
  id: string;
  sale_number: number;
  reference: string;
  status: string;
  total: number | null;
  created_at: string;
  inventory_item_id: string | null;
};

async function fetchConciliacao(hours: number) {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

  const [awaiting, paid, payments] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, reference, status, total, created_at, inventory_item_id")
      .eq("status", "aguardando_pagamento")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true }),
    supabase
      .from("sales")
      .select("id, sale_number, reference, status, total, created_at, inventory_item_id")
      .eq("status", "pago")
      .order("created_at", { ascending: false }),
    supabase.from("payments").select("net_amount, status").eq("status", "aprovado"),
  ]);

  if (awaiting.error) throw new Error(awaiting.error.message);
  if (paid.error) throw new Error(paid.error.message);
  if (payments.error) throw new Error(payments.error.message);

  const paidRows = (paid.data ?? []) as Row[];
  const paidTotalCents = paidRows.reduce((s, r) => s + toCents(r.total), 0);
  const netTotalCents = (payments.data ?? []).reduce((s, p) => s + toCents(p.net_amount), 0);

  const itemIds = paidRows.map((r) => r.inventory_item_id).filter(Boolean) as string[];
  let mismatched: { sale: Row; itemStatus: string; model: string }[] = [];
  if (itemIds.length > 0) {
    const { data: items, error } = await supabase
      .from("inventory_items")
      .select("id, status, device_model")
      .in("id", itemIds);
    if (error) throw new Error(error.message);
    const map = new Map((items ?? []).map((i) => [i.id, i]));
    mismatched = paidRows
      .map((sale) => {
        const item = sale.inventory_item_id ? map.get(sale.inventory_item_id) : undefined;
        if (!item || item.status === "vendido") return null;
        return { sale, itemStatus: item.status, model: item.device_model };
      })
      .filter(Boolean) as { sale: Row; itemStatus: string; model: string }[];
  }

  return {
    awaiting: (awaiting.data ?? []) as Row[],
    paidCount: paidRows.length,
    paidTotalCents,
    netTotalCents,
    mismatched,
  };
}

function ConciliacaoPage() {
  const { role } = useAuth();
  const [hours, setHours] = useState(24);

  const { data, isLoading } = useQuery({
    queryKey: ["conciliacao", hours],
    enabled: role === "gerente",
    staleTime: 0,
    queryFn: () => fetchConciliacao(hours),
  });

  if (role !== "gerente") {
    return (
      <AppShell>
        <AccessDenied message="A conciliação é exclusiva do gerente." />
      </AppShell>
    );
  }

  const diff = (data?.paidTotalCents ?? 0) - (data?.netTotalCents ?? 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Scale className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Conciliação</h1>
            <p className="text-sm text-muted-foreground">
              Checagens financeiras sobre vendas e pagamentos já registrados.
            </p>
          </div>
        </header>

        <section className="glass rounded-xl border border-border/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-amber-400" />
              Vendas aguardando pagamento há mais de
              <Input
                type="number"
                min={1}
                value={hours}
                onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 w-20"
              />
              horas
            </h2>
            <Badge variant="outline">{data?.awaiting.length ?? 0}</Badge>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (data?.awaiting.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda em atraso de cobrança.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data!.awaiting.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/20 px-3 py-2"
                >
                  <span>
                    #{s.sale_number} · {s.reference}
                    <span className="ml-2 text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("pt-BR")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <strong>{formatCents(toCents(s.total))}</strong>
                    <Link to="/vendas" className="text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-xl border border-border/20 p-4">
          <h2 className="mb-3 text-sm font-medium">Vendas pagas × pagamentos aprovados</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-border/20 p-3">
              <dt className="text-xs text-muted-foreground">Vendas pagas</dt>
              <dd className="text-xl font-semibold">{data?.paidCount ?? 0}</dd>
            </div>
            <div className="rounded-md border border-border/20 p-3">
              <dt className="text-xs text-muted-foreground">Total das vendas pagas</dt>
              <dd className="text-xl font-semibold">{formatCents(data?.paidTotalCents ?? 0)}</dd>
            </div>
            <div className="rounded-md border border-border/20 p-3">
              <dt className="text-xs text-muted-foreground">Líquido dos pagamentos</dt>
              <dd className="text-xl font-semibold">{formatCents(data?.netTotalCents ?? 0)}</dd>
            </div>
          </dl>
          <p
            className={
              diff === 0
                ? "mt-3 flex items-center gap-2 text-sm text-emerald-400"
                : "mt-3 flex items-center gap-2 text-sm text-amber-400"
            }
          >
            {diff === 0 ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {diff === 0
              ? "Sem divergência entre vendas pagas e pagamentos aprovados."
              : `Divergência de ${formatCents(Math.abs(diff))} (taxas de cartão também geram diferença).`}
          </p>
        </section>

        <section className="glass rounded-xl border border-border/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Vendas pagas com estoque fora de "Vendido"</h2>
            <Badge variant="outline">{data?.mismatched.length ?? 0}</Badge>
          </div>
          {(data?.mismatched.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os itens vinculados a vendas pagas estão com baixa correta.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data!.mismatched.map(({ sale, itemStatus, model }) => (
                <li
                  key={sale.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 px-3 py-2"
                >
                  <span>
                    #{sale.sale_number} · {model}
                  </span>
                  <Badge variant="outline" className="text-amber-400">
                    {itemStatus}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
