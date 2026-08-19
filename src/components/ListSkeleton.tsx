import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de cards, no mesmo formato dos itens já listados. */
export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-3">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-1 h-10 w-1.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de linhas de tabela. */
export function TableRowsSkeleton({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border/20 last:border-0" aria-hidden>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
