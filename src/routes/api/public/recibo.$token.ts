import { createFileRoute } from "@tanstack/react-router";

/** Link público do recibo (token aleatório de 24 bytes) para o e-mail do cliente. */
export const Route = createFileRoute("/api/public/recibo/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String((params as { token: string }).token ?? "");
        if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Não encontrado", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadReceiptData, buildReceiptPdf } = await import("@/lib/receipt.server");
        const receipt = await loadReceiptData(supabaseAdmin, { token });
        if (!receipt) return new Response("Não encontrado", { status: 404 });

        const bytes = await buildReceiptPdf(receipt);
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="recibo-${String(receipt.number).padStart(4, "0")}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
