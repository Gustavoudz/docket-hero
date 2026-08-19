import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ReceiptActions } from "@/components/ReceiptActions";
import { formatBRL, toISODate } from "@/lib/agenda";

export const Route = createFileRoute("/_authenticated/recibos")({
  head: () => ({
    meta: [
      { title: "Recibos — Legado Phones" },
      {
        name: "description",
        content: "Lista de recibos de vendas concluídas, com visualização, download e reenvio por e-mail.",
      },
      { property: "og:title", content: "Recibos — Legado Phones" },
      {
        property: "og:description",
        content: "Lista de recibos de vendas concluídas, com visualização, download e reenvio por e-mail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecibosPage,
});

type SaleJoin = {
  sale_number: number;
  reference: string;
  status: string;
  total: number;
  created_at: string;
  customers: { name: string | null } | null;
  inventory_items: { device_model: string | null; imei: string | null; serial_number: string | null } | null;
  appointments: { customer_name: string | null; device_model: string | null; completed_at: string | null } | null;
};

type ReceiptRow = {
  id: string;
  sale_id: string;
  receipt_number: number;
  customer_email: string | null;
  sent_at: string | null;
  created_at: string;
  sales: SaleJoin | null;
};

function useReceipts() {
  return useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select(
          "id, sale_id, receipt_number, customer_email, sent_at, created_at, sales:sale_id(sale_number, reference, status, total, created_at, customers(name), inventory_items(device_model, imei, serial_number), appointments(customer_name, device_model, completed_at))",
        )
        .order("receipt_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReceiptRow[];
    },
  });
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

const STATUS_CLASS: Record<string, string> = {
  rascunho: "bg-muted/40 text-muted-foreground border-border/60",
  aguardando_pagamento: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  pago: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  cancelado: "bg-destructive/15 text-destructive border-destructive/40",
  estornado: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

function RecibosPage() {
  const { role } = useAuth();
  const [term, setTerm] = useState("");
  const { data: receipts = [], isLoading } = useReceipts();

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return receipts;
    return receipts.filter((r) => {
      const s = r.sales;
      const client = s?.customers?.name ?? s?.appointments?.customer_name ?? "";
      const product = s?.inventory_items?.device_model ?? s?.appointments?.device_model ?? "";
      return (
        client.toLowerCase().includes(t) ||
        product.toLowerCase().includes(t) ||
        String(r.receipt_number).includes(t) ||
        String(s?.sale_number ?? "").includes(t) ||
        (s?.reference ?? "").toLowerCase().includes(t) ||
        (r.customer_email ?? "").toLowerCase().includes(t)
      );
    });
  }, [receipts, term]);

  if (role === "vendedora") {
    return (
      <AppShell>
        <AccessDenied message="Recibos são visíveis apenas para gerentes e atendentes." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Recibos</h1>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por cliente, produto, nº recibo ou venda"
              className="pl-9"
            />
          </div>
        </header>

        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 backdrop-blur">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Nº recibo</th>
                <th className="px-3 py-2.5">Venda</th>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Produto</th>
                <th className="px-3 py-2.5">Valor</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">E-mail</th>
                <th className="px-3 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum recibo gerado ainda. Recibos são criados automaticamente quando uma venda com aparelho é finalizada.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const s = r.sales;
                const product = s?.inventory_items?.device_model ?? s?.appointments?.device_model ?? "—";
                const idcode = s?.inventory_items?.imei || s?.inventory_items?.serial_number;
                const client = s?.customers?.name ?? s?.appointments?.customer_name ?? "—";
                const date = s?.appointments?.completed_at ?? s?.created_at ?? r.created_at;
                const status = s?.status ?? "—";
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                      #{String(r.receipt_number).padStart(4, "0")}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      #{s?.sale_number ?? "—"}
                      <div className="text-xs text-muted-foreground">{s?.reference ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {new Date(`${toISODate(new Date(date))}T12:00:00`).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5">{client}</td>
                    <td className="px-3 py-2.5">
                      {product}
                      {idcode && <div className="text-xs text-muted-foreground">{idcode}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                      {formatBRL(Number(s?.total ?? 0))}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={STATUS_CLASS[status] ?? ""}>
                        {STATUS_LABEL[status] ?? status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.customer_email ? (
                        <span className="text-xs">{r.customer_email}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {r.sent_at && (
                        <div className="text-[10px] text-muted-foreground">
                          Enviado {new Date(r.sent_at).toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ReceiptActions saleId={r.sale_id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
