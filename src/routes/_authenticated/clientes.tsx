import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, MoreVertical, Receipt, Search, UserPlus, Users, Wrench } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CustomerForm } from "@/components/CustomerForm";
import { ServiceOrderForm } from "@/components/ServiceOrderForm";
import { PdfViewerDialog } from "@/components/PdfViewerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSaleReceipt } from "@/lib/receipts.functions";
import { OS_STATUS_LABEL, useCustomerServiceOrders } from "@/lib/service-orders";
import { formatBRL } from "@/lib/agenda";
import { formatCPF, useCustomerStats, useCustomers, type Customer } from "@/lib/customers";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Legado Phones" },
      {
        name: "description",
        content:
          "Cadastro de clientes da loja com CPF, contatos e histórico de agendamentos vinculados.",
      },
      { property: "og:title", content: "Clientes — Legado Phones" },
      {
        property: "og:description",
        content:
          "Cadastro de clientes da loja com CPF, contatos e histórico de agendamentos vinculados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

function CustomerDetail({ customer, onEdit }: { customer: Customer; onEdit: () => void }) {
  const { data: stats } = useCustomerStats(customer.id);
  const { data: orders = [] } = useCustomerServiceOrders(customer.id);
  const [pdf, setPdf] = useState<{ url: string; fileName: string } | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Agendamentos</p>
          <p className="text-lg font-semibold">{stats?.count ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Total concluído</p>
          <p className="text-lg font-semibold">{formatBRL(stats?.total ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Último agendamento</p>
          <p className="text-lg font-semibold">
            {stats?.lastAt ? new Date(stats.lastAt).toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row label="CPF" value={formatCPF(customer.cpf)} />
        <Row label="Telefone" value={customer.phone} />
        <Row label="WhatsApp" value={customer.whatsapp} />
        <Row label="E-mail" value={customer.email} />
        <Row label="Endereço" value={customer.address} />
        <Row label="Observações" value={customer.notes} />
      </dl>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Ordens de serviço / garantia</p>
        {orders.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma ordem de serviço registrada.</p>
        )}
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() =>
              setPdf({
                url: `/api/public/os/${o.public_token}`,
                fileName: `os-${String(o.os_number).padStart(4, "0")}.pdf`,
              })
            }
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-foreground/5"
          >
            <span>
              <span className="block font-medium">
                OS Nº {String(o.os_number).padStart(4, "0")} · {o.device_model}
              </span>
              <span className="block text-muted-foreground">
                {OS_STATUS_LABEL[o.status] ?? o.status} ·{" "}
                {new Date(o.opened_at).toLocaleDateString("pt-BR")}
              </span>
            </span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
        Editar cliente
      </Button>
      {pdf && (
        <PdfViewerDialog
          open={!!pdf}
          onOpenChange={(o) => !o && setPdf(null)}
          title="Ordem de serviço / garantia"
          url={pdf.url}
          fileName={pdf.fileName}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 pb-1 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}

function ClientesPage() {
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = useCustomers(search);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [osFor, setOsFor] = useState<Customer | null>(null);
  const [pdf, setPdf] = useState<{ url: string; fileName: string } | null>(null);
  const receipt = useServerFn(getSaleReceipt);

  const openReceipt = useMutation({
    mutationFn: async (customer: Customer) => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, created_at")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const sale = data?.[0];
      if (!sale) throw new Error("Este cliente ainda não possui vendas registradas");
      const r = (await receipt({ data: { saleId: sale.id } })) as {
        token: string;
        fileName: string;
      };
      setPdf({ url: `/api/public/recibo/${r.token}`, fileName: r.fileName });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5 text-primary" /> Clientes
        </h1>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <UserPlus className="mr-1 h-4 w-4" /> Novo cliente
        </Button>
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nome, CPF ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && customers.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado.
          </p>
        )}
        {customers.map((c) => (
          <div
            key={c.id}
            className="glass flex w-full items-center justify-between gap-2 rounded-xl pr-2 transition-colors hover:bg-foreground/5"
          >
            <button onClick={() => setSelected(c)} className="flex-1 px-4 py-3 text-left">
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block text-xs text-muted-foreground">
                {formatCPF(c.cpf)}
                {c.phone ? ` · ${c.phone}` : ""}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Ações de ${c.name}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={openReceipt.isPending}
                  onClick={() => openReceipt.mutate(c)}
                >
                  <Receipt className="mr-2 h-4 w-4" /> Visualizar recibo da venda
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOsFor(c)}>
                  <Wrench className="mr-2 h-4 w-4" /> Criar garantia / ordem de serviço
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelected(c)}>
                  <FileText className="mr-2 h-4 w-4" /> Ver ficha e documentos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <CustomerDetail
              customer={selected}
              onEdit={() => {
                setEditing(selected);
                setSelected(null);
                setFormOpen(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {formOpen && (
        <CustomerForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          customer={editing}
        />
      )}

      {osFor && (
        <ServiceOrderForm
          key={osFor.id}
          open={!!osFor}
          onOpenChange={(o) => !o && setOsFor(null)}
          customer={osFor}
        />
      )}

      {pdf && (
        <PdfViewerDialog
          open={!!pdf}
          onOpenChange={(o) => !o && setPdf(null)}
          title="Recibo / contrato de venda"
          url={pdf.url}
          fileName={pdf.fileName}
        />
      )}
    </AppShell>
  );
}