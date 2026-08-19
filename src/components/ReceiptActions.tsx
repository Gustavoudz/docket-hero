import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSaleReceipt, sendSaleReceiptEmail } from "@/lib/receipts.functions";

function openPdf(base64: string, fileName: string, download: boolean) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  if (download) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Botão compacto para abrir o PDF do recibo direto na lista de vendas. */
export function ReceiptQuickView({ saleId }: { saleId: string }) {
  const receipt = useServerFn(getSaleReceipt);
  const load = useMutation({
    mutationFn: async () => {
      const r = (await receipt({ data: { saleId } })) as { pdfBase64: string; fileName: string };
      openPdf(r.pdfBase64, r.fileName, false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={load.isPending}
      onClick={() => load.mutate()}
      className="h-8"
    >
      <Eye className="mr-1.5 h-4 w-4" />
      {load.isPending ? "Abrindo…" : "Recibo"}
    </Button>
  );
}

/** Ver / baixar / reenviar o recibo de uma venda concluída. */
export function ReceiptActions({ saleId }: { saleId: string }) {
  const receipt = useServerFn(getSaleReceipt);
  const resend = useServerFn(sendSaleReceiptEmail);
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  const load = useMutation({
    mutationFn: async (download: boolean) => {
      const r = (await receipt({ data: { saleId } })) as {
        pdfBase64: string;
        fileName: string;
        customerEmail: string | null;
      };
      setEmail(r.customerEmail);
      openPdf(r.pdfBase64, r.fileName, download);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: async () => resend({ data: { saleId } }),
    onSuccess: (res) => {
      const r = res as { sent: boolean; reason?: string };
      if (r.sent) toast.success("Recibo enviado por e-mail");
      else if (r.reason === "sem_email") toast.error("Esta venda não tem e-mail do cliente");
      else if (r.reason === "email_nao_configurado")
        toast.error("Configure o domínio de e-mail da loja para enviar recibos");
      else toast.error(r.reason ?? "Não foi possível enviar");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={load.isPending} onClick={() => load.mutate(false)}>
        <Eye className="mr-1.5 h-4 w-4" /> Ver recibo
      </Button>
      <Button size="sm" variant="outline" disabled={load.isPending} onClick={() => load.mutate(true)}>
        <Download className="mr-1.5 h-4 w-4" /> Baixar PDF
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={send.isPending || email === null}
        onClick={() => send.mutate()}
      >
        <Mail className="mr-1.5 h-4 w-4" />
        {send.isPending ? "Enviando…" : "Reenviar por e-mail"}
      </Button>
    </div>
  );
}
