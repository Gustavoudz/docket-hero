import { useState } from "react";
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
import { Plus, Trash2 } from "lucide-react";
import {
  formatTime,
  PAYMENT_METHODS,
  type Appointment,
  type PaymentEntry,
} from "@/lib/agenda";
import { useAppointmentTags, useDeviceModels } from "@/lib/settings";

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  appointment?: Appointment | null;
};

export function AppointmentForm({ open, onOpenChange, defaultDate, appointment }: Props) {
  const { user, fullName } = useAuth();
  const queryClient = useQueryClient();
  const [deposit, setDeposit] = useState(appointment?.deposit_paid ?? false);
  const [depositAmount, setDepositAmount] = useState<string>(
    appointment?.deposit_amount != null ? String(appointment.deposit_amount) : "",
  );
  const [payments, setPayments] = useState<PaymentEntry[]>(() => {
    const existing = appointment?.payments;
    if (existing && existing.length > 0) return existing;
    return [
      {
        method: appointment?.payment_method ?? "",
        installments: appointment?.installments ?? 1,
        installment_value: appointment?.installment_value ?? null,
      },
    ];
  });
  const [productPrice, setProductPrice] = useState<string>(
    appointment?.product_price != null ? String(appointment.product_price) : "",
  );

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
      const payload = {
        customer_name: v.customer_name,
        device_model: v.device_model,
        customer_phone: v.customer_phone || null,
        customer_instagram: v.customer_instagram
          ? v.customer_instagram.replace(/^@+/, "")
          : null,
        notes: v.notes || null,
        tag: v.tag || null,
        deposit_paid: deposit,
        deposit_amount: deposit && Number.isFinite(amount) && amount > 0 ? amount : null,
        product_price: Number.isFinite(price) && price > 0 ? price : null,
        payments: cleanPayments,
        payment_method: first?.method ?? null,
        installments: first?.installments ?? null,
        installment_value: first?.installment_value ?? null,
        scheduled_at: new Date(`${v.date}T${v.time}`).toISOString(),
        attendant_id: user!.id,
      };
      const query = appointment
        ? supabase.from("appointments").update(payload).eq("id", appointment.id)
        : supabase.from("appointments").insert(payload);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(appointment ? "Agendamento atualizado" : "Agendamento criado");
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
          <DialogTitle>{appointment ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
        </DialogHeader>
        <form
          id="appointment-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="customer_name">Cliente *</Label>
            <Input
              id="customer_name"
              name="customer_name"
              defaultValue={appointment?.customer_name ?? ""}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="device_model">Modelo de interesse *</Label>
            {activeModels.length > 0 ? (
              <select
                id="device_model"
                name="device_model"
                defaultValue={appointment?.device_model ?? ""}
                required
                className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
              >
                <option value="">Selecione o modelo…</option>
                {activeModels.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
                {appointment?.device_model &&
                  !activeModels.some((m) => m.name === appointment.device_model) && (
                    <option value={appointment.device_model}>{appointment.device_model}</option>
                  )}
              </select>
            ) : (
              <Input
                id="device_model"
                name="device_model"
                placeholder="iPhone 13 128GB"
                defaultValue={appointment?.device_model ?? ""}
                required
              />
            )}
          </div>
          {activeTags.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="tag">Tag</Label>
              <select
                id="tag"
                name="tag"
                defaultValue={appointment?.tag ?? ""}
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
              defaultValue={
                appointment?.customer_instagram ? `@${appointment.customer_instagram}` : ""
              }
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
          </div>
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
            <Textarea id="notes" name="notes" rows={3} defaultValue={appointment?.notes ?? ""} />
          </div>
          <p className="text-xs text-muted-foreground">
            Atendente responsável: <span className="font-medium text-foreground">{fullName}</span>
          </p>
        </form>
        <DialogFooter>
          <Button type="submit" form="appointment-form" disabled={mutation.isPending}>
            {appointment ? "Salvar" : "Criar agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}