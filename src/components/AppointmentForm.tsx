import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Info, Plus, Trash2 } from "lucide-react";
import {
  formatTime,
  PAYMENT_METHODS,
  type Appointment,
  type PaymentEntry,
} from "@/lib/agenda";
import { useAppointmentTags, useDeviceModels } from "@/lib/settings";
import {
  findAutoReserveItem,
  itemLabel,
  useAvailableItems,
  type InventoryItem,
} from "@/lib/inventory";
import { CustomerPicker } from "@/components/CustomerPicker";
import type { Customer } from "@/lib/customers";
import type { RecordType } from "@/lib/permissions";

const schema = z.object({
  customer_name: z.string().trim().min(1, "Informe o nome do cliente").max(120),
  device_model: z.string().trim().min(1, "Informe o modelo do aparelho").max(120),
  date: z.string().min(1, "Informe a data"),
  time: z.string().min(1, "Informe o horário"),
  customer_phone: z.string().trim().max(30).optional(),
  customer_instagram: z.string().trim().max(60).optional(),
  deposit_amount: z.string().trim().max(20).optional(),
  product_price: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  tag: z.string().trim().max(60).optional(),
});

function applyDiscount(
  price: number,
  kind: "nenhum" | "5" | "10" | "15" | "valor",
  value: string,
) {
  if (kind === "nenhum") return price;
  if (kind === "valor") {
    const v = Number(value.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return price;
    return Math.max(0, Math.round((price - v) * 100) / 100);
  }
  const pct = Number(kind);
  return Math.max(0, Math.round(price * (1 - pct / 100) * 100) / 100);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  appointment?: Appointment | null;
  recordType?: RecordType | undefined;
  /** Agendamento de origem quando esta venda é gerada por "Transformar em venda". */
  convertFrom?: Appointment | null;
};

export function AppointmentForm({
  open,
  onOpenChange,
  defaultDate,
  appointment,
  recordType,
  convertFrom,
}: Props) {
  const { user, fullName } = useAuth();
  /** Registro usado só para pré-preencher os campos (edição ou conversão). */
  const base: Appointment | null | undefined = appointment ?? convertFrom;
  const type: RecordType =
    recordType ?? (appointment?.record_type as RecordType | undefined) ?? "agendamento";
  const isVenda = type === "venda";
  const queryClient = useQueryClient();
  const [deposit, setDeposit] = useState(appointment?.deposit_paid ?? false);
  const [depositAmount, setDepositAmount] = useState<string>(
    appointment?.deposit_amount != null ? String(appointment.deposit_amount) : "",
  );
  const [payments, setPayments] = useState<PaymentEntry[]>(() => {
    const existing = base?.payments;
    if (existing && existing.length > 0) return existing;
    return [
      {
        method: base?.payment_method ?? "",
        installments: base?.installments ?? 1,
        installment_value: base?.installment_value ?? null,
      },
    ];
  });
  const [productPrice, setProductPrice] = useState<string>(
    base?.product_price != null ? String(base.product_price) : "",
  );
  const [model, setModel] = useState(base?.device_model ?? "");
  const [customerName, setCustomerName] = useState(base?.customer_name ?? "");
  const [customerId, setCustomerId] = useState<string | null>(
    base?.customer_id ?? null,
  );
  const [customerPhone, setCustomerPhone] = useState<string | null>(
    base?.customer_phone ?? null,
  );
  const [customerInstagram, setCustomerInstagram] = useState<string>(
    base?.customer_instagram ? `@${base.customer_instagram}` : "",
  );
  const [inventoryItemId, setInventoryItemId] = useState(base?.inventory_device_id ?? "");
  const [listPrice, setListPrice] = useState<number | null>(
    base?.product_price != null ? Number(base.product_price) : null,
  );
  const [discountKind, setDiscountKind] = useState<"nenhum" | "5" | "10" | "15" | "valor">(
    "nenhum",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [manualLink, setManualLink] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const { data: availableItems = [] } = useAvailableItems(
    model,
    base?.inventory_device_id ?? null,
  );

  /** Item que será efetivamente vinculado: escolhido manualmente ou o mais antigo (reserva automática). */
  const linkedItem: InventoryItem | undefined = inventoryItemId
    ? availableItems.find((i) => i.id === inventoryItemId)
    : availableItems[0];

  const lastLinkedId = useRef<string | null>(base?.inventory_device_id ?? null);
  useEffect(() => {
    if (!linkedItem) return;
    if (lastLinkedId.current === linkedItem.id) return;
    const price = linkedItem.sale_price != null ? Number(linkedItem.sale_price) : null;
    lastLinkedId.current = linkedItem.id;
    if (price == null) return;
    setListPrice(price);
    setProductPrice(String(applyDiscount(price, discountKind, discountValue)));
  }, [linkedItem, discountKind, discountValue]);

  const updatePayment = (index: number, patch: Partial<PaymentEntry>) =>
    setPayments((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const { data: models = [] } = useDeviceModels();
  const { data: tags = [] } = useAppointmentTags();
  const activeModels = models.filter((m) => m.active);
  const activeTags = tags.filter((t) => t.active);

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = schema.safeParse({
        customer_name: form.get("customer_name"),
        device_model: form.get("device_model"),
        date: form.get("date"),
        time: form.get("time"),
        customer_phone: form.get("customer_phone") ?? "",
        customer_instagram: form.get("customer_instagram") ?? "",
        deposit_amount: form.get("deposit_amount") ?? "",
        product_price: form.get("product_price") ?? "",
        notes: form.get("notes") ?? "",
        tag: form.get("tag") ?? "",
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const v = parsed.data;
      const amount = v.deposit_amount ? Number(v.deposit_amount.replace(",", ".")) : NaN;
      const price = v.product_price ? Number(v.product_price.replace(",", ".")) : NaN;
      const cleanPayments: PaymentEntry[] = payments
        .filter((p) => p.method)
        .map((p) => ({
          method: p.method,
          amount: p.amount ? Number(p.amount) : null,
          installments: p.method === "credito" ? (p.installments ?? 1) : null,
          installment_value:
            p.method === "credito" && p.installment_value ? Number(p.installment_value) : null,
        }));
      const first = cleanPayments[0];
      let linkedId: string | null = inventoryItemId || null;
      const modelChanged = !!appointment && appointment.device_model !== v.device_model;
      if (modelChanged && linkedId === (appointment?.inventory_device_id ?? null)) linkedId = null;
      let notFound: string | null = null;
      if (!linkedId) {
        const auto = await findAutoReserveItem(v.device_model);
        linkedId = auto?.id ?? null;
        if (!auto) notFound = v.device_model;
      }
      const payload = {
        customer_name: v.customer_name,
        device_model: v.device_model,
        customer_id: customerId,
        customer_phone: v.customer_phone || customerPhone || null,
        customer_instagram: v.customer_instagram
          ? v.customer_instagram.replace(/^@+/, "")
          : null,
        notes: v.notes || null,
        tag: v.tag || null,
        record_type: type,
        deposit_paid: isVenda ? false : deposit,
        deposit_amount:
          !isVenda && deposit && Number.isFinite(amount) && amount > 0 ? amount : null,
        product_price: Number.isFinite(price) && price > 0 ? price : null,
        payments: cleanPayments,
        payment_method: first?.method ?? null,
        installments: first?.installments ?? null,
        installment_value: first?.installment_value ?? null,
        scheduled_at: new Date(`${v.date}T${v.time}`).toISOString(),
        attendant_id: user!.id,
        inventory_device_id: linkedId,
        converted_from_appointment_id:
          convertFrom?.id ?? appointment?.converted_from_appointment_id ?? null,
      };
      const query = appointment
        ? supabase.from("appointments").update(payload).eq("id", appointment.id)
        : supabase.from("appointments").insert(payload);
      const { error } = await query;
      if (error) throw new Error(error.message);
      if (!appointment && convertFrom) {
        const { error: convertError } = await supabase
          .from("appointments")
          .update({ status: "convertido" })
          .eq("id", convertFrom.id);
        if (convertError) throw new Error(convertError.message);
      }
      return notFound;
    },
    onSuccess: (notFound) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      const noun = isVenda ? "Venda" : "Agendamento";
      toast.success(appointment ? `${noun} atualizado` : `${noun} criado`);
      if (notFound) {
        toast.warning(`Nenhum ${notFound} disponível em estoque no momento`);
      } else {
        toast.info("Aparelho reservado automaticamente para este agendamento");
      }
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const initialDate = appointment ? appointment.scheduled_at.slice(0, 10) : defaultDate;
  const initialTime = appointment ? formatTime(appointment.scheduled_at) : "10:00";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {appointment
              ? isVenda
                ? "Editar venda"
                : "Editar agendamento"
              : isVenda
                ? "💳 Nova venda"
                : "📅 Novo agendamento"}
          </DialogTitle>
        </DialogHeader>
        {convertFrom && !appointment && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Gerado a partir do agendamento de{" "}
            {new Date(convertFrom.scheduled_at).toLocaleDateString("pt-BR")} — revise os dados antes
            de salvar.
          </p>
        )}
        <form
          id="appointment-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(new FormData(e.currentTarget));
          }}
        >
          <CustomerPicker
            name={customerName}
            onNameChange={setCustomerName}
            customerId={customerId}
            onSelect={(c: Customer | null) => {
              setCustomerId(c?.id ?? null);
              if (c) {
                setCustomerName(c.name);
                setCustomerPhone(c.phone ?? c.whatsapp ?? null);
              }
            }}
          />
          <div className="space-y-1.5">
            <Label htmlFor="device_model">Modelo de interesse *</Label>
            {activeModels.length > 0 ? (
              <select
                id="device_model"
                name="device_model"
                defaultValue={base?.device_model ?? ""}
                required
                className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                onChange={(e) => {
                  setModel(e.target.value);
                  setInventoryItemId("");
                }}
              >
                <option value="">Selecione o modelo…</option>
                {activeModels.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
                {base?.device_model &&
                  !activeModels.some((m) => m.name === base.device_model) && (
                    <option value={base.device_model}>{base.device_model}</option>
                  )}
              </select>
            ) : (
              <Input
                id="device_model"
                name="device_model"
                placeholder="iPhone 13 128GB"
                defaultValue={base?.device_model ?? ""}
                required
                onChange={(e) => {
                  setModel(e.target.value);
                  setInventoryItemId("");
                }}
              />
            )}
          </div>
          {model && (
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              {linkedItem && (
                <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Aparelho vinculado</p>
                      <p className="truncate text-sm font-semibold">{linkedItem.device_model}</p>
                      <p className="text-xs text-muted-foreground">
                        {[linkedItem.color, linkedItem.storage].filter(Boolean).join(" · ") ||
                          "Sem cor/armazenamento informados"}
                      </p>
                      <p className="text-xs">
                        Valor de venda:{" "}
                        <strong>
                          {linkedItem.sale_price != null
                            ? Number(linkedItem.sale_price).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })
                            : "não cadastrado"}
                        </strong>
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Ver detalhes técnicos"
                      title="Ver detalhes técnicos"
                      onClick={() => setShowTechnical((v) => !v)}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                  {showTechnical && (
                    <div className="space-y-0.5 border-t border-border/60 pt-1 text-xs text-muted-foreground">
                      <p>Número de série: {linkedItem.serial_number || "—"}</p>
                      <p>E-mail (Apple ID): {linkedItem.apple_id || "—"}</p>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {availableItems.length === 0
                  ? `Nenhum ${model} disponível em estoque no momento — o agendamento é criado mesmo assim.`
                  : "A reserva é automática: o aparelho mais antigo deste modelo será reservado ao salvar."}
              </p>
              {availableItems.length > 0 && !manualLink && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setManualLink(true)}
                >
                  Trocar aparelho vinculado
                </Button>
              )}
              {manualLink && (
                <div className="space-y-1.5">
                  <Label htmlFor="inventory_device_id">Escolher outro aparelho</Label>
                  <select
                    id="inventory_device_id"
                    value={inventoryItemId}
                    onChange={(e) => setInventoryItemId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                  >
                    <option value="">Automático (mais antigo no estoque)</option>
                    {availableItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {itemLabel(i)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {activeTags.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="tag">Tag</Label>
              <select
                id="tag"
                name="tag"
                defaultValue={base?.tag ?? ""}
                className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
              >
                <option value="">Sem tag</option>
                {activeTags.map((t) => (
                  <option key={t.id} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" name="date" type="date" defaultValue={initialDate} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Horário *</Label>
              <Input id="time" name="time" type="time" defaultValue={initialTime} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer_instagram">@ do Instagram</Label>
            <Input
              id="customer_instagram"
              name="customer_instagram"
              placeholder="@cliente"
              value={customerInstagram}
              onChange={(e) => setCustomerInstagram(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product_price">Valor do produto (R$)</Label>
            <Input
              id="product_price"
              name="product_price"
              inputMode="decimal"
              placeholder="Ex.: 3500"
              value={productPrice}
              onChange={(e) => setProductPrice(e.target.value)}
            />
            <div className="flex gap-2">
              <Select
                value={discountKind}
                onValueChange={(v) => {
                  const kind = v as typeof discountKind;
                  setDiscountKind(kind);
                  const b = listPrice ?? Number(productPrice.replace(",", "."));
                  if (Number.isFinite(b)) {
                    setListPrice(b);
                    setProductPrice(String(applyDiscount(b, kind, discountValue)));
                  }
                }}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Desconto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem desconto</SelectItem>
                  <SelectItem value="5">5% de desconto</SelectItem>
                  <SelectItem value="10">10% de desconto</SelectItem>
                  <SelectItem value="15">15% de desconto</SelectItem>
                  <SelectItem value="valor">Valor em R$</SelectItem>
                </SelectContent>
              </Select>
              {discountKind === "valor" && (
                <Input
                  inputMode="decimal"
                  placeholder="Desconto R$"
                  value={discountValue}
                  onChange={(e) => {
                    setDiscountValue(e.target.value);
                    const b = listPrice ?? Number(productPrice.replace(",", "."));
                    if (Number.isFinite(b)) {
                      setProductPrice(String(applyDiscount(b, "valor", e.target.value)));
                    }
                  }}
                />
              )}
            </div>
            {discountKind !== "nenhum" && listPrice != null && (
              <p className="text-xs text-muted-foreground">
                Valor original: R$ {listPrice.toLocaleString("pt-BR")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Preenchido pelo valor de venda do aparelho vinculado. Editar aqui não altera o valor
              cadastrado no estoque.
            </p>
          </div>
          {!isVenda && (
            <div className="space-y-2 rounded-md border px-3 py-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="deposit">Sinal pago?</Label>
                <Switch id="deposit" checked={deposit} onCheckedChange={setDeposit} />
              </div>
              {deposit && (
                <div className="space-y-1.5">
                  <Label htmlFor="deposit_amount">Valor do sinal (R$)</Label>
                  <Input
                    id="deposit_amount"
                    name="deposit_amount"
                    inputMode="decimal"
                    placeholder="Ex.: 50, 100..."
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <div className="space-y-3 rounded-md border px-3 py-3">
            <p className="text-sm font-medium">Formas de pagamento</p>
            {payments.map((p, i) => (
              <div key={i} className="space-y-2 rounded-md bg-muted/30 p-2">
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Forma de pagamento ${i + 1}`}
                    value={p.method}
                    onChange={(e) => updatePayment(i, { method: e.target.value })}
                    className="h-9 flex-1 rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                  >
                    <option value="">Selecione…</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {payments.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remover forma de pagamento"
                      onClick={() => setPayments((rows) => rows.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Input
                  aria-label={`Valor no pagamento ${i + 1}`}
                  inputMode="decimal"
                  placeholder="Valor (R$)"
                  value={p.amount ?? ""}
                  onChange={(e) =>
                    updatePayment(i, {
                      amount: e.target.value ? Number(e.target.value.replace(",", ".")) : null,
                    })
                  }
                />
                {p.method === "credito" && (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Parcelas"
                      value={String(p.installments ?? 1)}
                      onChange={(e) => updatePayment(i, { installments: Number(e.target.value) })}
                      className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                    >
                      {Array.from({ length: 18 }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}x
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Valor da parcela"
                      inputMode="decimal"
                      placeholder="Valor da parcela"
                      value={p.installment_value ?? ""}
                      onChange={(e) =>
                        updatePayment(i, {
                          installment_value: e.target.value
                            ? Number(e.target.value.replace(",", "."))
                            : null,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                setPayments((rows) => [
                  ...rows,
                  { method: "", amount: null, installments: 1, installment_value: null },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar forma de pagamento
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={base?.notes ?? ""} />
          </div>
          <p className="text-xs text-muted-foreground">
            Atendente responsável: <span className="font-medium text-foreground">{fullName}</span>
          </p>
        </form>
        <DialogFooter>
          <Button type="submit" form="appointment-form" disabled={mutation.isPending}>
            {appointment ? "Salvar" : isVenda ? "Criar venda" : "Criar agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}