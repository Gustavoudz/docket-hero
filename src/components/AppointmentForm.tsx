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
import { formatTime, type Appointment } from "@/lib/agenda";
import { useAppointmentTags, useDeviceModels } from "@/lib/settings";

const schema = z.object({
  customer_name: z.string().trim().min(1, "Informe o nome do cliente").max(120),
  device_model: z.string().trim().min(1, "Informe o modelo do aparelho").max(120),
  date: z.string().min(1, "Informe a data"),
  time: z.string().min(1, "Informe o horário"),
  customer_phone: z.string().trim().max(30).optional(),
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
        notes: form.get("notes") ?? "",
        tag: form.get("tag") ?? "",
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const v = parsed.data;
      const payload = {
        customer_name: v.customer_name,
        device_model: v.device_model,
        customer_phone: v.customer_phone || null,
        notes: v.notes || null,
        tag: v.tag || null,
        deposit_paid: deposit,
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
            <Label htmlFor="customer_phone">Telefone</Label>
            <Input
              id="customer_phone"
              name="customer_phone"
              inputMode="tel"
              defaultValue={appointment?.customer_phone ?? ""}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="deposit">Sinal pago?</Label>
            <Switch id="deposit" checked={deposit} onCheckedChange={setDeposit} />
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