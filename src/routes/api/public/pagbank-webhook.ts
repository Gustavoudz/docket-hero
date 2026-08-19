import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da PagBank. O payload não é confiável: usamos apenas o id do
 * pedido e reconsultamos a Order API com o token do servidor antes de confirmar.
 */
export const Route = createFileRoute("/api/public/pagbank-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("payload inválido", { status: 400 });
        }

        const orderId: string | undefined =
          payload?.id ?? payload?.order_id ?? payload?.charges?.[0]?.reference_id;
        if (!orderId || typeof orderId !== "string") {
          return new Response("sem id de pedido", { status: 400 });
        }

        const { getPagbankOrder, findPaidCharge } = await import("@/lib/pagbank.server");
        const order = await getPagbankOrder(orderId);
        if (!order) return new Response("pedido não encontrado", { status: 202 });

        const paid = findPaidCharge(order);
        if (!paid) return new Response("ok", { status: 200 });

        const { confirmPixPayment } = await import("@/lib/pagbank-confirm.server");
        await confirmPixPayment(String(order.id), paid.amount, paid.code);
        return new Response("ok", { status: 200 });
      },
    },
  },
});
