import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AttendantFilter,
  AttendantRanking,
  PeriodTotals,
  useRangeAppointments,
} from "@/components/PeriodStats";
import { useStatusColors } from "@/lib/settings";
import {
  formatDateLabel,
  shiftDate,
  startOfWeek,
  todayISO,
  weekDays,
  WEEKDAY_LABELS,
} from "@/lib/agenda";

export const Route = createFileRoute("/_authenticated/semana")({
  head: () => ({
    meta: [
      { title: "Painel semanal — Agenda da Loja" },
      { name: "description", content: "Grade da semana com totais e ranking por atendente." },
      { property: "og:title", content: "Painel semanal — Agenda da Loja" },
      {
        property: "og:description",
        content: "Grade da semana com totais e ranking por atendente.",
      },
    ],
  }),
  component: SemanaPage,
});

function SemanaPage() {
  const navigate = useNavigate();
  const [start, setStart] = useState(startOfWeek(todayISO()));
  const [attendant, setAttendant] = useState("todas");
  const statusColors = useStatusColors();

  const days = weekDays(start);
  const end = days[6]!;
  const { data: appointments = [], isLoading } = useRangeAppointments(start, end);

  const items = useMemo(
    () =>
      attendant === "todas"
        ? appointments
        : appointments.filter((a) => a.attendant_id === attendant),
    [appointments, attendant],
  );

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          onClick={() => setStart(shiftDate(start, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="flex-1 text-center text-sm font-semibold capitalize">
          {formatDateLabel(start)} — {formatDateLabel(end)}
        </h1>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próxima semana"
          onClick={() => setStart(shiftDate(start, 7))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3">
        <PeriodTotals items={items} />
      </div>

      <div className="mt-3">
        <AttendantFilter value={attendant} onChange={setAttendant} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {days.map((day, index) => {
          const dayItems = items.filter((a) => a.scheduled_date === day);
          const counts = {
            pendente: dayItems.filter((a) => a.status === "pendente").length,
            concluido: dayItems.filter((a) => a.status === "concluido").length,
            cancelado: dayItems.filter((a) => a.status === "cancelado").length,
          };
          return (
            <button
              key={day}
              onClick={() => navigate({ to: "/agenda", search: { date: day } })}
              className="rounded-lg border bg-card p-3 text-left backdrop-blur-xl transition-colors hover:border-primary/60"
            >
              <p className="text-xs text-muted-foreground">
                {WEEKDAY_LABELS[index]} · {day.slice(8, 10)}/{day.slice(5, 7)}
              </p>
              <p className="text-2xl font-semibold">{dayItems.length}</p>
              <div className="mt-1 flex gap-1">
                {(["pendente", "concluido", "cancelado"] as const).map((s) =>
                  counts[s] > 0 ? (
                    <span
                      key={s}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-black"
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

      {isLoading && <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>}

      <div className="mt-4">
        <AttendantRanking items={items} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Painel somente de leitura. Toque em um dia para abrir a agenda diária e editar.
      </p>
    </AppShell>
  );
}
