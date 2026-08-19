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
import { cn } from "@/lib/utils";
import {
  endOfMonth,
  formatDateLabel,
  formatMonthLabel,
  monthGrid,
  shiftDate,
  shiftMonth,
  startOfMonth,
  startOfWeek,
  todayISO,
  weekDays,
  WEEKDAY_LABELS,
} from "@/lib/agenda";

type View = "semana" | "mes";

export const Route = createFileRoute("/_authenticated/semana")({
  validateSearch: (search: Record<string, unknown>): { view?: View } =>
    search['view'] === "mes" ? { view: "mes" } : {},
  head: () => ({
    meta: [
      { title: "Painel de período — Agenda da Loja" },
      {
        name: "description",
        content: "Visão semanal e mensal dos agendamentos, com totais e ranking por atendente.",
      },
      { property: "og:title", content: "Painel de período — Agenda da Loja" },
      {
        property: "og:description",
        content: "Visão semanal e mensal dos agendamentos, com totais e ranking por atendente.",
      },
    ],
  }),
  component: PainelPeriodoPage,
});

function PainelPeriodoPage() {
  const navigate = useNavigate();
  const { view: viewParam } = Route.useSearch();
  const [view, setView] = useState<View>(viewParam ?? "semana");
  const [attendant, setAttendant] = useState("todas");
  const [weekStart, setWeekStart] = useState(startOfWeek(todayISO()));
  const [month, setMonth] = useState(startOfMonth(todayISO()));
  const statusColors = useStatusColors();

  const days = weekDays(weekStart);
  const cells = monthGrid(month);
  const monthFirst = startOfMonth(month);
  const monthLast = endOfMonth(month);

  const rangeFrom = view === "semana" ? weekStart : cells[0]!;
  const rangeTo = view === "semana" ? days[6]! : cells[cells.length - 1]!;
  const { data: appointments = [], isLoading } = useRangeAppointments(rangeFrom, rangeTo);

  const filtered = useMemo(
    () =>
      attendant === "todas"
        ? appointments
        : appointments.filter((a) => a.attendant_id === attendant),
    [appointments, attendant],
  );

  const periodItems =
    view === "semana"
      ? filtered
      : filtered.filter((a) => a.scheduled_date >= monthFirst && a.scheduled_date <= monthLast);

  const busiest = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of periodItems) counts.set(a.scheduled_date, (counts.get(a.scheduled_date) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? `${top[0].slice(8, 10)}/${top[0].slice(5, 7)} (${top[1]})` : "—";
  }, [periodItems]);

  const openDay = (day: string) => navigate({ to: "/agenda", search: { date: day } });

  return (
    <AppShell>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Acompanhe o volume de agendamentos por período.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Alternar período"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-card p-1"
      >
        {(["semana", "mes"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              setView(v);
              navigate({ to: "/semana", search: v === "mes" ? { view: "mes" } : {}, replace: true });
            }}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97]",
              view === v
                ? "bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {v === "semana" ? "Semana" : "Mês"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full transition-transform active:scale-95"
          aria-label={view === "semana" ? "Semana anterior" : "Mês anterior"}
          onClick={() =>
            view === "semana"
              ? setWeekStart(shiftDate(weekStart, -7))
              : setMonth(shiftMonth(month, -1))
          }
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="flex-1 text-center text-sm font-semibold capitalize">
          {view === "semana"
            ? `${formatDateLabel(weekStart)} — ${formatDateLabel(days[6]!)}`
            : formatMonthLabel(month)}
        </h2>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full transition-transform active:scale-95"
          aria-label={view === "semana" ? "Próxima semana" : "Próximo mês"}
          onClick={() =>
            view === "semana"
              ? setWeekStart(shiftDate(weekStart, 7))
              : setMonth(shiftMonth(month, 1))
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4">
        <PeriodTotals items={periodItems} />
      </div>
      {view === "mes" && (
        <dl className="mt-2">
          <Stat label="Dia mais cheio" value={busiest} />
        </dl>
      )}

      <div className="mt-4">
        <AttendantFilter value={attendant} onChange={setAttendant} />
      </div>

      {view === "semana" ? (
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {days.map((day, index) => {
            const dayItems = periodItems.filter((a) => a.scheduled_date === day);
            const isToday = day === todayISO();
            const counts = {
              pendente: dayItems.filter((a) => a.status === "pendente").length,
              concluido: dayItems.filter((a) => a.status === "concluido").length,
              cancelado: dayItems.filter((a) => a.status === "cancelado").length,
            };
            return (
              <button
                key={day}
                onClick={() => openDay(day)}
                className={cn(
                  "rounded-xl border bg-card p-3 text-left shadow-sm transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 active:translate-y-0 active:scale-[0.98]",
                  isToday && "border-primary/70 ring-1 ring-primary/40",
                )}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {WEEKDAY_LABELS[index]} · {day.slice(8, 10)}/{day.slice(5, 7)}
                </p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{dayItems.length}</p>
                <div className="mt-1.5 flex gap-1">
                  {(["pendente", "concluido", "cancelado"] as const).map((s) =>
                    counts[s] > 0 ? (
                      <span
                        key={s}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-black"
                        style={{ backgroundColor: statusColors[s] }}
                      >
                        {counts[s]}
                      </span>
                    ) : null,
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
            {WEEKDAY_LABELS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {cells.map((day) => {
              const dayItems = filtered.filter((a) => a.scheduled_date === day);
              const inMonth = day >= monthFirst && day <= monthLast;
              const isToday = day === todayISO();
              const dominant =
                dayItems.length > 0 &&
                dayItems.filter((a) => a.status === "concluido").length >= dayItems.length / 2
                  ? statusColors.concluido
                  : statusColors.pendente;
              return (
                <button
                  key={day}
                  onClick={() => openDay(day)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border bg-card transition-all duration-200",
                    "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 active:translate-y-0 active:scale-95",
                    inMonth ? "" : "opacity-35",
                    isToday && "border-primary/70 ring-1 ring-primary/40",
                  )}
                >
                  <span className="text-sm tabular-nums">{Number(day.slice(8, 10))}</span>
                  {dayItems.length > 0 && (
                    <span
                      className="min-w-4 rounded-full px-1 text-[10px] font-semibold text-black"
                      style={{ backgroundColor: dominant }}
                    >
                      {dayItems.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>}

      <div className="mt-5">
        <AttendantRanking items={periodItems} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Painel somente de leitura. Toque em um dia para abrir a agenda diária e editar.
      </p>
    </AppShell>
  );
}
