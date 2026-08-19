import { useState } from "react";
import { Check, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerForm } from "@/components/CustomerForm";
import { formatCPF, useCustomers, type Customer } from "@/lib/customers";

type Props = {
  name: string;
  onNameChange: (name: string) => void;
  customerId: string | null;
  onSelect: (customer: Customer | null) => void;
};

export function CustomerPicker({ name, onNameChange, customerId, onSelect }: Props) {
  const [focused, setFocused] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const { data: results = [] } = useCustomers(customerId ? "" : name);
  const showList = focused && !customerId && name.trim().length >= 2;
  const matches = results.slice(0, 6);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="customer_name">Cliente *</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="customer_name"
          name="customer_name"
          className="pl-8"
          autoComplete="off"
          placeholder="Buscar cliente por nome…"
          value={name}
          onChange={(e) => {
            onNameChange(e.target.value);
            if (customerId) onSelect(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          required
        />
        {showList && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {matches.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Nenhum cliente encontrado com esse nome.
              </p>
            )}
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(c);
                  setFocused(false);
                }}
              >
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{formatCPF(c.cpf)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {customerId ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Cliente cadastrado vinculado
            </span>
          ) : (
            "Busque um cliente cadastrado ou cadastre um novo."
          )}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
          <UserPlus className="mr-1 h-4 w-4" /> Novo cliente
        </Button>
      </div>
      {formOpen && (
        <CustomerForm
          open={formOpen}
          onOpenChange={setFormOpen}
          defaultName={name}
          onSaved={(c) => onSelect(c)}
        />
      )}
    </div>
  );
}