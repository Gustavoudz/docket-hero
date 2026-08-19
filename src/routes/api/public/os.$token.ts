import { createFileRoute } from "@tanstack/react-router";

/** Link seguro do PDF da Ordem de Serviço / Garantia (token aleatório de 24 bytes). */
export const Route = createFileRoute("/api/public/os/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String((params as { token: string }).token ?? "");
        if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Não encontrado", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadServiceOrderData, buildServiceOrderPdf } = await import(
          "@/lib/service-order.server"
        );
        const os = await loadServiceOrderData(supabaseAdmin, { token });
        if (!os) return new Response("Não encontrado", { status: 404 });

        const bytes = await buildServiceOrderPdf(os);
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="os-${String(os.number).padStart(4, "0")}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
