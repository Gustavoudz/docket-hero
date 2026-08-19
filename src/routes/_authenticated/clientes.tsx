import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CustomerForm } from "@/components/CustomerForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
        Editar cliente
      </Button>
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
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className="glass flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-foreground/5"
          >
            <span>
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block text-xs text-muted-foreground">
                {formatCPF(c.cpf)}
                {c.phone ? ` · ${c.phone}` : ""}
              </span>
            </span>
          </button>
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
    </AppShell>
  );
}