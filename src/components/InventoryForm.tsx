import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
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
import { useDeviceModels } from "@/lib/settings";
import { extractDeviceFromPhoto } from "@/lib/inventory-vision.functions";
import { PAYMENT_METHODS, formatBRL, paymentsTotal, type PaymentEntry } from "@/lib/agenda";
import {
  INVENTORY_STATUS_LABEL,
  INVENTORY_STATUSES,
  logInventoryEvent,
  todayForInventory,
  type InventoryItem,
  type InventoryStatus,
} from "@/lib/inventory";

const schema = z.object({
  device_model: z.string().trim().min(1, "Selecione o modelo do aparelho").max(120),
  color: z.string().trim().max(60).optional(),
  storage: z.string().trim().max(60).optional(),
  serial_number: z.string().trim().max(80).optional(),
  imei: z.string().trim().max(40).optional(),
  battery_health: z.string().trim().max(4).optional(),
  cost_price: z.string().trim().optional(),
  sale_price: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  entered_at: z.string().min(1, "Informe a data de entrada"),
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground";

function toNumber(value?: string) {
  if (!value) return null;
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function batteryToNumber(value?: string) {
  if (!value) return null;
  const n = Math.round(Number(value.replace("%", "").trim()));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function InventoryForm({
  open,
  onOpenChange,
  item,
  defaults,
  tradeIn,
  onSaved,
  onCancelFlow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
  defaults?: {
    device_model?: string;
    cost_price?: number;
    sale_price?: number;
    color?: string;
    storage?: string;
    battery_health?: number | null;
    condition?: "lacrado" | "seminovo";
    notes?: string;
  };
  /** Fluxo de troca/upgrade: o modal fica travado até o cadastro ser salvo. */
  tradeIn?:
    | { appointmentId: string; customerName: string; payments?: PaymentEntry[] | null }
    | undefined;
  onSaved?: ((itemId: string, payments: PaymentEntry[]) => void) | undefined;
  onCancelFlow?: (() => void) | undefined;
}) {
  const locked = !!tradeIn;
  const { user, role } = useAuth();
  const isGerente = role === "gerente";
  const queryClient = useQueryClient();
  const { data: models = [] } = useDeviceModels();
  const activeModels = models.filter((m) => m.active);
  const [status, setStatus] = useState<InventoryStatus>(item?.status ?? "disponivel");
  const [condition, setCondition] = useState<"lacrado" | "seminovo">(
    item?.condition ?? defaults?.condition ?? "seminovo",
  );
  const [costPrice, setCostPrice] = useState(
    defaults?.cost_price != null ? String(defaults.cost_price) : "",
  );
  const [salePrice, setSalePrice] = useState(
    item?.sale_price != null
      ? String(item.sale_price)
      : defaults?.sale_price != null
        ? String(defaults.sale_price)
        : "",
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const extract = useServerFn(extractDeviceFromPhoto);
  const [reading, setReading] = useState(false);
  const [batch, setBatch] = useState(false);
  const [batchLines, setBatchLines] = useState("");
  /** Formas de pagamento do cliente nesta venda de upgrade. */
  const [payments, setPayments] = useState<PaymentEntry[]>(() =>
    tradeIn?.payments && tradeIn.payments.length > 0
      ? tradeIn.payments
      : [{ method: "pix", amount: null, installments: null, installment_value: null }],
  );

  function updatePayment(index: number, patch: Partial<PaymentEntry>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  /** Formas de pagamento válidas (com valor informado). */
  const cleanPayments: PaymentEntry[] = payments
    .filter((p) => p.method)
    .map((p) => ({
      method: p.method,
      amount: p.amount != null && Number(p.amount) > 0 ? Number(p.amount) : null,
      installments: p.method === "credito" ? (p.installments ?? null) : null,
      installment_value: p.method === "credito" ? (p.installment_value ?? null) : null,
    }))
    .filter((p) => (p.amount ?? 0) > 0 || ((p.installments ?? 0) > 0 && (p.installment_value ?? 0) > 0));

  function setField(name: string, value: string) {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (el) el.value = value;
  }

  async function handlePhoto(files: File[]) {
    setReading(true);
    try {
      const images = await Promise.all(
        files.slice(0, 5).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Não foi possível ler a foto"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      const result = await extract({
        data: { images, condition, models: activeModels.map((m) => m.name) },
      });
      let filled = 0;
      if (result.device_model && activeModels.some((m) => m.name === result.device_model)) {
        setField("device_model", result.device_model);
        filled++;
      }
      if (result.serial_number) {
        setField("serial_number", result.serial_number);
        filled++;
      }
      if (result.imei) {
        setField("imei", result.imei);
        filled++;
      }
      if (result.color && condition === "lacrado") {
        setField("color", result.color);
        filled++;
      }
      if (result.storage) {
        setField("storage", result.storage);
        filled++;
      }
      if (filled === 0) toast.info("Nada legível na foto — preencha manualmente.");
      else toast.success(`${filled} campo(s) preenchido(s). Confira antes de salvar.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler a foto");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = schema.safeParse({
        device_model: form.get("device_model"),
        color: form.get("color") ?? "",
        storage: form.get("storage") ?? "",
        serial_number: form.get("serial_number") ?? "",
        imei: form.get("imei") ?? "",
        battery_health: form.get("battery_health") ?? "",
        cost_price: form.get("cost_price") ?? "",
        sale_price: form.get("sale_price") ?? "",
        notes: form.get("notes") ?? "",
        entered_at: form.get("entered_at"),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const v = parsed.data;
      const cost = toNumber(v.cost_price);
      if (!item && !cost) throw new Error("Informe o valor de custo do aparelho");

      if (locked && cleanPayments.length === 0) {
        throw new Error("Informe como o cliente pagou (Pix, débito, crédito ou dinheiro)");
      }
      if (locked && !toNumber(v.sale_price)) {
        throw new Error("Informe o valor de venda do aparelho recebido na troca");
      }

      const completingIncomplete =
        item?.status === "incompleto" && status === "incompleto" && !!v.serial_number;
      /** Na troca, a situação segue a regra padrão: sem série o item entra como Incompleto. */
      const tradeStatus: InventoryStatus = v.serial_number ? "disponivel" : "incompleto";

      const payload = {
        device_model: v.device_model,
        color: v.color || null,
        storage: v.storage || null,
        serial_number: v.serial_number || null,
        imei: v.imei || null,
        battery_health: batteryToNumber(v.battery_health),
        condition,
        sale_price: toNumber(v.sale_price),
        notes: v.notes || null,
        status: locked
          ? tradeStatus
          : completingIncomplete
            ? ("disponivel" as InventoryStatus)
            : status,
        entered_at: v.entered_at,
      };

      if (item) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", item.id);
        if (error) throw new Error(error.message);
        if (completingIncomplete) {
          await logInventoryEvent({
            itemId: item.id,
            kind: "cadastro_completado",
            reason: "Número de série informado — item liberado como Disponível",
            actorId: user?.id ?? null,
          });
        }
        if (cost && isGerente) {
          const { error: costError } = await supabase
            .from("inventory_costs")
            .upsert({ item_id: item.id, cost_price: cost }, { onConflict: "item_id" });
          if (costError) throw new Error(costError.message);
        }
        return null;
      }

      if (batch && !locked) {
        const units = batchLines
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [serial, appleId] = line.split(/[;,\t]/).map((p) => p.trim());
            return { serial_number: serial || null, apple_id: appleId || null };
          });
        if (units.length === 0) throw new Error("Informe pelo menos uma unidade (uma por linha)");
        const { data: rows, error: batchError } = await supabase
          .from("inventory_items")
          .insert(
            units.map((u) => ({
              ...payload,
              serial_number: u.serial_number,
              apple_id: u.apple_id,
              imei: null,
              created_by: user?.id ?? null,
            })),
          )
          .select("id");
        if (batchError) throw new Error(batchError.message);
        const { error: costsError } = await supabase
          .from("inventory_costs")
          .insert((rows ?? []).map((r) => ({ item_id: r.id, cost_price: cost! })));
        if (costsError) throw new Error(costsError.message);
        return null;
      }

      const { data, error } = await supabase
        .from("inventory_items")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { error: costError } = await supabase
        .from("inventory_costs")
        .insert({ item_id: data!.id, cost_price: cost! });
      if (costError) throw new Error(costError.message);
      if (tradeIn) {
        await logInventoryEvent({
          itemId: data!.id,
          kind: "criado_via_troca",
          reason: `Recebido na venda de ${tradeIn.customerName}`,
          appointmentId: tradeIn.appointmentId,
          actorId: user?.id ?? null,
        });
      }
      return data!.id as string;
    },
    onSuccess: (createdId) => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_costs"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_events"] });
      queryClient.invalidateQueries({ queryKey: ["trade_item"] });
      toast.success(
        item ? "Item atualizado" : batch ? "Itens cadastrados em lote" : "Item cadastrado no estoque",
      );
      onOpenChange(false);
      if (createdId && onSaved) onSaved(createdId, cleanPayments);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={locked ? () => {} : onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-md"
        hideClose={locked}
        {...(locked
          ? {
              onInteractOutside: (e: Event) => e.preventDefault(),
              onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
              onPointerDownOutside: (e: Event) => e.preventDefault(),
            }
          : {})}
      >
        <DialogHeader>
          <DialogTitle>
            {locked
              ? "Cadastrar aparelho recebido na troca"
              : item
                ? "Editar item de estoque"
                : "Novo item de estoque"}
          </DialogTitle>
        </DialogHeader>
        {locked && (
          <p className="text-sm text-muted-foreground">
            Venda com tag Upgrade: cadastre o aparelho que está entrando para concluir. Use a foto
            para preencher modelo, série e capacidade — informe o valor de custo e o de venda.
          </p>
        )}
        <form
          id="inventory-form"
          ref={formRef}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <Label htmlFor="condition">Tipo de aparelho</Label>
            <select
              id="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as "lacrado" | "seminovo")}
              className={selectClass}
            >
              <option value="lacrado">Lacrado</option>
              <option value="seminovo">Seminovo</option>
            </select>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple={condition === "seminovo"}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void handlePhoto(files);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={reading}
              onClick={() => fileRef.current?.click()}
            >
              {reading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              {reading
                ? "Lendo foto…"
                : condition === "lacrado"
                  ? "Tirar/enviar foto da caixa"
                  : "Tirar/enviar fotos da tela de Ajustes"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {condition === "seminovo"
                ? "Opcional: envie até 5 fotos da tela Ajustes > Geral > Sobre (role a tela). Preenche modelo, número de série, capacidade e IMEI — tudo continua editável."
                : "Opcional: preenche modelo, número de série, IMEI, cor e capacidade. Você pode pular e digitar tudo manualmente."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="device_model">Modelo *</Label>
            <select
              id="device_model"
              name="device_model"
              required
              defaultValue={item?.device_model ?? defaults?.device_model ?? ""}
              className={selectClass}
            >
              <option value="">Selecione o modelo…</option>
              {activeModels.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
              {item && !activeModels.some((m) => m.name === item.device_model) && (
                <option value={item.device_model}>{item.device_model}</option>
              )}
              {!item &&
                defaults?.device_model &&
                !activeModels.some((m) => m.name === defaults.device_model) && (
                  <option value={defaults.device_model}>{defaults.device_model}</option>
                )}
            </select>
          </div>
          {!item && !locked && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={batch}
                  onChange={(e) => setBatch(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Cadastrar em lote
              </label>
              <p className="text-xs text-muted-foreground">
                Vários aparelhos iguais (mesmo modelo, cor, armazenamento e custo). Informe uma
                unidade por linha: número de série e, se quiser, o e-mail (Apple ID) separado por
                ponto e vírgula.
              </p>
              {batch && (
                <Textarea
                  rows={5}
                  value={batchLines}
                  onChange={(e) => setBatchLines(e.target.value)}
                  placeholder={"F2LX...; email1@icloud.com\nF3MZ...; email2@icloud.com"}
                />
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" name="color" placeholder="Meia-noite" defaultValue={item?.color ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage">Armazenamento</Label>
              <Input id="storage" name="storage" placeholder="256GB" defaultValue={item?.storage ?? ""} />
            </div>
          </div>
          {!batch && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="serial_number">Número de série</Label>
                <Input
                  id="serial_number"
                  name="serial_number"
                  placeholder="Recomendado"
                  defaultValue={item?.serial_number ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imei">IMEI</Label>
                <Input id="imei" name="imei" placeholder="Opcional" defaultValue={item?.imei ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="battery_health">Saúde da bateria (%)</Label>
                <Input
                  id="battery_health"
                  name="battery_health"
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  placeholder="Ex.: 89"
                  defaultValue={item?.battery_health ?? ""}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(isGerente || !item) && (
              <div className="space-y-1.5">
                <Label htmlFor="cost_price">Valor de custo (R$){item ? "" : " *"}</Label>
                <Input
                  id="cost_price"
                  name="cost_price"
                  inputMode="decimal"
                  placeholder="Ex.: 2800"
                  defaultValue={defaults?.cost_price != null ? String(defaults.cost_price) : ""}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sale_price">Venda sugerida (R$)</Label>
              <Input
                id="sale_price"
                name="sale_price"
                inputMode="decimal"
                placeholder="Ex.: 3500"
                defaultValue={item?.sale_price != null ? String(item.sale_price) : ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!locked && (
            <div className="space-y-1.5">
              <Label htmlFor="status">Situação</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as InventoryStatus)}
                className={selectClass}
              >
                {INVENTORY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INVENTORY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="entered_at">Entrada no estoque</Label>
              <Input
                id="entered_at"
                name="entered_at"
                type="date"
                defaultValue={item?.entered_at ?? todayForInventory()}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Ex.: tela com risco, bateria a trocar…"
              defaultValue={item?.notes ?? ""}
            />
          </div>
          {locked && (
            <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <Label>Como o cliente pagou a diferença *</Label>
                <span className="text-xs text-muted-foreground">
                  Total: {formatBRL(paymentsTotal(cleanPayments))}
                </span>
              </div>
              {payments.map((p, i) => (
                <div key={i} className="space-y-2 rounded-md border bg-card/40 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Forma de pagamento"
                      value={p.method}
                      onChange={(e) => updatePayment(i, { method: e.target.value })}
                      className={selectClass}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Valor pago"
                      inputMode="decimal"
                      placeholder="Valor (R$)"
                      value={p.amount ?? ""}
                      onChange={(e) =>
                        updatePayment(i, {
                          amount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  {p.method === "credito" && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Parcelas"
                        value={p.installments ?? ""}
                        onChange={(e) =>
                          updatePayment(i, {
                            installments: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        className={selectClass}
                      >
                        <option value="">Parcelas…</option>
                        {Array.from({ length: 18 }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label="Valor da parcela"
                        inputMode="decimal"
                        placeholder="Valor da parcela (R$)"
                        value={p.installment_value ?? ""}
                        onChange={(e) =>
                          updatePayment(i, {
                            installment_value:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  )}
                  {payments.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Remover forma de pagamento
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setPayments((prev) => [
                    ...prev,
                    { method: "pix", amount: null, installments: null, installment_value: null },
                  ])
                }
              >
                Adicionar outra forma de pagamento
              </Button>
            </div>
          )}
        </form>
        <DialogFooter>
          {locked && (
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => onCancelFlow?.()}
            >
              Cancelar conclusão da venda
            </Button>
          )}
          <Button type="submit" form="inventory-form" disabled={mutation.isPending}>
            {item ? "Salvar" : batch && !locked ? "Cadastrar lote" : "Cadastrar item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}