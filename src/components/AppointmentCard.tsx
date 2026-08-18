import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Clock, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime, STATUS_LABEL, type Appointment } from "@/lib/agenda";

export function AppointmentCard({
  appointment,
  attendantName,
  onEdit,
}: {
  appointment: Appointment;
  attendantName?: string;
  onEdit?: ((a: Appointment) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const update = useMutation({
    mutationFn: async (patch: { status: Appointment["status"]; cancel_reason?: string }) => {
      const { error } = await supabase.from("appointments").update(patch).eq("id", appointment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setCancelOpen(false);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const badgeVariant =
    appointment.status === "concluido"
      ? "default"
      : appointment.status === "cancelado"
        ? "destructive"
        : "secondary";

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-muted py-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">{formatTime(appointment.scheduled_at)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{appointment.customer_name}</p>
            <Badge variant={badgeVariant}>{STATUS_LABEL[appointment.status]}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">{appointment.device_model}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {appointment.deposit_paid && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <BadgeCheck className="h-3.5 w-3.5" /> Sinal pago
              </span>
            )}
            {attendantName && <span>Atendente: {attendantName}</span>}
            {appointment.customer_phone && <span>{appointment.customer_phone}</span>}
          </div>
          {appointment.notes && <p className="mt-1 text-sm">{appointment.notes}</p>}
          {appointment.cancel_reason && (
            <p className="mt-1 text-sm text-destructive">Motivo: {appointment.cancel_reason}</p>
          )}
        </div>
      </div>

      {appointment.status === "pendente" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "concluido" })}
          >
            Concluir
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          {onEdit && (
            <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => onEdit(appointment)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {appointment.status !== "pendente" && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "pendente" })}
          >
            Reabrir
          </Button>
        </div>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo do cancelamento — é obrigatório.
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: cliente desistiu, achou mais barato..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || update.isPending}
              onClick={() => update.mutate({ status: "cancelado", cancel_reason: reason.trim() })}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}