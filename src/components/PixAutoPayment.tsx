import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { createSalePixCharge, syncSalePixStatus } from "@/lib/pagbank.functions";
import { formatBRL } from "@/lib/agenda";

type Charge = {
  paymentId: string | null;
  orderId: string;
  qrText: string;
  qrImageUrl: string | null;
  amount: number;
};

export function PixAutoPayment({ saleId, onPaid }: { saleId: string; onPaid?: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createSalePixCharge);
  const sync = useServerFn(syncSalePixStatus);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useMutation({
    mutationFn: async () => create({ data: { saleId } }),
    onSuccess: (data) => {
      setCharge(data as Charge);
      setPaid(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Acompanha o pagamento: realtime na tabela + consulta periódica de segurança.
  useEffect(() => {
    const paymentId = charge?.paymentId;
    if (!paymentId || paid) return;

    const markPaid = () => {
      setPaid(true);
      toast.success("PIX confirmado!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      onPaid?.();
    };

    const channel = supabase
      .channel(`pix-${paymentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${paymentId}` },
        (payload) => {
          if ((payload.new as { status?: string })?.status === "aprovado") markPaid();
        },
      )
      .subscribe();

    const timer = setInterval(async () => {
      try {
        const res = (await sync({ data: { paymentId } })) as { status: string };
        if (res.status === "aprovado") markPaid();
      } catch {
        /* silencioso: tenta de novo no próximo ciclo */
      }
    }, 6000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [charge?.paymentId, paid, qc, sync, onPaid]);

  const copy = async () => {
    if (!charge) return;
    await navigator.clipboard.writeText(charge.qrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <QrCode className="h-4 w-4 text-primary" /> PIX automático
        </span>
        {paid ? (
          <Badge className="bg-emerald-500/20 text-emerald-300">Pago</Badge>
        ) : charge ? (
          <Badge variant="outline" className="text-amber-300">Aguardando pagamento</Badge>
        ) : null}
      </div>

      {!charge && (
        <Button size="sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? "Gerando cobrança…" : "Gerar QR Code PIX"}
        </Button>
      )}

      {charge && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Valor: <strong>{formatBRL(charge.amount)}</strong> · Pedido {charge.orderId}
          </p>
          {charge.qrImageUrl && (
            <img
              src={charge.qrImageUrl}
              alt="QR Code PIX da venda"
              className="h-44 w-44 rounded-md bg-white p-2"
            />
          )}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Copia e cola:</p>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[11px]">
                {charge.qrText}
              </code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {!paid && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirmação automática assim que o
              cliente pagar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
