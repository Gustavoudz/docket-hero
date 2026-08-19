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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PdfViewerDialog } from "@/components/PdfViewerDialog";
import type { Customer } from "@/lib/customers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
};

/** Abertura de Ordem de Serviço / Garantia para um cliente já cadastrado. */
export function ServiceOrderForm({ open, onOpenChange, customer }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState("garantia");
  const [status, setStatus] = useState("aberta");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [serial, setSerial] = useState("");
  const [color, setColor] = useState("");
  const [storage, setStorage] = useState("");
  const [devicePassword, setDevicePassword] = useState("");
  const [issue, setIssue] = useState("");
  const [services, setServices] = useState("");
  const [parts, setParts] = useState("");
  const [total, setTotal] = useState("");
  const [method, setMethod] = useState("nao_informado");
  const [warrantyDays, setWarrantyDays] = useState("90");
  const [notes, setNotes] = useState("");
  const [pdf, setPdf] = useState<{ url: string; fileName: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!model.trim()) throw new Error("Informe o modelo do aparelho");
      const { data, error } = await supabase
        .from("service_orders")
        .insert({
          customer_id: customer.id,
          customer_name: customer.name,
          kind,
          status,
          device_model: model.trim(),
          imei: imei.trim() || null,
          serial_number: serial.trim() || null,
          color: color.trim() || null,
          storage: storage.trim() || null,
          device_password: devicePassword.trim() || null,
          reported_issue: issue.trim() || null,
          services: services.trim() || null,
          parts: parts.trim() || null,
          total: Number(total.replace(",", ".")) || 0,
          payment_method: method === "nao_informado" ? null : method,
          warranty_days: Number(warrantyDays) || 0,
          notes: notes.trim() || null,
          responsible_id: user?.id ?? null,
          created_by: user?.id ?? null,
          finished_at: status === "finalizado" || status === "entregue" ? new Date().toISOString() : null,
        })
        .select("os_number, public_token")
        .single();
      if (error) throw new Error(error.message);
      return data as { os_number: number; public_token: string };
    },
    onSuccess: (os) => {
      qc.invalidateQueries({ queryKey: ["service_orders"] });
      toast.success(`Ordem de serviço Nº ${String(os.os_number).padStart(4, "0")} criada`);
      onOpenChange(false);
      setPdf({
        url: `/api/public/os/${os.public_token}`,
        fileName: `os-${String(os.os_number).padStart(4, "0")}.pdf`,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova ordem de serviço · {customer.name}</DialogTitle>
          </DialogHeader>
          <form
            id="os-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="garantia">Garantia</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os_model">Modelo do aparelho *</Label>
              <Input id="os_model" value={model} onChange={(e) => setModel(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="os_imei">IMEI</Label>
                <Input id="os_imei" value={imei} onChange={(e) => setImei(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="os_serial">Nº de série</Label>
                <Input id="os_serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="os_color">Cor</Label>
                <Input id="os_color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="os_storage">Armazenamento</Label>
                <Input id="os_storage" value={storage} onChange={(e) => setStorage(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os_pass">Senha do aparelho</Label>
              <Input
                id="os_pass"
                value={devicePassword}
                onChange={(e) => setDevicePassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os_issue">Relato do cliente</Label>
              <Textarea id="os_issue" rows={2} value={issue} onChange={(e) => setIssue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os_serv">Serviços executados</Label>
              <Textarea
                id="os_serv"
                rows={2}
                value={services}
                onChange={(e) => setServices(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os_parts">Peças utilizadas</Label>
              <Textarea id="os_parts" rows={2} value={parts} onChange={(e) => setParts(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="os_total">Valor (R$)</Label>
                <Input
                  id="os_total"
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pagamento</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartão de débito">Cartão de débito</SelectItem>
                    <SelectItem value="Cartão de crédito">Cartão de crédito</SelectItem>
                    <SelectItem value="Cortesia / garantia">Cortesia / garantia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="os_war">Garantia (dias)</Label>
                <Input
                  id="os_war"
                  inputMode="numeric"
                  value={warrantyDays}
                  onChange={(e) => setWarrantyDays(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os_notes">Observações</Label>
              <Textarea id="os_notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="os-form" disabled={save.isPending}>
              {save.isPending ? "Gerando…" : "Criar OS e gerar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pdf && (
        <PdfViewerDialog
          open={!!pdf}
          onOpenChange={(o) => !o && setPdf(null)}
          title="Ordem de serviço / garantia"
          url={pdf.url}
          fileName={pdf.fileName}
        />
      )}
    </>
  );
}
