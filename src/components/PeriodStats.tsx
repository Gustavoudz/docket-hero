import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { conversionRate, type Appointment } from "@/lib/agenda";
import { useAttendantColors, useProfiles } from "@/lib/settings";

export function useRangeAppointments(from: string, to: string) {
  return useQuery({
    queryKey: ["appointments", "range", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Appointment[];
    },
  });
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card p-3 backdrop-blur-xl">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

export function PeriodTotals({ items }: { items: Appointment[] }) {
  const completed = items.filter((a) => a.status === "concluido").length;
  const cancelled = items.filter((a) => a.status === "cancelado").length;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Total" value={items.length} />
      <Stat label="Concluídos" value={completed} />
      <Stat label="Cancelados" value={cancelled} />
      <Stat label="Conversão" value={`${conversionRate(completed, items.length)}%`} />
    </dl>
  );
}

export function AttendantFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: profiles = [] } = useProfiles();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="attendant-filter">Atendente</Label>
      <select
        id="attendant-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
      >
        <option value="todas">Todas</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name || p.email}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AttendantRanking({ items }: { items: Appointment[] }) {
  const { data: profiles = [] } = useProfiles();
  const colors = useAttendantColors();

  const rows = new Map<string, { total: number; completed: number }>();
  for (const a of items) {
    const cur = rows.get(a.attendant_id) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (a.status === "concluido") cur.completed += 1;
    rows.set(a.attendant_id, cur);
  }
  const ranking = [...rows.entries()].sort((a, b) => b[1].completed - a[1].completed);
  if (ranking.length === 0) return null;

  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "Atendente";
  };

  return (
    <section className="rounded-lg border bg-card p-3 backdrop-blur-xl">
      <h2 className="text-sm font-medium">Ranking de conclusões</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {ranking.map(([id, stat], index) => (
          <li key={id} className="flex items-center gap-2">
            <span className="w-4 text-xs text-muted-foreground">{index + 1}º</span>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[id] ?? "hsl(var(--muted-foreground))" }}
            />
            <span className="truncate">{nameOf(id)}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {stat.completed}/{stat.total} · {conversionRate(stat.completed, stat.total)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
