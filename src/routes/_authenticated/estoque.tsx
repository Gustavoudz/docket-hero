import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, RotateCcw, History, AlarmClock, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { InventoryForm } from "@/components/InventoryForm";
import { InventoryHistory } from "@/components/InventoryHistory";
import { MasterPasswordDialog } from "@/components/MasterPasswordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/agenda";
import { exportInventoryCSV } from "@/lib/inventory-export";
import {
  INVENTORY_STATUSES,
  INVENTORY_STATUS_COLOR,
  INVENTORY_STATUS_LABEL,
  logInventoryEvent,
  useInventoryCosts,
  useInventoryItems,
  useStaleDays,
  daysInStock,
  isStale,
  type InventoryItem,
} from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/estoque")({
  validateSearch: (search: Record<string, unknown>): { incompletos?: boolean } =>
    search['incompletos'] ? { incompletos: true } : {},
  head: () => ({
    meta: [
      { title: "Estoque de aparelhos — Legado Phones" },
      {
        name: "description",
        content: "Controle item a item dos iPhones e MacBooks: situação, custo e vínculo com vendas.",
      },
      { property: "og:title", content: "Estoque de aparelhos — Legado Phones" },
      {
        property: "og:description",
        content: "Controle item a item dos iPhones e MacBooks: situação, custo e vínculo com vendas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EstoquePage,
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground";

function EstoquePage() {
  const { role, user } = useAuth();
  const { incompletos } = Route.useSearch();
  const isGerente = role === "gerente";
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useInventoryItems();
  const costs = useInventoryCosts(isGerente);
  const staleDays = useStaleDays();

  const [statusFilter, setStatusFilter] = useState(incompletos ? "incompleto" : "");
  const [modelFilter, setModelFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [reverting, setReverting] = useState<InventoryItem | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);

  const models = useMemo(
    () => [...new Set(items.map((i) => i.device_model))].sort(),
    [items],
  );
  const colors = useMemo(
    () => [...new Set(items.map((i) => i.color).filter(Boolean))].sort() as string[],
    [items],
  );

  const filtered = items.filter((i) => {
    if (statusFilter && i.status !== statusFilter) return false;
    if (modelFilter && i.device_model !== modelFilter) return false;
    if (colorFilter && i.color !== colorFilter) return false;
    if (onlyStale && !isStale(i, staleDays)) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (i.apple_id ?? "").toLowerCase().includes(term) ||
      (i.serial_number ?? "").toLowerCase().includes(term) ||
      (i.imei ?? "").toLowerCase().includes(term)
    );
  });

  const available = items.filter((i) => i.status === "disponivel");
  const totalAvailableCost = available.reduce((sum, i) => sum + (costs[i.id] ?? 0), 0);
  const staleItems = items.filter((i) => isStale(i, staleDays));
  const incompleteItems = items.filter((i) => i.status === "incompleto");

  const revert = useMutation({
    mutationFn: async ({ item, why }: { item: InventoryItem; why: string }) => {
      const { error } = await supabase
        .from("inventory_items")
        .update({ status: "disponivel", appointment_id: null, sold_at: null })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
      if (item.appointment_id) {
        const { error: apptError } = await supabase
          .from("appointments")
          .update({ status: "cancelado", cancel_reason: `Venda revertida: ${why}` })
          .eq("id", item.appointment_id);
        if (apptError) throw new Error(apptError.message);
      }
      await logInventoryEvent({
        itemId: item.id,
        kind: "reversao",
        reason: why,
        appointmentId: item.appointment_id,
        actorId: user?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Venda revertida — aparelho voltou para o estoque");
      setReverting(null);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (item: InventoryItem) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_costs"] });
      toast.success("Item excluído do estoque");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold">Estoque</h1>
        <p className="text-sm text-muted-foreground">
          {available.length} disponíve{available.length === 1 ? "l" : "is"} de {items.length}
        </p>
      </div>

      {incompleteItems.length > 0 && (
        <button
          type="button"
          onClick={() => setStatusFilter("incompleto")}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
        >
          <span className="text-sm font-medium text-amber-300">
            {incompleteItems.length} aparelho{incompleteItems.length === 1 ? "" : "s"} aguardando
            cadastro completo
          </span>
          <span className="text-xs text-amber-300/80">Ver</span>
        </button>
      )}

      {isGerente && (
        <div className="mt-3 rounded-lg border bg-card p-4 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Custo total do estoque disponível
          </p>
          <p className="mt-1 text-2xl font-semibold text-primary">{formatBRL(totalAvailableCost)}</p>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por série ou IMEI"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select
            aria-label="Filtrar por situação"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">Situação</option>
            {INVENTORY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INVENTORY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por modelo"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">Modelo</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por cor"
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">Cor</option>
            {colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={onlyStale ? "default" : "outline"}
            size="sm"
            className="transition-transform active:scale-[0.98]"
            onClick={() => setOnlyStale((v) => !v)}
          >
            <AlarmClock className="mr-1 h-4 w-4" />
            {onlyStale ? "Só parados" : `Só parados (${staleItems.length})`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="transition-transform active:scale-[0.98]"
            onClick={() => {
              if (filtered.length === 0) {
                toast.info("Nenhum item para exportar com os filtros atuais.");
                return;
              }
              exportInventoryCSV(filtered, costs, "estoque");
              toast.success(`${filtered.length} item(ns) exportado(s).`);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {isLoading && <li className="text-sm text-muted-foreground">Carregando…</li>}
        {!isLoading && filtered.length === 0 && (
          <li className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum item encontrado.
          </li>
        )}
        {filtered.map((i) => {
          const stale = isStale(i, staleDays);
          return (
          <li
            key={i.id}
            className={`rounded-lg border bg-card p-3 backdrop-blur-xl transition-transform active:scale-[0.99] ${
              stale ? "border-amber-500/70" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: INVENTORY_STATUS_COLOR[i.status] }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{i.device_model}</p>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-black"
                    style={{ backgroundColor: INVENTORY_STATUS_COLOR[i.status] }}
                  >
                    {INVENTORY_STATUS_LABEL[i.status]}
                  </span>
                  {stale && (
                    <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-black">
                      Parado há {daysInStock(i.entered_at)} dias
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {[i.color, i.storage].filter(Boolean).join(" · ") || "Sem cor/configuração"}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {i.serial_number && <span>Série: {i.serial_number}</span>}
                  {i.imei && <span>IMEI: {i.imei}</span>}
                  {isGerente && costs[i.id] != null && <span>Custo: {formatBRL(costs[i.id]!)}</span>}
                  {i.sale_price != null && <span>Venda: {formatBRL(Number(i.sale_price))}</span>}
                </div>
                {i.notes && <p className="mt-1 text-sm">{i.notes}</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Ver histórico"
                  onClick={() => setHistoryItem(i)}
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Editar item"
                  onClick={() => {
                    setEditing(i);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {i.status === "vendido" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Reverter venda"
                    onClick={() => setReverting(i)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Excluir item"
                  className="text-destructive"
                  onClick={() => setDeleting(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
          );
        })}
      </ul>

      <Button
        size="lg"
        className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 shadow-lg"
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      >
        <Plus className="mr-1 h-5 w-5" /> Novo item
      </Button>

      {formOpen && (
        <InventoryForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          item={editing}
        />
      )}

      <InventoryHistory item={historyItem} onOpenChange={(open) => !open && setHistoryItem(null)} />

      <MasterPasswordDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir item do estoque"
        description={
          deleting
            ? `${deleting.device_model} será removido junto com custo e histórico.`
            : undefined
        }
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />

      <Dialog open={!!reverting} onOpenChange={(open) => !open && setReverting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverter venda</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O aparelho volta para <strong>Disponível</strong> e o agendamento vinculado é cancelado.
            Informe o motivo da reversão.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: cliente devolveu, cartão estornado…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReverting(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || revert.isPending}
              onClick={() => reverting && revert.mutate({ item: reverting, why: reason.trim() })}
            >
              Confirmar reversão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}