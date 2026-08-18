import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Clock, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatBRL,
  type PaymentEntry,
  formatTime,
  PAYMENT_LABEL,
  STATUS_LABEL,
  type Appointment,
} from "@/lib/agenda";
import { useAppointmentTags, useCancelReasons, useStatusColors } from "@/lib/settings";
import { itemLabel, logInventoryEvent, useAvailableItems } from "@/lib/inventory";
import { useAuth } from "@/hooks/useAuth";

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
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkChoice, setLinkChoice] = useState("");
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const { user } = useAuth();
  const { data: availableItems = [] } = useAvailableItems(
    linkOpen ? appointment.device_model : "",
  );
  const [reason, setReason] = useState("");
  const [reasonChoice, setReasonChoice] = useState("");
  const { data: reasons = [] } = useCancelReasons();
  const { data: tags = [] } = useAppointmentTags();
  const statusColors = useStatusColors();
  const activeReasons = reasons.filter((r) => r.active);
  const finalReason = reasonChoice && reasonChoice !== "outro" ? reasonChoice : reason.trim();
  const tagColor = tags.find((t) => t.label === appointment.tag)?.color;
  const paymentEntries: PaymentEntry[] =
    appointment.payments && appointment.payments.length > 0
      ? appointment.payments
      : appointment.payment_method
        ? [
            {
              method: appointment.payment_method,
              amount: null,
              installments: appointment.installments ?? null,
              installment_value: appointment.installment_value ?? null,
            },
          ]
        : [];

  const update = useMutation({
    mutationFn: async (patch: {
      status: Appointment["status"];
      cancel_reason?: string;
      inventory_device_id?: string | null;
    }) => {
      const { error } = await supabase.from("appointments").update(patch).eq("id", appointment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setCancelOpen(false);
      setLinkOpen(false);
      setLinkChoice("");
      setReason("");
      setReasonChoice("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revert = useMutation({
    mutationFn: async (why: string) => {
      const itemId = appointment.inventory_device_id;
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelado", cancel_reason: `Venda revertida: ${why}` })
        .eq("id", appointment.id);
      if (error) throw new Error(error.message);
      if (itemId) {
        await logInventoryEvent({
          itemId,
          kind: "reversao",
          reason: why,
          appointmentId: appointment.id,
          actorId: user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success("Venda revertida — aparelho voltou para o estoque");
      setRevertOpen(false);
      setRevertReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="rounded-lg border bg-card p-3 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-muted py-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">{formatTime(appointment.scheduled_at)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{appointment.customer_name}</p>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-black"
              style={{ backgroundColor: statusColors[appointment.status] }}
            >
              {STATUS_LABEL[appointment.status]}
            </span>
            {appointment.tag && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-black"
                style={{ backgroundColor: tagColor ?? "#94a3b8" }}
              >
                {appointment.tag}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{appointment.device_model}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {appointment.deposit_paid && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-black"
                style={{ backgroundColor: statusColors[appointment.status === "concluido" ? "concluido" : "pendente"] }}
              >
                <BadgeCheck className="h-3.5 w-3.5" /> Sinal pago
                {appointment.deposit_amount ? ` · ${formatBRL(Number(appointment.deposit_amount))}` : ""}
              </span>
            )}
            {paymentEntries.map((p, i) => (
              <span key={i}>
                {PAYMENT_LABEL[p.method] ?? p.method}
                {p.amount && p.amount > 0 ? ` · ${formatBRL(p.amount)}` : ""}
                {p.method === "credito" && p.installments
                  ? ` ${p.installments}x${
                      p.installment_value ? ` de ${formatBRL(Number(p.installment_value))}` : ""
                    }`
                  : ""}
              </span>
            ))}
            {attendantName && <span>Atendente: {attendantName}</span>}
            {appointment.customer_instagram && <span>@{appointment.customer_instagram}</span>}
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
            onClick={() => {
              if (appointment.inventory_device_id) {
                update.mutate({ status: "concluido" });
              } else {
                setLinkOpen(true);
              }
            }}
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
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "pendente" })}
          >
            Reabrir
          </Button>
          {appointment.status === "concluido" && appointment.inventory_device_id && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRevertOpen(true)}
            >
              Reverter venda
            </Button>
          )}
        </div>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular aparelho do estoque</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Para concluir a venda é obrigatório escolher o aparelho real de{" "}
            <strong>{appointment.device_model}</strong> que saiu do estoque.
          </p>
          <select
            aria-label="Aparelho do estoque"
            value={linkChoice}
            onChange={(e) => setLinkChoice(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
          >
            <option value="">Selecione o aparelho…</option>
            {availableItems.map((i) => (
              <option key={i.id} value={i.id}>
                {itemLabel(i)}
              </option>
            ))}
          </select>
          {availableItems.length === 0 && (
            <p className="text-sm text-destructive">
              Nenhum aparelho disponível deste modelo. Cadastre o item no estoque antes de concluir.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>
              Voltar
            </Button>
            <Button
              disabled={!linkChoice || update.isPending}
              onClick={() =>
                update.mutate({ status: "concluido", inventory_device_id: linkChoice })
              }
            >
              Concluir venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revertOpen} onOpenChange={setRevertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverter venda</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O aparelho volta para Disponível no estoque. Informe o motivo.
          </p>
          <Textarea
            value={revertReason}
            onChange={(e) => setRevertReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: cliente devolveu, cartão estornado…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevertOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!revertReason.trim() || revert.isPending}
              onClick={() => revert.mutate(revertReason.trim())}
            >
              Confirmar reversão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo do cancelamento — é obrigatório.
            </p>
            {activeReasons.length > 0 && (
              <select
                aria-label="Motivo pré-definido"
                value={reasonChoice}
                onChange={(e) => setReasonChoice(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
              >
                <option value="">Selecione um motivo…</option>
                {activeReasons.map((r) => (
                  <option key={r.id} value={r.label}>
                    {r.label}
                  </option>
                ))}
                <option value="outro">Outro (escrever)</option>
              </select>
            )}
            {(activeReasons.length === 0 || reasonChoice === "outro" || !reasonChoice) && (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: cliente desistiu, achou mais barato..."
            />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!finalReason || update.isPending}
              onClick={() => update.mutate({ status: "cancelado", cancel_reason: finalReason })}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}