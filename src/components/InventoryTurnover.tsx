import { useMemo, useState } from "react";
import { Download, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, shiftDate, todayISO } from "@/lib/agenda";
import { useInventoryCosts, useInventoryItems, type InventoryItem } from "@/lib/inventory";
import { exportRowsCSV } from "@/lib/inventory-export";

function dayDiff(from: string, to: string) {
  const a = new Date(from.length <= 10 ? `${from}T00:00:00` : from).getTime();
  const b = new Date(to.length <= 10 ? `${to}T00:00:00` : to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function inRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= from && day <= to;
}

type ModelStat = { model: string; avg: number; count: number };

export function InventoryTurnover() {
  const { data: items = [] } = useInventoryItems();
  const costs = useInventoryCosts(true);
  const [from, setFrom] = useState(shiftDate(todayISO(), -30));
  const [to, setTo] = useState(todayISO());

  const ranking = useMemo<ModelStat[]>(() => {
    const acc = new Map<string, { total: number; count: number }>();
    for (const i of items) {
      if (i.status !== "vendido" || !i.sold_at) continue;
      const days = dayDiff(i.entered_at, i.sold_at);
      if (days == null) continue;
      const prev = acc.get(i.device_model) ?? { total: 0, count: 0 };
      acc.set(i.device_model, { total: prev.total + days, count: prev.count + 1 });
    }
    return [...acc.entries()]
      .map(([model, v]) => ({ model, avg: v.total / v.count, count: v.count }))
      .sort((a, b) => a.avg - b.avg);
  }, [items]);

  const fastest = ranking.slice(0, 5);
  const slowest = [...ranking].reverse().slice(0, 5);

  const entered = items.filter((i) => inRange(i.entered_at, from, to));
  const sold = items.filter((i) => i.status === "vendido" && inRange(i.sold_at, from, to));
  const cost = (list: InventoryItem[]) => list.reduce((sum, i) => sum + (costs[i.id] ?? 0), 0);
  const enteredCost = cost(entered);
  const soldCost = cost(sold);

  function setPreset(days: number) {
    setFrom(shiftDate(todayISO(), -days));
    setTo(todayISO());
  }

  function handleExport() {
    exportRowsCSV(
      ["Indicador", "Valor"],
      [
        ["Período", `${from} a ${to}`],
        ["Itens que entraram", entered.length],
        ["Itens vendidos", sold.length],
        ["Saldo líquido", entered.length - sold.length],
        ["Custo que entrou", enteredCost.toFixed(2).replace(".", ",")],
        ["Custo que saiu", soldCost.toFixed(2).replace(".", ",")],
        ["", ""],
        ["Modelo", "Tempo médio até vender (dias)"],
        ...ranking.map((r) => [r.model, Math.round(r.avg)] as (string | number)[]),
      ],
      "giro-de-estoque",
    );
  }

  return (
    <section className="mt-5 rounded-lg border bg-card p-3 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="h-4 w-4 text-primary" /> Giro de estoque
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="transition-transform active:scale-95"
          onClick={handleExport}
        >
          <Download className="mr-1 h-4 w-4" /> Exportar
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setPreset(7)}>
          Semana
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setPreset(30)}>
          Mês
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="giro-from">De</Label>
          <Input id="giro-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="giro-to">Até</Label>
          <Input id="giro-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Box label="Entraram" value={entered.length} />
        <Box label="Saíram (vendidos)" value={sold.length} />
        <Box label="Saldo líquido" value={entered.length - sold.length} />
        <Box label="Custo que entrou" value={formatBRL(enteredCost)} />
        <Box label="Custo que saiu" value={formatBRL(soldCost)} />
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ModelList title="Giram mais rápido" items={fastest} tone="text-emerald-400" />
        <ModelList title="Giram mais devagar" items={slowest} tone="text-amber-400" />
      </div>
      {ranking.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Ainda não há vendas registradas para calcular o tempo médio em estoque.
        </p>
      )}
    </section>
  );
}

function Box({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background/40 p-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function ModelList({ title, items, tone }: { title: string; items: ModelStat[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border bg-background/40 p-3">
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((m) => (
          <li key={m.model} className="flex justify-between gap-3">
            <span className="truncate">{m.model}</span>
            <span className="shrink-0 text-muted-foreground">
              {Math.round(m.avg)}d · {m.count}un
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
