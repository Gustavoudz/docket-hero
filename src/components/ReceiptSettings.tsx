import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const KEYS = [
  "store_name",
  "store_address",
  "store_contact",
  "warranty_lacrado",
  "warranty_seminovo",
  "warranty_service_order",
] as const;
type Key = (typeof KEYS)[number];

export function useReceiptSettings() {
  return useQuery({
    queryKey: ["app_settings", "receipt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", KEYS as unknown as string[]);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const r of data ?? []) map[r.key] = r.value;
      return map;
    },
  });
}

/** Dados da loja e textos de garantia usados no cabeçalho/rodapé dos recibos. */
export function ReceiptSettings() {
  const qc = useQueryClient();
  const { data } = useReceiptSettings();
  const [form, setForm] = useState<Record<Key, string>>({
    store_name: "",
    store_address: "",
    store_contact: "",
    warranty_lacrado: "",
    warranty_seminovo: "",
    warranty_service_order: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const k of KEYS) next[k] = data[k] ?? "";
      return next;
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = KEYS.map((key) => ({ key, value: form[key] ?? "" }));
      const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings", "receipt"] });
      toast.success("Dados do recibo atualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (key: Key) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Nome da loja</Label>
          <Input {...field("store_name")} placeholder="Legado Phones" />
        </div>
        <div className="space-y-1.5">
          <Label>Endereço</Label>
          <Input {...field("store_address")} placeholder="Rua, número, bairro, cidade" />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone / contato</Label>
          <Input {...field("store_contact")} placeholder="(00) 00000-0000" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Texto de garantia — Lacrado</Label>
          <Textarea rows={4} {...field("warranty_lacrado")} />
        </div>
        <div className="space-y-1.5">
          <Label>Texto de garantia — Seminovo</Label>
          <Textarea rows={4} {...field("warranty_seminovo")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Texto da Ordem de Serviço</Label>
        <Textarea rows={4} {...field("warranty_service_order")} />
      </div>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Salvando…" : "Salvar dados do recibo"}
      </Button>
    </div>
  );
}
