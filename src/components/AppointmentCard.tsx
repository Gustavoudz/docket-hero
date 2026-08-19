import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Clock, Pencil, ShoppingCart, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import {
  formatBRL,
  type PaymentEntry,
  formatTime,
  PAYMENT_LABEL,
  STATUS_LABEL,
  type Appointment,
} from "@/lib/agenda";
import { useAppointmentTags, useCancelReasons, useDeviceModels, useStatusColors } from "@/lib/settings";
import { itemLabel, logInventoryEvent, todayForInventory, useAvailableItems } from "@/lib/inventory";
import { useAuth } from "@/hooks/useAuth";

export function AppointmentCard({
  appointment,
  attendantName,
  onEdit,
  onConvert,
}: {
  appointment: Appointment;
  attendantName?: string;
  onEdit?: ((a: Appointment) => void) | undefined;
  onConvert?: ((a: Appointment) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkChoice, setLinkChoice] = useState("");
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [isTrade, setIsTrade] = useState<boolean | null>(null);
  const [tradeModel, setTradeModel] = useState("");
  const [tradeCost, setTradeCost] = useState("");
  const { user, role } = useAuth();
  const isAgendamento = (appointment.record_type ?? "agendamento") === "agendamento";
  const canConvert =
    !!onConvert &&
    isAgendamento &&
    appointment.status === "pendente" &&
    (role === "atendente" || role === "gerente");

  /** Agendamento de origem, quando esta venda foi gerada por conversão. */
  const { data: sourceAppointment } = useQuery({
    queryKey: ["appointment", "source", appointment.converted_from_appointment_id],
    enabled: !!appointment.converted_from_appointment_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, scheduled_at, customer_name, device_model, status")
        .eq("id", appointment.converted_from_appointment_id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const { data: availableItems = [] } = useAvailableItems(
    linkOpen || completeOpen ? appointment.device_model : "",
  );
  const { data: deviceModels = [] } = useDeviceModels();
  const activeModels = deviceModels.filter((m) => m.active);
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

  const complete = useMutation({
    mutationFn: async () => {
      const itemId = appointment.inventory_device_id ?? linkChoice ?? "";
      if (!itemId) throw new Error("Não é possível concluir sem um aparelho vinculado ao estoque.");
      const { error } = await supabase
        .from("appointments")
        .update({ status: "concluido", inventory_device_id: itemId })
        .eq("id", appointment.id);
      if (error) throw new Error(error.message);

      if (!isTrade) return;
      const cost = Number(tradeCost.replace(/\./g, "").replace(",", "."));
      const { data: created, error: itemError } = await supabase
        .from("inventory_items")
        .insert({
          device_model: tradeModel,
          condition: "seminovo",
          status: "incompleto",
          entered_at: todayForInventory(),
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (itemError) throw new Error(itemError.message);
      const { error: costError } = await supabase
        .from("inventory_costs")
        .insert({ item_id: created!.id, cost_price: cost });
      if (costError) throw new Error(costError.message);
      await logInventoryEvent({
        itemId: created!.id,
        kind: "criado_via_troca",
        reason: `Recebido na venda de ${appointment.customer_name}`,
        appointmentId: appointment.id,
        actorId: user?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success(
        isTrade
          ? "Venda concluída — aparelho recebido aguardando cadastro completo"
          : "Venda concluída",
      );
      setCompleteOpen(false);
      setIsTrade(null);
      setTradeModel("");
      setTradeCost("");
      setLinkChoice("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tradeCostValue = Number(tradeCost.replace(/\./g, "").replace(",", "."));

  /** Exclusão suave: o registro vira "Legado" e sai das listas ativas, mas fica no histórico. */
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "legado" })
        .eq("id", appointment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Registro movido para o histórico");
      setDeleteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const completeReady =
    isTrade !== null &&
    (appointment.inventory_device_id || linkChoice) &&
    (!isTrade || (tradeModel && Number.isFinite(tradeCostValue) && tradeCostValue > 0));

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
          {sourceAppointment && (
            <p className="mt-1 text-xs text-muted-foreground">
              Gerado a partir do agendamento de{" "}
              {new Date(sourceAppointment.scheduled_at).toLocaleDateString("pt-BR")}
            </p>
          )}
          {appointment.cancel_reason && (
            <p className="mt-1 text-sm text-destructive">Motivo: {appointment.cancel_reason}</p>
          )}
        </div>
      </div>

      {appointment.status === "pendente" && (
        <div className="mt-3 flex gap-2">
          {canConvert && (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => onConvert!(appointment)}
            >
              <ShoppingCart className="mr-1 h-4 w-4" /> Transformar em venda
            </Button>
          )}
          <Button
            size="sm"
            className="flex-1"
            disabled={update.isPending}
            onClick={() => setCompleteOpen(true)}
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
          <Button
            size="sm"
            variant="ghost"
            aria-label="Excluir agendamento"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
          <Button
            size="sm"
            variant="ghost"
            aria-label="Excluir agendamento"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tem certeza?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso vai remover <strong>{appointment.customer_name}</strong> das listas ativas, mas o
            registro fica salvo no histórico.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular aparelho do estoque</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Escolha o aparelho real de <strong>{appointment.device_model}</strong> que sai do
            estoque.
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>
              Voltar
            </Button>
            <Button
              disabled={!linkChoice || update.isPending}
              onClick={() => update.mutate({ status: "pendente", inventory_device_id: linkChoice })}
            >
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir venda</DialogTitle>
          </DialogHeader>
          {!appointment.inventory_device_id && (
            <div className="space-y-1.5">
              <Label htmlFor={`link-${appointment.id}`}>Aparelho que sai do estoque *</Label>
              <select
                id={`link-${appointment.id}`}
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
                  Nenhum {appointment.device_model} disponível no estoque. Cadastre o item antes de
                  concluir.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">Essa venda envolve troca de aparelho (upgrade)? *</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                variant={isTrade === true ? "default" : "outline"}
                onClick={() => setIsTrade(true)}
              >
                Sim
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                variant={isTrade === false ? "default" : "outline"}
                onClick={() => setIsTrade(false)}
              >
                Não
              </Button>
            </div>
          </div>
          {isTrade === true && (
            <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-medium">Aparelho que está entrando</p>
              <div className="space-y-1.5">
                <Label htmlFor={`trade-model-${appointment.id}`}>Modelo recebido *</Label>
                <select
                  id={`trade-model-${appointment.id}`}
                  value={tradeModel}
                  onChange={(e) => setTradeModel(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                >
                  <option value="">Selecione o modelo…</option>
                  {activeModels.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`trade-cost-${appointment.id}`}>Valor de avaliação (R$) *</Label>
                <Input
                  id={`trade-cost-${appointment.id}`}
                  inputMode="decimal"
                  placeholder="Ex.: 1800"
                  value={tradeCost}
                  onChange={(e) => setTradeCost(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                O aparelho entra como <strong>Incompleto</strong> e precisa ter série e e-mail
                cadastrados depois.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>
              Voltar
            </Button>
            <Button disabled={!completeReady || complete.isPending} onClick={() => complete.mutate()}>
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