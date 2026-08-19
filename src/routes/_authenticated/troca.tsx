import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Lock, PackagePlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InventoryForm } from "@/components/InventoryForm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/agenda";
import { useTradeInDefects, useTradeInModels, tradeInValue } from "@/lib/trade-in";

export const Route = createFileRoute("/_authenticated/troca")({
  head: () => ({
    meta: [
      { title: "Avaliação de troca — Legado Phones" },
      {
        name: "description",
        content: "Calcule internamente o valor de troca do aparelho do cliente e dê entrada no estoque.",
      },
      { property: "og:title", content: "Avaliação de troca — Legado Phones" },
      {
        property: "og:description",
        content: "Calcule internamente o valor de troca do aparelho do cliente e dê entrada no estoque.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrocaPage,
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground";

function TrocaPage() {
  const { data: models = [] } = useTradeInModels();
  const { data: defects = [] } = useTradeInDefects();
  const activeModels = models.filter((m) => m.active);
  const activeDefects = defects.filter((d) => d.active);
  const [modelId, setModelId] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const model = activeModels.find((m) => m.id === modelId) ?? null;
  const selected = activeDefects.filter((d) => checked.includes(d.id));
  const total = useMemo(
    () => (model ? tradeInValue(model.base_value, selected.map((d) => d.discount)) : 0),
    [model, selected],
  );

  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <AppShell>
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <ArrowRightLeft className="h-5 w-5 text-primary" /> Avaliação de troca
      </h1>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Uso interno — não mostrar esta tela ao cliente.
      </p>

      <section className="mt-4 space-y-3 rounded-lg border bg-card p-3 backdrop-blur-xl">
        <div className="space-y-1.5">
          <Label htmlFor="trade-model">Modelo trazido pelo cliente</Label>
          <select
            id="trade-model"
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              setChecked([]);
            }}
            className={selectClass}
          >
            <option value="">Selecione o modelo…</option>
            {activeModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {activeModels.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum modelo cadastrado. O gerente cadastra a tabela base em Configurações.
            </p>
          )}
        </div>

        {model && (
          <>
            <div className="rounded-md border bg-background/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Valor de referência
              </p>
              <p className="text-lg font-semibold">{formatBRL(model.base_value)}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Defeitos encontrados</Label>
              <ul className="space-y-1.5">
                {activeDefects.map((d) => (
                  <li key={d.id}>
                    <label className="flex items-center gap-3 rounded-md border bg-background/40 p-2.5 text-sm transition-transform active:scale-[0.99]">
                      <input
                        type="checkbox"
                        checked={checked.includes(d.id)}
                        onChange={() => toggle(d.id)}
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                      />
                      <span className="flex-1 truncate">{d.label}</span>
                      <span className="shrink-0 text-muted-foreground">
                        -{formatBRL(d.discount)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-primary/50 bg-primary/10 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Valor final de avaliação
              </p>
              <p className="mt-0.5 text-2xl font-semibold text-primary">{formatBRL(total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.length} defeito(s) aplicado(s).
              </p>
            </div>

            <Button
              className="w-full transition-transform active:scale-[0.98]"
              onClick={() => setFormOpen(true)}
            >
              <PackagePlus className="mr-1 h-4 w-4" /> Cadastrar como item de estoque
            </Button>
          </>
        )}
      </section>

      {formOpen && model && (
        <InventoryForm
          key={`${model.id}-${total}`}
          open={formOpen}
          onOpenChange={setFormOpen}
          defaults={{ device_model: model.name, cost_price: total }}
        />
      )}
    </AppShell>
  );
}
