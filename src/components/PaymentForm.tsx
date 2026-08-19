import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendSaleReceiptEmail } from "@/lib/receipts.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/agenda";

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export function PaymentForm({
  saleId,
  defaultAmount,
  onDone,
}: {
  saleId: string;
  defaultAmount: number;
  onDone?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sendReceipt = useServerFn(sendSaleReceiptEmail);
  const [method, setMethod] = useState<"pix" | "debito" | "credito">("pix");
  const [status, setStatus] = useState<"aguardando" | "aprovado" | "recusado">("aprovado");
  const [gross, setGross] = useState(defaultAmount ? String(defaultAmount) : "");
  const [fee, setFee] = useState("");
  const [net, setNet] = useState("");
  const [installments, setInstallments] = useState("1");
  const [brand, setBrand] = useState("");
  const [last4, setLast4] = useState("");
  const [nsu, setNsu] = useState("");
  const [auth, setAuthCode] = useState("");
  const [transaction, setTransaction] = useState("");
  const [terminal, setTerminal] = useState("");
  const [notes, setNotes] = useState("");

  const grossN = Number(gross) || 0;
  const feeN = fee !== "" ? Number(fee) || 0 : Math.max(0, grossN - (Number(net) || 0));
  const netN = net !== "" ? Number(net) || 0 : Math.max(0, grossN - (Number(fee) || 0));
  const parcels = method === "credito" ? Math.min(18, Math.max(1, Number(installments) || 1)) : 1;
  const installmentValue = useMemo(
    () => (parcels > 0 ? Number((grossN / parcels).toFixed(2)) : grossN),
    [grossN, parcels],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (grossN <= 0) throw new Error("Informe o valor bruto do pagamento");
      if (last4 && !/^\d{4}$/.test(last4)) throw new Error("Últimos 4 dígitos inválidos");
      const { error } = await supabase.from("payments").insert({
        sale_id: saleId,
        method,
        status,
        gross_amount: grossN,
        fee_amount: feeN,
        net_amount: netN,
        installments: parcels,
        installment_value: installmentValue,
        card_brand: brand || null,
        card_last4: last4 || null,
        nsu: nsu || null,
        authorization_code: auth || null,
        transaction_code: transaction || null,
        terminal: terminal || null,
        notes: notes || null,
        confirmed_by: user?.id ?? null,
        confirmed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrado");
      // Recibo sai automaticamente por e-mail assim que a venda fica paga.
      void sendReceipt({ data: { saleId, auto: true } }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Pagamento registrado manualmente. Fica registrado quem confirmou e quando.</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Método</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="debito">Débito</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="aguardando">Aguardando</SelectItem>
              <SelectItem value="recusado">Recusado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Valor bruto</Label>
          <Input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0,00" />
        </div>
        <div className="space-y-1.5">
          <Label>Taxa</Label>
          <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Valor líquido</Label>
          <Input inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} placeholder="opcional" />
          <p className="text-xs text-muted-foreground">
            Calculado: {formatBRL(netN)} (taxa {formatBRL(feeN)})
          </p>
        </div>
        {method === "credito" && (
          <div className="space-y-1.5">
            <Label>Parcelas</Label>
            <Select value={installments} onValueChange={setInstallments}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Parcela de {formatBRL(installmentValue)}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Bandeira</Label>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Últimos 4 dígitos</Label>
          <Input value={last4} maxLength={4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>NSU</Label>
          <Input value={nsu} onChange={(e) => setNsu(e.target.value)} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Autorização</Label>
          <Input value={auth} onChange={(e) => setAuthCode(e.target.value)} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Transação</Label>
          <Input value={transaction} onChange={(e) => setTransaction(e.target.value)} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label>Terminal</Label>
          <Input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="opcional" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Observação</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="opcional" />
      </div>

      <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Registrando…" : "Confirmar pagamento"}
      </Button>
    </div>
  );
}
