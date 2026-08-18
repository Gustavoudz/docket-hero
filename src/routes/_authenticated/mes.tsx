import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AttendantFilter,
  AttendantRanking,
  PeriodTotals,
  Stat,
  useRangeAppointments,
} from "@/components/PeriodStats";
import { useStatusColors } from "@/lib/settings";
import {
  endOfMonth,
  formatMonthLabel,
  monthGrid,
  shiftMonth,
  startOfMonth,
  todayISO,
  WEEKDAY_LABELS,
} from "@/lib/agenda";

export const Route = createFileRoute("/_authenticated/mes")({
  head: () => ({
    meta: [
      { title: "Painel mensal — Agenda da Loja" },
      { name: "description", content: "Calendário do mês com totais e dia mais cheio." },
      { property: "og:title", content: "Painel mensal — Agenda da Loja" },
      { property: "og:description", content: "Calendário do mês com totais e dia mais cheio." },
    ],
  }),
  component: MesPage,
});

function MesPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(startOfMonth(todayISO()));
  const [attendant, setAttendant] = useState("todas");
  const statusColors = useStatusColors();

  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const cells = monthGrid(month);
  const { data: appointments = [] } = useRangeAppointments(cells[0]!, cells[cells.length - 1]!);

  const filtered = useMemo(
    () =>
      attendant === "todas"
        ? appointments
        : appointments.filter((a) => a.attendant_id === attendant),
    [appointments, attendant],
  );
  const monthItems = filtered.filter((a) => a.scheduled_date >= first && a.scheduled_date <= last);

  const busiest = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of monthItems) counts.set(a.scheduled_date, (counts.get(a.scheduled_date) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? `${top[0].slice(8, 10)}/${top[0].slice(5, 7)} (${top[1]})` : "—";
  }, [monthItems]);

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Mês anterior"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="flex-1 text-center text-sm font-semibold capitalize">
          {formatMonthLabel(month)}
        </h1>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próximo mês"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3">
        <PeriodTotals items={monthItems} />
      </div>
      <dl className="mt-2">
        <Stat label="Dia mais cheio" value={busiest} />
      </dl>

      <div className="mt-3">
        <AttendantFilter value={attendant} onChange={setAttendant} />
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const dayItems = filtered.filter((a) => a.scheduled_date === day);
          const inMonth = day >= first && day <= last;
          const dominant =
            dayItems.filter((a) => a.status === "concluido").length >= dayItems.length / 2
              ? statusColors.concluido
              : statusColors.pendente;
          return (
            <button
              key={day}
              onClick={() => navigate({ to: "/agenda", search: { date: day } })}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border bg-card backdrop-blur-xl transition-colors hover:border-primary/60 ${
                inMonth ? "" : "opacity-35"
              }`}
            >
              <span className="text-sm">{Number(day.slice(8, 10))}</span>
              {dayItems.length > 0 && (
                <span
                  className="mt-0.5 min-w-4 rounded-full px-1 text-[10px] font-semibold text-black"
                  style={{ backgroundColor: dominant }}
                >
                  {dayItems.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <AttendantRanking items={monthItems} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Painel somente de leitura. Toque em um dia para abrir a agenda diária e editar.
      </p>
    </AppShell>
  );
}
