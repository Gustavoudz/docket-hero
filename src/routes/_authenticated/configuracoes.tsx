import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AppointmentStatus } from "@/lib/agenda";
import { STATUS_LABEL } from "@/lib/agenda";
import {
  useAppointmentTags,
  useAttendantColors,
  useCancelReasons,
  useDeviceModels,
  useProfiles,
  useStatusColors,
} from "@/lib/settings";
import { useStaleDays } from "@/lib/inventory";
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
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { data: models = [] } = useDeviceModels();
  const { data: reasons = [] } = useCancelReasons();
  const { data: tags = [] } = useAppointmentTags();
  const { data: profiles = [] } = useProfiles();
  const statusColors = useStatusColors();
  const attendantColors = useAttendantColors();
  const staleDays = useStaleDays();
  const { data: tradeModels = [] } = useTradeInModels();
  const { data: tradeDefects = [] } = useTradeInDefects();
  const tradeModelMut = useTableMutation("trade_in_models", "trade_in_models");
  const tradeDefectMut = useTableMutation("trade_in_defects", "trade_in_defects");
  const [newTradeModel, setNewTradeModel] = useState("");
  const [newTradeValue, setNewTradeValue] = useState("");
  const [newDefect, setNewDefect] = useState("");
  const [newDefectValue, setNewDefectValue] = useState("");

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
    </AppShell>
  );
}
