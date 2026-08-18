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

function useTableMutation(table: "device_models" | "cancel_reasons" | "appointment_tags", key: string) {
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
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground backdrop-blur-xl">
          Estas configurações são exclusivas do gerente.
        </p>
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
    </AppShell>
  );
}
