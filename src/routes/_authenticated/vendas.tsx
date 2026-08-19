import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Search, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  PaymentForm,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/components/PaymentForm";
import { PixAutoPayment } from "@/components/PixAutoPayment";
import { ReceiptActions, ReceiptQuickView } from "@/components/ReceiptActions";
import { sendSaleReceiptEmail } from "@/lib/receipts.functions";
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

type PaymentRow = {
  id: string;
  method: string;
  status: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  installments: number;
  installment_value: number | null;
  card_brand: string | null;
  card_last4: string | null;
  nsu: string | null;
  authorization_code: string | null;
  transaction_code: string | null;
  terminal: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
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
  appointments: {
    customer_name: string | null;
    device_model: string | null;
    scheduled_date: string | null;
    status?: string | null;
  } | null;
  payments: PaymentRow[];
};

function useSales() {
  return useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, reference, status, total, created_at, seller_id, appointment_id, customers(name), inventory_items(device_model, imei, serial_number), appointments(customer_name, device_model, scheduled_date, status), payments(*)",
        )
        .order("sale_number", { ascending: false });
      if (error) throw error;
      // vendas cujo registro de origem virou "Legado" saem das listas ativas
      return ((data ?? []) as unknown as SaleRow[]).filter(
        (s) => s.appointments?.status !== "legado",
      );
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
  const [detail, setDetail] = useState<SaleRow | null>(null);
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

  const current = detail ? (sales.find((s) => s.id === detail.id) ?? detail) : null;

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
                <th className="px-3 py-2.5">Pagamento</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Origem</th>
                <th className="px-3 py-2.5">Recibo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
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
                      <button
                        type="button"
                        onClick={() => setDetail(s)}
                        className="font-medium text-primary hover:underline"
                      >
                        #{s.sale_number}
                      </button>
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
                      {s.payments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-0.5 text-xs">
                          {s.payments.map((p) => (
                            <div key={p.id}>
                              {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                              {p.method === "credito" ? ` ${p.installments}x` : ""} ·{" "}
                              {formatBRL(Number(p.gross_amount))}
                              <span className="text-muted-foreground">
                                {" "}(líq. {formatBRL(Number(p.net_amount))}) ·{" "}
                                {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
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
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {s.status === "pago" ? (
                        <ReceiptQuickView saleId={s.id} />
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

      <Dialog open={!!current} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Venda #{current?.sale_number} · {current?.reference}
            </DialogTitle>
          </DialogHeader>
          {current && <SaleDetail sale={current} sellerName={sellers[current.seller_id] ?? "—"} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SaleDetail({ sale, sellerName }: { sale: SaleRow; sellerName: string }) {
  const { role } = useAuth();
  const autoSendReceipt = useServerFn(sendSaleReceiptEmail);
  // Envio automático do recibo assim que a venda está paga (uma única vez).
  useEffect(() => {
    if (sale.status !== "pago") return;
    void autoSendReceipt({ data: { saleId: sale.id, auto: true } }).catch(() => {});
  }, [sale.status, sale.id, autoSendReceipt]);
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const product = sale.inventory_items?.device_model ?? sale.appointments?.device_model ?? "—";
  const idcode = sale.inventory_items?.imei || sale.inventory_items?.serial_number;

  const cancelPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from("payments")
        .update({ status: "cancelado" })
        .eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento cancelado");
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <Info label="Cliente" value={sale.customers?.name ?? sale.appointments?.customer_name ?? "—"} />
        <Info label="Vendedor" value={sellerName} />
        <Info label="Produto" value={idcode ? `${product} · ${idcode}` : product} />
        <Info label="Valor" value={formatBRL(Number(sale.total))} />
        <Info label="Status" value={STATUS_LABEL[sale.status] ?? sale.status} />
        <Info
          label="Criada em"
          value={new Date(sale.created_at).toLocaleString("pt-BR")}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pagamentos</h3>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              Registrar pagamento
            </Button>
          )}
        </div>
        {sale.payments.length === 0 && !showForm && (
          <p className="text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
        )}
        {sale.payments.map((p) => (
          <div key={p.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                {p.method === "credito" ? ` · ${p.installments}x de ${formatBRL(Number(p.installment_value ?? 0))}` : ""}
              </span>
              <Badge variant="outline">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</Badge>
            </div>
            <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <Info label="Bruto" value={formatBRL(Number(p.gross_amount))} />
              <Info label="Taxa" value={formatBRL(Number(p.fee_amount))} />
              <Info label="Líquido" value={formatBRL(Number(p.net_amount))} />
              <Info label="Bandeira" value={p.card_brand ?? "—"} />
              <Info label="Últimos 4" value={p.card_last4 ? `•••• ${p.card_last4}` : "—"} />
              <Info label="NSU" value={p.nsu ?? "—"} />
              <Info label="Autorização" value={p.authorization_code ?? "—"} />
              <Info label="Transação" value={p.transaction_code ?? "—"} />
              <Info label="Terminal" value={p.terminal ?? "—"} />
              <Info
                label="Confirmado em"
                value={p.confirmed_at ? new Date(p.confirmed_at).toLocaleString("pt-BR") : "—"}
              />
            </div>
            {p.notes && <p className="mt-2 text-xs text-muted-foreground">{p.notes}</p>}
            {p.status === "aprovado" && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Pagamento aprovado não pode ser editado.
                </span>
                {role === "gerente" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancelPayment.isPending}
                    onClick={() => cancelPayment.mutate(p.id)}
                  >
                    Cancelar pagamento
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
        {showForm && (
          <div className="rounded-lg border border-border/60 p-3">
            <PaymentForm
              saleId={sale.id}
              defaultAmount={Number(sale.total)}
              onDone={() => setShowForm(false)}
            />
          </div>
        )}

        {sale.status !== "cancelado" && sale.status !== "estornado" && (
          <PixAutoPayment saleId={sale.id} />
        )}

        {sale.status === "pago" && (
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <p className="text-xs font-medium text-muted-foreground">Recibo da venda</p>
            <ReceiptActions saleId={sale.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </div>
  );
}
