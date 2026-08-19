import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCPF, isValidCPF, onlyDigits, type Customer } from "@/lib/customers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  defaultName?: string;
  onSaved?: (customer: Customer) => void;
};

export function CustomerForm({ open, onOpenChange, customer, defaultName, onSaved }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(customer?.name ?? defaultName ?? "");
  const [cpf, setCpf] = useState(customer ? formatCPF(customer.cpf) : "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do cliente");
      if (!isValidCPF(cpf)) throw new Error("CPF inválido");
      const payload = {
        name: name.trim(),
        cpf: onlyDigits(cpf),
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      };
      const query = customer
        ? supabase.from("customers").update(payload).eq("id", customer.id).select().single()
        : supabase
            .from("customers")
            .insert({ ...payload, created_by: user!.id })
            .select()
            .single();
      const { data, error } = await query;
      if (error) {
        if (error.code === "23505") throw new Error("Já existe um cliente com este CPF");
        throw new Error(error.message);
      }
      return data as Customer;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(customer ? "Cliente atualizado" : "Cliente cadastrado");
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form
          id="customer-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="c_name">Nome *</Label>
            <Input id="c_name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c_cpf">CPF *</Label>
            <Input
              id="c_cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c_phone">Telefone</Label>
              <Input id="c_phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c_whats">WhatsApp</Label>
              <Input
                id="c_whats"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c_email">E-mail</Label>
            <Input
              id="c_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c_address">Endereço</Label>
            <Input id="c_address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c_notes">Observações</Label>
            <Textarea
              id="c_notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="customer-form" disabled={mutation.isPending}>
            {customer ? "Salvar" : "Cadastrar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}