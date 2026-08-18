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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeviceModels } from "@/lib/settings";
import {
  INVENTORY_STATUS_LABEL,
  INVENTORY_STATUSES,
  todayForInventory,
  type InventoryItem,
  type InventoryStatus,
} from "@/lib/inventory";

const schema = z.object({
  device_model: z.string().trim().min(1, "Selecione o modelo do aparelho").max(120),
  color: z.string().trim().max(60).optional(),
  storage: z.string().trim().max(60).optional(),
  apple_id: z.string().trim().min(1, "Informe o e-mail (Apple ID)").max(160),
  serial_number: z.string().trim().max(80).optional(),
  cost_price: z.string().trim().optional(),
  sale_price: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  entered_at: z.string().min(1, "Informe a data de entrada"),
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground";

function toNumber(value?: string) {
  if (!value) return null;
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function InventoryForm({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
}) {
  const { user, role } = useAuth();
  const isGerente = role === "gerente";
  const queryClient = useQueryClient();
  const { data: models = [] } = useDeviceModels();
  const activeModels = models.filter((m) => m.active);
  const [status, setStatus] = useState<InventoryStatus>(item?.status ?? "disponivel");

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const parsed = schema.safeParse({
        device_model: form.get("device_model"),
        color: form.get("color") ?? "",
        storage: form.get("storage") ?? "",
        apple_id: form.get("apple_id"),
        serial_number: form.get("serial_number") ?? "",
        cost_price: form.get("cost_price") ?? "",
        sale_price: form.get("sale_price") ?? "",
        notes: form.get("notes") ?? "",
        entered_at: form.get("entered_at"),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const v = parsed.data;
      const cost = toNumber(v.cost_price);
      if (!item && !cost) throw new Error("Informe o valor de custo do aparelho");

      const payload = {
        device_model: v.device_model,
        color: v.color || null,
        storage: v.storage || null,
        apple_id: v.apple_id.toLowerCase(),
        serial_number: v.serial_number || null,
        sale_price: toNumber(v.sale_price),
        notes: v.notes || null,
        status,
        entered_at: v.entered_at,
      };

      if (item) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", item.id);
        if (error) throw new Error(error.message);
        if (cost && isGerente) {
          const { error: costError } = await supabase
            .from("inventory_costs")
            .upsert({ item_id: item.id, cost_price: cost }, { onConflict: "item_id" });
          if (costError) throw new Error(costError.message);
        }
        return;
      }

      const { data, error } = await supabase
        .from("inventory_items")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { error: costError } = await supabase
        .from("inventory_costs")
        .insert({ item_id: data!.id, cost_price: cost! });
      if (costError) throw new Error(costError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_costs"] });
      toast.success(item ? "Item atualizado" : "Item cadastrado no estoque");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item de estoque" : "Novo item de estoque"}</DialogTitle>
        </DialogHeader>
        <form
          id="inventory-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="device_model">Modelo *</Label>
            <select
              id="device_model"
              name="device_model"
              required
              defaultValue={item?.device_model ?? ""}
              className={selectClass}
            >
              <option value="">Selecione o modelo…</option>
              {activeModels.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
              {item && !activeModels.some((m) => m.name === item.device_model) && (
                <option value={item.device_model}>{item.device_model}</option>
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" name="color" placeholder="Meia-noite" defaultValue={item?.color ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage">Armazenamento</Label>
              <Input id="storage" name="storage" placeholder="256GB" defaultValue={item?.storage ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apple_id">E-mail (Apple ID) *</Label>
            <Input
              id="apple_id"
              name="apple_id"
              type="email"
              required
              placeholder="aparelho01@icloud.com"
              defaultValue={item?.apple_id ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serial_number">Número de série</Label>
            <Input
              id="serial_number"
              name="serial_number"
              placeholder="Recomendado"
              defaultValue={item?.serial_number ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(isGerente || !item) && (
              <div className="space-y-1.5">
                <Label htmlFor="cost_price">Valor de custo (R$){item ? "" : " *"}</Label>
                <Input id="cost_price" name="cost_price" inputMode="decimal" placeholder="Ex.: 2800" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sale_price">Venda sugerida (R$)</Label>
              <Input
                id="sale_price"
                name="sale_price"
                inputMode="decimal"
                placeholder="Ex.: 3500"
                defaultValue={item?.sale_price != null ? String(item.sale_price) : ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status">Situação</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as InventoryStatus)}
                className={selectClass}
              >
                {INVENTORY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INVENTORY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entered_at">Entrada no estoque</Label>
              <Input
                id="entered_at"
                name="entered_at"
                type="date"
                defaultValue={item?.entered_at ?? todayForInventory()}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Ex.: tela com risco, bateria a trocar…"
              defaultValue={item?.notes ?? ""}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="inventory-form" disabled={mutation.isPending}>
            {item ? "Salvar" : "Cadastrar item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}