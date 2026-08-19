import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowLeft, BadgeDollarSign } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/lib/settings";
import {
  addDays,
  formatBRL,
  groupByDay,
  periodTotals,
  useCommissions,
  type Commission,
} from "@/lib/commissions";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões — Legado Phones" },
      {
        name: "description",
        content: "Comissões automáticas por venda originada de agendamento.",
      },
      { property: "og:title", content: "Comissões — Legado Phones" },
      {
        property: "og:description",
        content: "Comissões automáticas por venda originada de agendamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommissionsPage,
});

function TotalCard({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3 backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p
        className={
          big
            ? "mt-1 text-3xl font-semibold tabular-nums text-primary"
            : "mt-1 text-xl font-semibold tabular-nums"
        }
      >
        {formatBRL(value)}
      </p>
    </div>
  );
}

function Detail({
  name,
  list,
  ref_,
  setRef,
  onBack,
}: {
  name: string;
  list: Commission[];
  ref_: Date;
  setRef: (d: Date) => void;
  onBack?: () => void;
}) {
  const totals = periodTotals(list, ref_);
  const groups = useMemo(() => groupByDay(list), [list]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" aria-label="Voltar" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-lg font-semibold">{name}</h1>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/60 px-2 py-1.5 backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Período anterior"
          onClick={() => setRef(addDays(ref_, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {ref_.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximo período"
          onClick={() => setRef(addDays(ref_, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <TotalCard label="Dia" value={totals.day} big />
        <TotalCard label="Semana" value={totals.week} />
        <TotalCard label="Mês" value={totals.month} />
      </div>

      {groups.length === 0 && (
        <p className="rounded-xl border border-border/40 bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Nenhuma comissão registrada ainda.
        </p>
      )}

      {groups.map((g) => (
        <section
          key={g.day}
          className="rounded-xl border border-border/40 bg-card/60 p-3 backdrop-blur-xl"
        >
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              {new Date(`${g.day}T12:00:00`).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
              })}
            </h2>
            <span className="text-sm font-semibold tabular-nums text-primary">
              {formatBRL(g.total)}
            </span>
          </header>
          <ul className="mt-2 divide-y divide-border/30">
            {g.items.map((c) => {
              const cancelled = c.status === "cancelada";
              return (
                <li
                  key={c.id}
                  className={
                    cancelled
                      ? "flex items-center justify-between gap-2 py-2 text-muted-foreground line-through"
                      : "flex items-center justify-between gap-2 py-2"
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{c.device_model ?? "Aparelho"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.completed_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cancelled && (
                      <Badge variant="outline" className="text-[10px] no-underline">
                        Cancelada
                      </Badge>
                    )}
                    <span className="text-sm font-semibold tabular-nums">
                      {formatBRL(c.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CommissionsPage() {
  const { role, user, fullName } = useAuth();
  const { data: commissions = [] } = useCommissions();
  const { data: profiles = [] } = useProfiles();
  const [ref_, setRef] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.full_name ||
    profiles.find((p) => p.id === id)?.email ||
    "Vendedora";

  if (role === "atendente") {
    return (
      <AppShell>
        <AccessDenied message="A aba de comissões é exclusiva das vendedoras e do gerente." />
      </AppShell>
    );
  }

  if (role !== "gerente") {
    const mine = commissions.filter((c) => c.seller_id === user?.id);
    return (
      <AppShell>
        <Detail name={fullName || "Minhas comissões"} list={mine} ref_={ref_} setRef={setRef} />
      </AppShell>
    );
  }

  if (selected) {
    return (
      <AppShell>
        <Detail
          name={nameOf(selected)}
          list={commissions.filter((c) => c.seller_id === selected)}
          ref_={ref_}
          setRef={setRef}
          onBack={() => setSelected(null)}
        />
      </AppShell>
    );
  }

  const sellers = [...new Set(commissions.map((c) => c.seller_id))];

  return (
    <AppShell>
      <h1 className="text-lg font-semibold">Comissões</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Geradas automaticamente quando um agendamento vira venda concluída.
      </p>

      {sellers.length === 0 && (
        <p className="mt-4 rounded-xl border border-border/40 bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Nenhuma comissão registrada ainda.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {sellers.map((id) => {
          const totals = periodTotals(
            commissions.filter((c) => c.seller_id === id),
            ref_,
          );
          return (
            <button
              key={id}
              onClick={() => setSelected(id)}
              className="w-full rounded-xl border border-border/40 bg-card/60 p-4 text-left backdrop-blur-xl transition-all hover:border-primary/40 active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="h-4 w-4 text-primary" />
                <span className="font-medium">{nameOf(id)}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Dia
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-primary">
                    {formatBRL(totals.day)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Semana
                  </p>
                  <p className="text-xl font-semibold tabular-nums">{formatBRL(totals.week)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Mês
                  </p>
                  <p className="text-xl font-semibold tabular-nums">{formatBRL(totals.month)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </AppShell>
  );
}
