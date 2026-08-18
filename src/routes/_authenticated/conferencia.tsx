import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDateLabel, formatTime, shiftDate, todayISO } from "@/lib/agenda";
import { useInventoryCosts, type InventoryItem } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência diária do estoque — Legado Phones" },
      {
        name: "description",
        content: "Saída do dia: aparelhos vendidos, custo total que saiu e confirmação da contagem.",
      },
      { property: "og:title", content: "Conferência diária do estoque — Legado Phones" },
      {
        property: "og:description",
        content: "Saída do dia: aparelhos vendidos, custo total que saiu e confirmação da contagem.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConferenciaPage,
});

function ConferenciaPage() {
  const { role, user } = useAuth();
  const isGerente = role === "gerente";
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const costs = useInventoryCosts(isGerente);

  const { data: sold = [], isLoading } = useQuery({
    queryKey: ["inventory_items", "sold", date],
    enabled: isGerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id, device_model, color, storage, apple_id, serial_number, sale_price, notes, status, entered_at, sold_at, appointment_id, created_by")
        .eq("status", "vendido")
        .gte("sold_at", `${date}T00:00:00`)
        .lte("sold_at", `${date}T23:59:59`)
        .order("sold_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as InventoryItem[];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["inventory_audit", date],
    enabled: isGerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_audits")
        .select("*")
        .eq("audit_date", date)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const totalCost = sold.reduce((sum, i) => sum + (costs[i.id] ?? 0), 0);

  const confirm = useMutation({
    mutationFn: async (matched: boolean) => {
      const { error } = await supabase.from("inventory_audits").upsert(
        {
          audit_date: date,
          confirmed_by: user?.id ?? null,
          matched,
          divergence_note: matched ? null : note.trim() || "Divergência sem detalhe",
          items_count: sold.length,
          total_cost: totalCost,
        },
        { onConflict: "audit_date" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_audit", date] });
      toast.success("Conferência registrada");
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isGerente) {
    return (
      <AppShell>
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground backdrop-blur-xl">
          A conferência diária do estoque é exclusiva do gerente.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => setDate(shiftDate(date, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button variant="outline" size="icon" aria-label="Próximo dia" onClick={() => setDate(shiftDate(date, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <h1 className="mt-3 text-lg font-semibold capitalize">Saída do dia — {formatDateLabel(date)}</h1>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-card p-3 backdrop-blur-xl">
          <p className="text-xs text-muted-foreground">Itens que saíram</p>
          <p className="text-xl font-semibold">{sold.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-3 backdrop-blur-xl">
          <p className="text-xs text-muted-foreground">Custo total que saiu</p>
          <p className="text-xl font-semibold text-primary">{formatBRL(totalCost)}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {isLoading && <li className="text-sm text-muted-foreground">Carregando…</li>}
        {!isLoading && sold.length === 0 && (
          <li className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum aparelho saiu do estoque neste dia.
          </li>
        )}
        {sold.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-lg border bg-card p-3 backdrop-blur-xl">
            <span className="w-14 shrink-0 text-sm font-semibold">
              {i.sold_at ? formatTime(i.sold_at) : "--:--"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.device_model}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[i.color, i.storage].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="shrink-0 text-sm">{formatBRL(costs[i.id] ?? 0)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-lg border bg-card p-3 backdrop-blur-xl">
        <p className="text-sm font-medium">Conferência do dia</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {audit
            ? audit.matched
              ? `Conferido · ${audit.items_count} item(ns) · ${formatBRL(Number(audit.total_cost))}`
              : `Divergência registrada: ${audit.divergence_note}`
            : "Confirme que o valor bateu com a contagem física ou registre a divergência."}
        </p>
        <Textarea
          className="mt-2"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota de divergência (opcional)"
        />
        <div className="mt-2 flex gap-2">
          <Button className="flex-1" disabled={confirm.isPending} onClick={() => confirm.mutate(true)}>
            Confirmar conferência do dia
          </Button>
          <Button variant="outline" disabled={confirm.isPending} onClick={() => confirm.mutate(false)}>
            Registrar divergência
          </Button>
        </div>
      </div>
    </AppShell>
  );
}