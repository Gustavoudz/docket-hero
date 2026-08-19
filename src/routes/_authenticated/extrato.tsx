import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Receipt, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { TableRowsSkeleton } from "@/components/ListSkeleton";
import { useIncrementalList } from "@/hooks/useIncrementalList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, toCents } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/extrato")({
  head: () => ({
    meta: [
      { title: "Extrato de pagamentos — Legado Phones" },
      {
        name: "description",
        content:
          "Extrato completo dos pagamentos aprovados, com venda, aparelho, cliente e vendedor.",
      },
      { property: "og:title", content: "Extrato de pagamentos — Legado Phones" },
      {
        property: "og:description",
        content: "Todos os pagamentos recebidos por período, forma de pagamento e vendedor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExtratoPage,
});

const isoDay = (d: Date) => {
  const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
};

type PaymentRow = {
  id: string;
  method: string;
  gross_amount: number | null;
  installments: number | null;
  transaction_code: string | null;
  created_at: string;
  confirmed_at: string | null;
  sales: {
    id: string;
    sale_number: number;
    seller_id: string;
    customers: { name: string; phone: string | null; whatsapp: string | null } | null;
    inventory_items: { device_model: string; imei: string | null; serial_number: string | null } | null;
    appointments: { customer_name: string | null; customer_phone: string | null; device_model: string | null } | null;
  } | null;
};

async function fetchExtrato(from: string, to: string) {
  const start = `${from}T00:00:00-03:00`;
  const end = `${to}T23:59:59.999-03:00`;

  const [paymentsRes, profilesRes] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, method, gross_amount, installments, transaction_code, created_at, confirmed_at, sales!inner(id, sale_number, seller_id, customers(name, phone, whatsapp), inventory_items(device_model, imei, serial_number), appointments(customer_name, customer_phone, device_model))",
      )
      .eq("status", "aprovado")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const sellers: Record<string, string> = {};
  for (const p of profilesRes.data ?? []) sellers[p.id] = p.full_name || p.email || "—";

  const rows = ((paymentsRes.data ?? []) as unknown as PaymentRow[]).map((p) => {
    const sale = p.sales;
    const isAutoPix = p.method === "pix" && Boolean(p.transaction_code);
    return {
      id: p.id,
      createdAt: p.created_at,
      method: p.method,
      isAutoPix,
      installments: p.installments ?? 1,
      amountCents: toCents(p.gross_amount),
      transactionCode: p.transaction_code,
      saleNumber: sale?.sale_number ?? null,
      model: sale?.inventory_items?.device_model ?? sale?.appointments?.device_model ?? "—",
      imei: sale?.inventory_items?.imei ?? sale?.inventory_items?.serial_number ?? "—",
      customer: sale?.customers?.name ?? sale?.appointments?.customer_name ?? "—",
      phone:
        sale?.customers?.whatsapp ?? sale?.customers?.phone ?? sale?.appointments?.customer_phone ?? "—",
      sellerId: sale?.seller_id ?? "",
      seller: sale ? (sellers[sale.seller_id] ?? "—") : "—",
      saleId: sale?.id ?? "",
    };
  });

  return { rows, sellers };
}

type Row = Awaited<ReturnType<typeof fetchExtrato>>["rows"][number];

function methodLabel(r: Row) {
  if (r.isAutoPix) return "PIX automático";
  if (r.method === "pix") return "PIX manual";
  if (r.method === "debito") return "Débito";
  if (r.method === "credito") return `Crédito${r.installments > 1 ? ` ${r.installments}x` : ""}`;
  if (r.method === "dinheiro") return "Dinheiro";
  return r.method;
}

const METHOD_CLASS: Record<string, string> = {
  pix: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40",
  debito: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40",
  credito: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/40",
  dinheiro: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40",
};

function toCsv(rows: Row[]) {
  const head = [
    "Data/hora",
    "Forma de pagamento",
    "Valor",
    "Venda",
    "Modelo",
    "IMEI",
    "Cliente",
    "Telefone",
    "Vendedor",
    "Código PagBank",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      new Date(r.createdAt).toLocaleString("pt-BR"),
      methodLabel(r),
      (r.amountCents / 100).toFixed(2).replace(".", ","),
      r.saleNumber ? `#${r.saleNumber}` : "—",
      r.model,
      r.imei,
      r.customer,
      r.phone,
      r.seller,
      r.transactionCode ?? "",
    ]
      .map((v) => esc(String(v)))
      .join(";"),
  );
  return [head.map(esc).join(";"), ...lines].join("\n");
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass rounded-xl border border-border/20 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ExtratoPage() {
  const { role } = useAuth();
  const today = isoDay(new Date());
  const firstDay = isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const [method, setMethod] = useState("todos");
  const [seller, setSeller] = useState("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["extrato-pagamentos", from, to],
    enabled: role === "gerente",
    staleTime: 0,
    queryFn: () => fetchExtrato(from, to),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return all.filter((r) => {
      const okMethod =
        method === "todos" ||
        (method === "pix_auto" ? r.isAutoPix : method === "pix" ? r.method === "pix" && !r.isAutoPix : r.method === method);
      const okSeller = seller === "todos" || r.sellerId === seller;
      return okMethod && okSeller;
    });
  }, [data, method, seller]);

  const totals = useMemo(() => {
    const byMethod: Record<string, number> = {};
    let total = 0;
    const sales = new Set<string>();
    for (const r of rows) {
      total += r.amountCents;
      const key = methodLabel({ ...r, installments: 1 });
      byMethod[key] = (byMethod[key] ?? 0) + r.amountCents;
      if (r.saleId) sales.add(r.saleId);
    }
    return { total, byMethod, salesCount: sales.size };
  }, [rows]);

  const { visible, hasMore, sentinelRef } = useIncrementalList(rows, 40);

  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data?.rows ?? []) if (r.sellerId) map.set(r.sellerId, r.seller);
    return [...map.entries()];
  }, [data]);

  function exportCsv() {
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-pagamentos-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (role !== "gerente") {
    return (
      <AppShell>
        <AccessDenied message="O extrato financeiro é exclusivo do gerente." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Extrato de pagamentos</h1>
            <p className="text-sm text-muted-foreground">
              Todos os pagamentos aprovados, com venda, aparelho, cliente e vendedor.
            </p>
          </div>
        </header>

        <section className="glass grid gap-3 rounded-xl border border-border/20 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="pix_auto">PIX automático</SelectItem>
                <SelectItem value="pix">PIX manual</SelectItem>
                <SelectItem value="debito">Débito</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Vendedor</Label>
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {sellerOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={exportCsv} disabled={rows.length === 0} className="w-full gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Total recebido no período" value={formatCents(totals.total)} />
          <SummaryCard
            label="Vendas no período"
            value={String(totals.salesCount)}
            hint={`${rows.length} pagamento(s)`}
          />
          <div className="glass rounded-xl border border-border/20 p-4">
            <p className="text-xs text-muted-foreground">Por forma de pagamento</p>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.keys(totals.byMethod).length === 0 && (
                <li className="text-muted-foreground">—</li>
              )}
              {Object.entries(totals.byMethod).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{formatCents(v)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="glass rounded-xl border border-border/20 p-4">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <TableRowsSkeleton rows={6} cols={5} />
                </tbody>
              </table>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border/20 text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Data/hora</th>
                    <th className="py-2 pr-3">Forma</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 pr-3">Venda</th>
                    <th className="py-2 pr-3">Aparelho / IMEI</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2">Vendedor</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-border/10 last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          className={`border-0 ${r.isAutoPix ? "bg-primary/20 text-primary ring-1 ring-primary/40" : (METHOD_CLASS[r.method] ?? "")}`}
                        >
                          {r.isAutoPix && <Zap className="mr-1 h-3 w-3" />}
                          {methodLabel(r)}
                        </Badge>
                        {r.isAutoPix && r.transactionCode && (
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            PagBank: {r.transactionCode}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">
                        {formatCents(r.amountCents)}
                      </td>
                      <td className="py-2 pr-3">{r.saleNumber ? `#${r.saleNumber}` : "—"}</td>
                      <td className="py-2 pr-3">
                        <span>{r.model}</span>
                        <p className="font-mono text-[10px] text-muted-foreground">{r.imei}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <span>{r.customer}</span>
                        <p className="text-[10px] text-muted-foreground">{r.phone}</p>
                      </td>
                      <td className="py-2">{r.seller}</td>
                    </tr>
                  ))}
                  {hasMore && (
                    <tr ref={sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
                      <td colSpan={7} className="py-3 text-center text-xs text-muted-foreground">
                        Carregando mais pagamentos…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
