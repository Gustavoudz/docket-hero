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
import { formatTime, PAYMENT_METHODS, type Appointment } from "@/lib/agenda";
import { useAppointmentTags, useDeviceModels } from "@/lib/settings";

const schema = z.object({
  customer_name: z.string().trim().min(1, "Informe o nome do cliente").max(120),
  device_model: z.string().trim().min(1, "Informe o modelo do aparelho").max(120),
  date: z.string().min(1, "Informe a data"),
  time: z.string().min(1, "Informe o horário"),
  customer_phone: z.string().trim().max(30).optional(),
  customer_instagram: z.string().trim().max(60).optional(),
  deposit_amount: z.string().trim().max(20).optional(),
  payment_method: z.string().trim().max(20).optional(),
  installments: z.string().trim().max(3).optional(),
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
  const [payment, setPayment] = useState(appointment?.payment_method ?? "");
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
        payment_method: form.get("payment_method") ?? "",
        installments: form.get("installments") ?? "",
        notes: form.get("notes") ?? "",
        tag: form.get("tag") ?? "",
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const v = parsed.data;
      const amount = v.deposit_amount ? Number(v.deposit_amount.replace(",", ".")) : NaN;
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
        payment_method: v.payment_method || null,
        installments:
          v.payment_method === "credito" && v.installments ? Number(v.installments) : null,
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
                  defaultValue={appointment?.deposit_amount ?? ""}
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_method">Forma de pagamento</Label>
            <select
              id="payment_method"
              name="payment_method"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
            >
              <option value="">Selecione…</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {payment === "credito" && (
            <div className="space-y-1.5">
              <Label htmlFor="installments">Parcelas no crédito</Label>
              <select
                id="installments"
                name="installments"
                defaultValue={String(appointment?.installments ?? 1)}
                className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </div>
          )}
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