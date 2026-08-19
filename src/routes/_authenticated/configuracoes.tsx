import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AppointmentStatus } from "@/lib/agenda";
import { STATUS_LABEL } from "@/lib/agenda";
import {
  useAppointmentTags,
  useAttendantColors,
  useCancelReasons,
  useDeviceModels,
  useProfiles,
  useStatusColors,
  useUserRoles,
} from "@/lib/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppRole } from "@/hooks/useAuth";
import { useStaleDays } from "@/lib/inventory";
import { createCollaborator, deleteCollaborator } from "@/lib/collaborators.functions";
import { useCommissionAmount } from "@/lib/commissions";
import { useTradeInDefects, useTradeInModels } from "@/lib/trade-in";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Agenda da Loja" },
      { name: "description", content: "Modelos, motivos, tags e cores do módulo de agendamento." },
      { property: "og:title", content: "Configurações — Agenda da Loja" },
      {
        property: "og:description",
        content: "Modelos, motivos, tags e cores do módulo de agendamento.",
      },
    ],
  }),
  component: ConfigPage,
});

function useTableMutation(
  table: "device_models" | "cancel_reasons" | "appointment_tags" | "trade_in_models" | "trade_in_defects",
  key: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "insert"; values: Record<string, unknown> }
        | { type: "update"; id: string; values: Record<string, unknown> }
        | { type: "delete"; id: string },
    ) => {
      const query =
        op.type === "insert"
          ? supabase.from(table).insert(op.values as never)
          : op.type === "update"
            ? supabase.from(table).update(op.values as never).eq("id", op.id)
            : supabase.from(table).delete().eq("id", op.id);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-lg border bg-card p-3 backdrop-blur-xl">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function ConfigPage() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: models = [] } = useDeviceModels();
  const { data: reasons = [] } = useCancelReasons();
  const { data: tags = [] } = useAppointmentTags();
  const { data: profiles = [] } = useProfiles();
  const { data: userRoles = [] } = useUserRoles();
  const statusColors = useStatusColors();
  const attendantColors = useAttendantColors();
  const staleDays = useStaleDays();
  const commissionAmount = useCommissionAmount();
  const { data: tradeModels = [] } = useTradeInModels();
  const { data: tradeDefects = [] } = useTradeInDefects();
  const tradeModelMut = useTableMutation("trade_in_models", "trade_in_models");
  const tradeDefectMut = useTableMutation("trade_in_defects", "trade_in_defects");
  const [newTradeModel, setNewTradeModel] = useState("");
  const [newTradeValue, setNewTradeValue] = useState("");
  const [newDefect, setNewDefect] = useState("");
  const [newDefectValue, setNewDefectValue] = useState("");
  const [newCollab, setNewCollab] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "vendedora" as AppRole,
  });

  const createCollabMut = useMutation({
    mutationFn: async (values: typeof newCollab) =>
      createCollaborator({ data: values }),
    onSuccess: () => {
      setNewCollab({ fullName: "", email: "", password: "", role: "vendedora" });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      toast.success("Colaborador adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCollabMut = useMutation({
    mutationFn: async (userId: string) => deleteCollaborator({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      toast.success("Colaborador removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const staleDaysMut = useMutation({
    mutationFn: async (days: number) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "stale_days", value: String(days) }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_settings", "stale_days"] });
      toast.success("Limite de estoque parado atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modelMut = useTableMutation("device_models", "device_models");

  const commissionMut = useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "commission_amount", value: String(value) }, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_settings", "commission_amount"] });
      toast.success("Valor de comissão atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reasonMut = useTableMutation("cancel_reasons", "cancel_reasons");
  const tagMut = useTableMutation("appointment_tags", "appointment_tags");

  const [newModel, setNewModel] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newTag, setNewTag] = useState("");

  const statusColorMut = useMutation({
    mutationFn: async ({ status, color }: { status: AppointmentStatus; color: string }) => {
      const { error } = await supabase
        .from("status_colors")
        .upsert({ status, color }, { onConflict: "status" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["status_colors"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const attendantColorMut = useMutation({
    mutationFn: async ({ userId, color }: { userId: string; color: string }) => {
      const { error } = await supabase
        .from("attendant_colors")
        .upsert({ user_id: userId, color }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendant_colors"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [resetOpen, setResetOpen] = useState(false);

  const roleMut = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole | "nenhum" }) => {
      const { error: delError } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delError) throw new Error(delError.message);
      if (role !== "nenhum") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      toast.success("Função do colaborador atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resetMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reset_test_data");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setResetOpen(false);
      queryClient.invalidateQueries();
      toast.success("Dados de teste apagados. As configurações foram mantidas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role && role !== "gerente") {
    return (
      <AppShell>
        <AccessDenied message="Estas configurações são exclusivas do gerente." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-lg font-semibold">Configurações</h1>

      <Section
        title="Colaboradores e funções"
        description="Defina a função de cada pessoa da loja. A função controla o que ela enxerga no sistema."
      >
        {profiles.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum colaborador cadastrado ainda.</p>
        )}
        {profiles.map((p) => {
          const current = userRoles.find((r) => r.user_id === p.id)?.role ?? "nenhum";
          return (
            <div key={p.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.full_name || p.email}</p>
                {p.full_name && p.email && (
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                )}
              </div>
              <Select
                value={current}
                onValueChange={(v) =>
                  roleMut.mutate({ userId: p.id, role: v as AppRole | "nenhum" })
                }
              >
                <SelectTrigger className="w-40" aria-label={`Função de ${p.full_name || p.email}`}>
                  <SelectValue placeholder="Função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gerente">Gerente (dono)</SelectItem>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="vendedora">Vendedora</SelectItem>
                  <SelectItem value="nenhum">Sem acesso</SelectItem>
                </SelectContent>
              </Select>
              {p.id !== user?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${p.full_name || p.email}`}
                  onClick={() => {
                    if (confirm(`Remover ${p.full_name || p.email} do sistema?`))
                      deleteCollabMut.mutate(p.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
        <form
          className="mt-3 space-y-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCollab.fullName.trim() || !newCollab.email.trim() || newCollab.password.length < 6) {
              toast.error("Preencha nome, e-mail e senha com ao menos 6 caracteres.");
              return;
            }
            createCollabMut.mutate({ ...newCollab, fullName: newCollab.fullName.trim(), email: newCollab.email.trim() });
          }}
        >
          <p className="text-xs font-medium">Adicionar colaborador</p>
          <Input
            placeholder="Nome completo"
            value={newCollab.fullName}
            onChange={(e) => setNewCollab((s) => ({ ...s, fullName: e.target.value }))}
          />
          <Input
            type="email"
            placeholder="E-mail"
            value={newCollab.email}
            onChange={(e) => setNewCollab((s) => ({ ...s, email: e.target.value }))}
          />
          <Input
            type="password"
            placeholder="Senha provisória (mín. 6)"
            value={newCollab.password}
            onChange={(e) => setNewCollab((s) => ({ ...s, password: e.target.value }))}
          />
          <div className="flex gap-2">
            <Select
              value={newCollab.role}
              onValueChange={(v) => setNewCollab((s) => ({ ...s, role: v as AppRole }))}
            >
              <SelectTrigger className="flex-1" aria-label="Função do novo colaborador">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gerente">Gerente (dono)</SelectItem>
                <SelectItem value="atendente">Atendente</SelectItem>
                <SelectItem value="vendedora">Vendedora</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={createCollabMut.isPending}>
              Adicionar
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Modelos de aparelho" description="Opções disponíveis no formulário de agendamento.">
        {models.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <Input
              defaultValue={m.name}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== m.name &&
                modelMut.mutate({ type: "update", id: m.id, values: { name: e.target.value.trim() } })
              }
            />
            <Switch
              checked={m.active}
              aria-label="Ativo"
              onCheckedChange={(v) => modelMut.mutate({ type: "update", id: m.id, values: { active: v } })}
            />
            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => modelMut.mutate({ type: "delete", id: m.id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newModel.trim()) return;
            modelMut.mutate({
              type: "insert",
              values: { name: newModel.trim(), sort_order: models.length + 1 },
            });
            setNewModel("");
          }}
        >
          <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="iPhone 15 Pro 256GB" />
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section title="Motivos de cancelamento" description="Opções pré-definidas; 'Outro' com texto livre continua disponível.">
        {reasons.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <Input
              defaultValue={r.label}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== r.label &&
                reasonMut.mutate({ type: "update", id: r.id, values: { label: e.target.value.trim() } })
              }
            />
            <Switch
              checked={r.active}
              aria-label="Ativo"
              onCheckedChange={(v) => reasonMut.mutate({ type: "update", id: r.id, values: { active: v } })}
            />
            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => reasonMut.mutate({ type: "delete", id: r.id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newReason.trim()) return;
            reasonMut.mutate({
              type: "insert",
              values: { label: newReason.trim(), sort_order: reasons.length + 1 },
            });
            setNewReason("");
          }}
        >
          <Input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Cliente sumiu" />
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section title="Tags de agendamento" description="Marcadores rápidos, ex.: cliente VIP, troca de aparelho, retorno.">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <Input
              defaultValue={t.label}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== t.label &&
                tagMut.mutate({ type: "update", id: t.id, values: { label: e.target.value.trim() } })
              }
            />
            <input
              type="color"
              aria-label={`Cor da tag ${t.label}`}
              defaultValue={t.color}
              onChange={(e) => tagMut.mutate({ type: "update", id: t.id, values: { color: e.target.value } })}
              className="h-9 w-10 rounded-md border bg-transparent"
            />
            <Switch
              checked={t.active}
              aria-label="Ativo"
              onCheckedChange={(v) => tagMut.mutate({ type: "update", id: t.id, values: { active: v } })}
            />
            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => tagMut.mutate({ type: "delete", id: t.id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTag.trim()) return;
            tagMut.mutate({
              type: "insert",
              values: { label: newTag.trim(), sort_order: tags.length + 1 },
            });
            setNewTag("");
          }}
        >
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Cliente VIP" />
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section title="Cores por status" description="Usadas nos painéis semanal e mensal e nos cards.">
        {(["pendente", "concluido", "cancelado"] as const).map((s) => (
          <div key={s} className="flex items-center gap-3">
            <Label className="flex-1">{STATUS_LABEL[s]}</Label>
            <input
              type="color"
              aria-label={`Cor de ${STATUS_LABEL[s]}`}
              value={statusColors[s]}
              onChange={(e) => statusColorMut.mutate({ status: s, color: e.target.value })}
              className="h-9 w-12 rounded-md border bg-transparent"
            />
          </div>
        ))}
      </Section>

      <Section title="Cores por atendente" description="Facilita a leitura visual nos painéis e no ranking.">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <Label className="flex-1 truncate">{p.full_name || p.email}</Label>
            <input
              type="color"
              aria-label={`Cor de ${p.full_name || p.email}`}
              value={attendantColors[p.id] ?? "#d92b4b"}
              onChange={(e) => attendantColorMut.mutate({ userId: p.id, color: e.target.value })}
              className="h-9 w-12 rounded-md border bg-transparent"
            />
          </div>
        ))}
      </Section>

      <Section
        title="Alerta de estoque parado"
        description="Itens disponíveis há mais dias que o limite ganham destaque na lista de estoque."
      >
        <div className="flex items-center gap-3">
          <Label htmlFor="stale-days" className="flex-1">
            Alertar item parado após (dias)
          </Label>
          <Input
            id="stale-days"
            type="number"
            min={1}
            max={365}
            className="w-24"
            key={staleDays}
            defaultValue={staleDays}
            onBlur={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n > 0 && n !== staleDays) staleDaysMut.mutate(n);
            }}
          />
        </div>
      </Section>

      <Section
        title="Comissões"
        description="Valor pago à vendedora por venda concluída que veio de um agendamento."
      >
        <div className="flex items-center gap-3">
          <Label htmlFor="commission-amount" className="flex-1">
            Valor de comissão por venda (R$)
          </Label>
          <Input
            id="commission-amount"
            type="number"
            min={0}
            step="0.01"
            className="w-28"
            key={commissionAmount}
            defaultValue={commissionAmount}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n !== commissionAmount) commissionMut.mutate(n);
            }}
          />
        </div>
      </Section>

      <Section
        title="Avaliação de troca — modelos"
        description="Valor de referência de cada modelo aceito em troca."
      >
        {tradeModels.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <Input
              defaultValue={m.name}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== m.name &&
                tradeModelMut.mutate({ type: "update", id: m.id, values: { name: e.target.value.trim() } })
              }
            />
            <Input
              type="number"
              min={0}
              className="w-28"
              defaultValue={m.base_value}
              aria-label={`Valor de referência de ${m.name}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n !== m.base_value)
                  tradeModelMut.mutate({ type: "update", id: m.id, values: { base_value: n } });
              }}
            />
            <Switch
              checked={m.active}
              aria-label="Ativo"
              onCheckedChange={(v) => tradeModelMut.mutate({ type: "update", id: m.id, values: { active: v } })}
            />
            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => tradeModelMut.mutate({ type: "delete", id: m.id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(newTradeValue);
            if (!newTradeModel.trim() || !Number.isFinite(value) || value < 0) return;
            tradeModelMut.mutate({
              type: "insert",
              values: { name: newTradeModel.trim(), base_value: value, sort_order: tradeModels.length + 1 },
            });
            setNewTradeModel("");
            setNewTradeValue("");
          }}
        >
          <Input value={newTradeModel} onChange={(e) => setNewTradeModel(e.target.value)} placeholder="iPhone 13 128GB" />
          <Input
            type="number"
            min={0}
            className="w-28"
            value={newTradeValue}
            onChange={(e) => setNewTradeValue(e.target.value)}
            placeholder="2500"
            aria-label="Valor de referência"
          />
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section
        title="Avaliação de troca — defeitos"
        description="Descontos aplicados no checklist da avaliação."
      >
        {tradeDefects.map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <Input
              defaultValue={d.label}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== d.label &&
                tradeDefectMut.mutate({ type: "update", id: d.id, values: { label: e.target.value.trim() } })
              }
            />
            <Input
              type="number"
              min={0}
              className="w-28"
              defaultValue={d.discount}
              aria-label={`Desconto de ${d.label}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n !== d.discount)
                  tradeDefectMut.mutate({ type: "update", id: d.id, values: { discount: n } });
              }}
            />
            <Switch
              checked={d.active}
              aria-label="Ativo"
              onCheckedChange={(v) => tradeDefectMut.mutate({ type: "update", id: d.id, values: { active: v } })}
            />
            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => tradeDefectMut.mutate({ type: "delete", id: d.id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(newDefectValue);
            if (!newDefect.trim() || !Number.isFinite(value) || value < 0) return;
            tradeDefectMut.mutate({
              type: "insert",
              values: { label: newDefect.trim(), discount: value, sort_order: tradeDefects.length + 1 },
            });
            setNewDefect("");
            setNewDefectValue("");
          }}
        >
          <Input value={newDefect} onChange={(e) => setNewDefect(e.target.value)} placeholder="Tela trincada" />
          <Input
            type="number"
            min={0}
            className="w-28"
            value={newDefectValue}
            onChange={(e) => setNewDefectValue(e.target.value)}
            placeholder="400"
            aria-label="Desconto"
          />
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section
        title="Zona de perigo"
        description="Apaga todos os agendamentos, vendas, itens de estoque, histórico e conferências. Modelos, tabela de troca, motivos, cores e usuários não são afetados."
      >
        <Button variant="destructive" className="w-full" onClick={() => setResetOpen(true)}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          Resetar dados de teste
        </Button>
      </Section>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar dados de teste?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai apagar todos os agendamentos, vendas e itens de estoque cadastrados até agora.
              Configurações (modelos, tabela de troca, usuários) não serão afetadas. Essa ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                resetMut.mutate();
              }}
            >
              {resetMut.isPending ? "Resetando…" : "Confirmar reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
