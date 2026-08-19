import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Search, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, toISODate } from "@/lib/agenda";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Controle de Vendas — Legado Phones" },
      {
        name: "description",
        content:
          "Vendas geradas a partir dos agendamentos concluídos, com cliente, aparelho, vendedor, valor e status.",
      },
      { property: "og:title", content: "Controle de Vendas — Legado Phones" },
      {
        property: "og:description",
        content:
          "Vendas geradas a partir dos agendamentos concluídos, com cliente, aparelho, vendedor, valor e status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendasPage,
});

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

type SaleRow = {
  id: string;
  sale_number: number;
  reference: string;
  status: string;
  total: number;
  created_at: string;
  seller_id: string;
  appointment_id: string | null;
  customers: { name: string } | null;
  inventory_items: { device_model: string | null; imei: string | null; serial_number: string | null } | null;
  appointments: { customer_name: string | null; device_model: string | null; scheduled_date: string | null } | null;
};

function useSales() {
  return useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, reference, status, total, created_at, seller_id, appointment_id, customers(name), inventory_items(device_model, imei, serial_number), appointments(customer_name, device_model, scheduled_date)",
        )
        .order("sale_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });
}

function useSellers() {
  return useQuery({
    queryKey: ["sellers-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        map[p.id] = p.full_name || p.email || "Atendente";
      });
      return map;
    },
  });
}

function VendasPage() {
  const [term, setTerm] = useState("");
  const { data: sales = [], isLoading } = useSales();
  const { data: sellers = {} } = useSellers();

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return sales;
    return sales.filter((s) => {
      const client = s.customers?.name ?? s.appointments?.customer_name ?? "";
      const product = s.inventory_items?.device_model ?? s.appointments?.device_model ?? "";
      return (
        client.toLowerCase().includes(t) ||
        product.toLowerCase().includes(t) ||
        String(s.sale_number).includes(t) ||
        s.reference.toLowerCase().includes(t) ||
        (s.inventory_items?.imei ?? "").includes(t)
      );
    });
  }, [sales, term]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Controle de Vendas</h1>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por cliente, produto, nº ou IMEI"
              className="pl-9"
            />
          </div>
        </header>

        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40 backdrop-blur">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Venda</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Produto</th>
                <th className="px-3 py-2.5">Vendedor</th>
                <th className="px-3 py-2.5">Valor</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Origem</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhuma venda registrada ainda. As vendas são criadas quando um agendamento é concluído.
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const product = s.inventory_items?.device_model ?? s.appointments?.device_model ?? "—";
                const idcode = s.inventory_items?.imei || s.inventory_items?.serial_number;
                const date = s.appointments?.scheduled_date ?? toISODate(new Date(s.created_at));
                return (
                  <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium">#{s.sale_number}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{s.reference}</span>
                    </td>
                    <td className="px-3 py-2.5">{s.customers?.name ?? s.appointments?.customer_name ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {product}
                      {idcode && <div className="text-xs text-muted-foreground">{idcode}</div>}
                    </td>
                    <td className="px-3 py-2.5">{sellers[s.seller_id] ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{formatBRL(Number(s.total))}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={STATUS_CLASS[s.status] ?? ""}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {s.appointment_id && s.appointments?.scheduled_date ? (
                        <Link
                          to="/agenda"
                          search={{ date: s.appointments.scheduled_date } as never}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Agendamento <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
