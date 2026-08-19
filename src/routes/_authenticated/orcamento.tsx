import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  ArrowRightLeft,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CardListSkeleton } from "@/components/ListSkeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useIncrementalList } from "@/hooks/useIncrementalList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useInventoryItems } from "@/lib/inventory";
import { formatBRL, todayISO } from "@/lib/agenda";
import { useDeviceModels } from "@/lib/settings";
import { ComboboxInput } from "@/components/ComboboxInput";
import { AppointmentForm } from "@/components/AppointmentForm";
import { cn } from "@/lib/utils";
import {
  buildQuoteMessage,
  businessDeadline,
  formatDeadline,
  normalizeContact,
  quoteFinalPrice,
  STORAGE_SUGGESTIONS,
  useQuotes,
  type MessageTone,
  type Quote,
  type QuoteKind,
  type QuoteStatus,
} from "@/lib/quotes";

export const Route = createFileRoute("/_authenticated/orcamento")({
  head: () => ({
    meta: [
      { title: "Orçamento rápido — Legado Phones" },
      {
        name: "description",
        content:
          "Gere cotações rápidas para clientes do Direct, com upgrade, desconto e mensagem pronta para copiar.",
      },
      { property: "og:title", content: "Orçamento rápido — Legado Phones" },
      {
        property: "og:description",
        content:
          "Gere cotações rápidas para clientes do Direct, com upgrade, desconto e mensagem pronta para copiar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrcamentoPage,
});

const CONDITIONS = ["Excelente", "Bom", "Regular"] as const;

type Draft = {
  customer_name: string;
  customer_contact: string;
  inventory_item_id: string | null;
  product_model: string;
  product_color: string;
  product_storage: string;
  product_condition: string;
  product_price: string;
  product_battery: string;
  discount: string;
  notes: string;
  trade_model: string;
  trade_color: string;
  trade_storage: string;
  trade_condition: string;
  trade_value: string;
  trade_battery: string;
};

const emptyDraft: Draft = {
  customer_name: "",
  customer_contact: "",
  inventory_item_id: null,
  product_model: "",
  product_color: "",
  product_storage: "",
  product_condition: "",
  product_price: "",
  product_battery: "",
  discount: "",
  notes: "",
  trade_model: "",
  trade_color: "",
  trade_storage: "",
  trade_condition: "Bom",
  trade_value: "",
  trade_battery: "",
};

function num(value: string) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Converte um campo de bateria em inteiro 0-100 ou null. */
function batteryValue(raw: string) {
  const n = Math.round(Number(String(raw).replace("%", "").trim()));
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function FunnelPanel({ quotes }: { quotes: Quote[] }) {
  const cards: { status: QuoteStatus; label: string; className: string }[] = [
    {
      status: "enviado",
      label: "Enviados",
      className: "bg-sky-500/10 text-sky-400 ring-sky-500/30",
    },
    {
      status: "convertido",
      label: "Convertidos",
      className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
    },
    {
      status: "sem_resposta",
      label: "Sem resposta",
      className: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.status}
          className={cn("rounded-2xl p-4 ring-1", card.className)}
        >
          <p className="text-2xl font-semibold tabular-nums">
            {quotes.filter((q) => q.status === card.status).length}
          </p>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">{card.label}</p>
        </div>
      ))}
    </div>
  );
}

function MessageBox({ quote }: { quote: Quote }) {
  const [tone, setTone] = useState<MessageTone>("suave");
  const message = buildQuoteMessage(quote, tone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Copiado!");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <div className="space-y-3">
      <Tabs value={tone} onValueChange={(v) => setTone(v as MessageTone)}>
        <TabsList className="w-full rounded-xl">
          <TabsTrigger value="suave" className="flex-1 rounded-lg">
            Proposta suave
          </TabsTrigger>
          <TabsTrigger value="agressiva" className="flex-1 rounded-lg">
            Proposta agressiva
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="whitespace-pre-wrap rounded-2xl border bg-card p-4 text-sm leading-relaxed">
        {message}
      </p>
      <Button className="h-12 w-full rounded-xl text-base" onClick={copy}>
        <Copy className="mr-2 h-5 w-5" /> Copiar mensagem
      </Button>
    </div>
  );
}

/** Sugestões de modelo e armazenamento vindas do cadastro e do estoque. */
function useSuggestions() {
  const { data: items = [] } = useInventoryItems();
  const { data: deviceModels = [] } = useDeviceModels();
  const modelOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of deviceModels) if (m.active) names.add(m.name);
    for (const i of items) names.add(i.device_model);
    return [...names].sort();
  }, [deviceModels, items]);
  const storageOptions = useMemo(() => {
    const set = new Set(STORAGE_SUGGESTIONS);
    for (const i of items) if (i.storage) set.add(i.storage);
    return [...set];
  }, [items]);
  return { modelOptions, storageOptions };
}

function ProductPicker({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
}) {
  const { data: items = [] } = useInventoryItems();
  const { modelOptions, storageOptions } = useSuggestions();
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term, 300);
  const [manual, setManual] = useState(false);

  const results = useMemo(() => {
    const q = debouncedTerm.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((i) => i.status !== "vendido")
      .filter((i) =>
        [i.device_model, i.color, i.storage].filter(Boolean).join(" ").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, debouncedTerm]);

  return (
    <div className="space-y-2">
      <Label>Produto interessado</Label>
      {!manual && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-xl pl-9"
              placeholder="Buscar no estoque..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          {results.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      inventory_item_id: item.id,
                      product_model: item.device_model,
                      product_color: item.color ?? "",
                      product_storage: item.storage ?? "",
                      product_condition:
                        item.condition === "lacrado" ? "Lacrado" : "Seminovo",
                      product_price: item.sale_price ? String(item.sale_price) : "",
                      product_battery:
                        item.battery_health != null ? String(item.battery_health) : "",
                    }));
                    setTerm("");
                  }}
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-foreground/5"
                >
                  <span>
                    {[item.device_model, item.storage, item.color].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.sale_price ? formatBRL(Number(item.sale_price)) : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => {
              setManual(true);
              setDraft((prev) => ({ ...prev, inventory_item_id: null }));
            }}
          >
            Produto não cadastrado
          </button>
        </>
      )}

      {(manual || draft.product_model) && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Modelo</Label>
            <ComboboxInput
              ariaLabel="Modelo do produto"
              options={modelOptions}
              value={draft.product_model}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  product_model: value,
                  inventory_item_id: manual ? null : prev.inventory_item_id,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Armazenamento</Label>
            <ComboboxInput
              ariaLabel="Armazenamento do produto"
              options={storageOptions}
              placeholder="128GB"
              value={draft.product_storage}
              onChange={(value) => setDraft((prev) => ({ ...prev, product_storage: value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cor</Label>
            <Input
              className="rounded-lg"
              value={draft.product_color}
              onChange={(e) => setDraft((prev) => ({ ...prev, product_color: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Condição</Label>
            <Input
              className="rounded-lg"
              placeholder="Lacrado / Seminovo"
              value={draft.product_condition}
              onChange={(e) => setDraft((prev) => ({ ...prev, product_condition: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor de venda (R$)</Label>
            <Input
              className="rounded-lg"
              inputMode="decimal"
              value={draft.product_price}
              onChange={(e) => setDraft((prev) => ({ ...prev, product_price: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Saúde da bateria (%)</Label>
            <Input
              className="rounded-lg"
              inputMode="numeric"
              placeholder="Ex.: 89"
              value={draft.product_battery}
              onChange={(e) => setDraft((prev) => ({ ...prev, product_battery: e.target.value }))}
            />
          </div>
          {manual && (
            <button
              type="button"
              className="col-span-2 text-left text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => setManual(false)}
            >
              Voltar para busca no estoque
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuoteForm({
  kind,
  onCreated,
}: {
  kind: QuoteKind;
  onCreated: (quote: Quote) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const { modelOptions, storageOptions } = useSuggestions();

  const price = num(draft.product_price);
  const discount = num(draft.discount);
  const afterDiscount = Math.max(0, price - discount);
  const tradeValue = num(draft.trade_value);
  const finalValue =
    kind === "upgrade" ? Math.max(0, afterDiscount - tradeValue) : afterDiscount;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      if (!draft.product_model.trim()) throw new Error("Informe o produto");
      const payload = {
        seller_id: user.id,
        kind,
        status: "enviado" as const,
        customer_name: draft.customer_name.trim() || null,
        customer_contact: normalizeContact(draft.customer_contact),
        inventory_item_id: draft.inventory_item_id,
        product_model: draft.product_model.trim(),
        product_color: draft.product_color.trim() || null,
        product_storage: draft.product_storage.trim() || null,
        product_condition: draft.product_condition.trim() || null,
        product_price: price,
        product_battery_health: batteryValue(draft.product_battery),
        discount,
        notes: draft.notes.trim() || null,
        trade_model: kind === "upgrade" ? draft.trade_model.trim() || null : null,
        trade_color: kind === "upgrade" ? draft.trade_color.trim() || null : null,
        trade_storage: kind === "upgrade" ? draft.trade_storage.trim() || null : null,
        trade_condition: kind === "upgrade" ? draft.trade_condition || null : null,
        trade_value: kind === "upgrade" ? tradeValue : null,
        trade_battery_health: kind === "upgrade" ? batteryValue(draft.trade_battery) : null,
        deadline_at: businessDeadline(),
      };
      const { data, error } = await supabase.from("quotes").insert(payload).select().single();
      if (error) throw new Error(error.message);
      return { ...(data as unknown as Quote), product_price: price, discount, trade_value: payload.trade_value };
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      onCreated(quote);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome do cliente</Label>
        <Input
          className="rounded-xl"
          value={draft.customer_name}
          onChange={(e) => setDraft((prev) => ({ ...prev, customer_name: e.target.value }))}
          placeholder="Opcional"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Telefone / @ do Instagram</Label>
        <Input
          className="rounded-xl"
          value={draft.customer_contact}
          onChange={(e) => setDraft((prev) => ({ ...prev, customer_contact: e.target.value }))}
          placeholder="WhatsApp ou @usuario"
        />
        <p className="text-xs text-primary/80">Ajuda a gente a acompanhar depois</p>
      </div>

      <ProductPicker draft={draft} setDraft={setDraft} />

      <div className="space-y-1.5">
        <Label>Desconto (R$)</Label>
        <Input
          className="rounded-xl"
          inputMode="decimal"
          value={draft.discount}
          onChange={(e) => setDraft((prev) => ({ ...prev, discount: e.target.value }))}
          placeholder="0"
        />
      </div>

      {kind === "upgrade" && (
        <div className="space-y-3 rounded-2xl border bg-card p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Aparelho na troca
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Modelo</Label>
              <ComboboxInput
                ariaLabel="Modelo do aparelho na troca"
                options={modelOptions}
                value={draft.trade_model}
                onChange={(value) => setDraft((prev) => ({ ...prev, trade_model: value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Armazenamento</Label>
              <ComboboxInput
                ariaLabel="Armazenamento do aparelho na troca"
                options={storageOptions}
                placeholder="128GB"
                value={draft.trade_storage}
                onChange={(value) => setDraft((prev) => ({ ...prev, trade_storage: value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cor</Label>
              <Input
                className="rounded-lg"
                value={draft.trade_color}
                onChange={(e) => setDraft((prev) => ({ ...prev, trade_color: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Estado de conservação</Label>
              <div className="flex gap-2">
                {CONDITIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, trade_condition: c }))}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-2 text-xs transition-colors",
                      draft.trade_condition === c
                        ? "border-primary bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Valor avaliado (R$)</Label>
              <Input
                className="rounded-lg"
                inputMode="decimal"
                value={draft.trade_value}
                onChange={(e) => setDraft((prev) => ({ ...prev, trade_value: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Saúde da bateria da troca (%)</Label>
              <Input
                className="rounded-lg"
                inputMode="numeric"
                placeholder="Ex.: 82"
                value={draft.trade_battery}
                onChange={(e) => setDraft((prev) => ({ ...prev, trade_battery: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Observação</Label>
        <Textarea
          className="rounded-xl"
          rows={2}
          value={draft.notes}
          onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Ex: cliente quer rosa, confirmar se chega"
        />
      </div>

      <div className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/30">
        <p className="text-xs uppercase tracking-wide text-primary/80">
          {kind === "upgrade" ? "Valor final do upgrade" : "Valor final"}
        </p>
        <p className="text-2xl font-semibold text-primary">{formatBRL(finalValue)}</p>
      </div>

      <Button
        className="h-12 w-full rounded-xl text-base"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Gerar orçamento
      </Button>
    </div>
  );
}

function QuoteCard({ quote, onSchedule }: { quote: Quote; onSchedule: (quote: Quote) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function setStatus(status: QuoteStatus) {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", quote.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["quotes"] });
    toast.success("Status atualizado");
  }

  const final = quoteFinalPrice(quote);

  const statusStyle: Record<QuoteStatus, string> = {
    enviado: "bg-sky-500/15 text-sky-400",
    convertido: "bg-emerald-500/15 text-emerald-400",
    sem_resposta: "bg-amber-500/15 text-amber-400",
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {quote.customer_name?.trim() || "Cliente sem nome"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[quote.product_model, quote.product_storage, quote.product_condition]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
        <Badge className={cn("rounded-full border-0", statusStyle[quote.status])}>
          {quote.status === "sem_resposta"
            ? "Sem resposta"
            : quote.status === "convertido"
              ? "Convertido"
              : "Enviado"}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSchedule(quote)}>
              Transformar em agendamento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatus("convertido")}>
              Marcar como convertido
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatus("sem_resposta")}>
              Marcar como sem resposta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{formatBRL(final)}</span>
        {quote.kind === "upgrade" && <span>Upgrade</span>}
        {quote.customer_contact && <span>{quote.customer_contact}</span>}
        <span>Válido até {formatDeadline(quote.deadline_at)}</span>
      </div>
      {quote.notes && <p className="mt-2 text-xs text-muted-foreground">{quote.notes}</p>}

      <Button
        variant="outline"
        size="sm"
        className="mt-3 rounded-xl"
        onClick={() => setOpen(true)}
      >
        <Copy className="mr-2 h-4 w-4" /> Mensagem
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Mensagem para o cliente</DialogTitle>
          </DialogHeader>
          <MessageBox quote={quote} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrcamentoPage() {
  const { data: quotes = [], isLoading } = useQuotes();
  const [picking, setPicking] = useState(false);
  const [kind, setKind] = useState<QuoteKind | null>(null);
  const [created, setCreated] = useState<Quote | null>(null);
  const [scheduling, setScheduling] = useState<Quote | null>(null);
  const { visible, hasMore, sentinelRef } = useIncrementalList(quotes, 20);

  return (
    <AppShell>
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Zap className="h-5 w-5 text-primary" /> Orçamento rápido
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Cotações rápidas para os leads do Instagram Direct.
      </p>

      <div className="mt-4">
        <FunnelPanel quotes={quotes} />
      </div>

      <Button
        className="mt-4 h-12 w-full rounded-2xl text-base"
        onClick={() => {
          setKind(null);
          setCreated(null);
          setPicking(true);
        }}
      >
        <Plus className="mr-2 h-5 w-5" /> Novo orçamento
      </Button>

      <div className="mt-5 space-y-3">
        {isLoading && <CardListSkeleton rows={4} />}
        {!isLoading && quotes.length === 0 && (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum orçamento ainda.
          </p>
        )}
        {visible.map((q) => (
          <QuoteCard key={q.id} quote={q} onSchedule={setScheduling} />
        ))}
        {hasMore && (
          <div ref={sentinelRef}>
            <CardListSkeleton rows={2} />
          </div>
        )}
      </div>

      {scheduling && (
        <AppointmentForm
          key={scheduling.id}
          open={!!scheduling}
          onOpenChange={(o) => !o && setScheduling(null)}
          defaultDate={todayISO()}
          recordType="agendamento"
          fromQuote={scheduling}
        />
      )}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {created
                ? "Orçamento gerado"
                : kind
                  ? kind === "upgrade"
                    ? "Orçamento com Upgrade"
                    : "Orçamento simples"
                  : "Novo orçamento"}
            </DialogTitle>
          </DialogHeader>

          {created ? (
            <MessageBox quote={created} />
          ) : kind ? (
            <QuoteForm kind={kind} onCreated={setCreated} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setKind("simples")}
                className="rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
              >
                <Sparkles className="mb-2 h-6 w-6 text-primary" />
                <p className="font-medium">Orçamento simples</p>
                <p className="text-xs text-muted-foreground">Só o produto de interesse</p>
              </button>
              <button
                type="button"
                onClick={() => setKind("upgrade")}
                className="rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
              >
                <ArrowRightLeft className="mb-2 h-6 w-6 text-primary" />
                <p className="font-medium">Orçamento com Upgrade</p>
                <p className="text-xs text-muted-foreground">Com aparelho na troca</p>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
