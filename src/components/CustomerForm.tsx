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
  const [address] = useState(customer?.address ?? "");
  const [street, setStreet] = useState(customer?.street ?? "");
  const [streetNumber, setStreetNumber] = useState(customer?.street_number ?? "");
  const [complement, setComplement] = useState(customer?.complement ?? "");
  const [district, setDistrict] = useState(customer?.district ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [uf, setUf] = useState(customer?.state ?? "");
  const [cep, setCep] = useState(customer?.cep ?? "");
  const [birthDate, setBirthDate] = useState(customer?.birth_date ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do cliente");
      if (!isValidCPF(cpf)) throw new Error("CPF inválido");
      /** Endereço em texto único, montado a partir dos campos separados. */
      const composed = [
        [street.trim(), streetNumber.trim()].filter(Boolean).join(", "),
        complement.trim(),
        district.trim(),
        [city.trim(), uf.trim().toUpperCase()].filter(Boolean).join(" - "),
        cep.trim(),
      ]
        .filter(Boolean)
        .join(" — ");
      const payload = {
        name: name.trim(),
        cpf: onlyDigits(cpf),
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        address: composed || address.trim() || null,
        street: street.trim() || null,
        street_number: streetNumber.trim() || null,
        complement: complement.trim() || null,
        district: district.trim() || null,
        city: city.trim() || null,
        state: uf.trim().toUpperCase() || null,
        cep: cep.trim() || null,
        birth_date: birthDate || null,
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
            <Label htmlFor="c_birth">Data de nascimento</Label>
            <Input
              id="c_birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="c_street">Rua</Label>
              <Input id="c_street" value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c_number">Número</Label>
              <Input
                id="c_number"
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c_comp">Complemento</Label>
              <Input
                id="c_comp"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c_district">Bairro</Label>
              <Input
                id="c_district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="c_city">Cidade</Label>
              <Input id="c_city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c_uf">UF</Label>
              <Input
                id="c_uf"
                maxLength={2}
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c_cep">CEP</Label>
              <Input
                id="c_cep"
                inputMode="numeric"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
              />
            </div>
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