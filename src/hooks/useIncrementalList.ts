import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Renderiza a lista em lotes e carrega o próximo lote quando o usuário
 * chega no fim da rolagem. Não altera filtros nem ordem — só o quanto é
 * desenhado de uma vez.
 */
export function useIncrementalList<T>(items: T[], batchSize = 30) {
  const [count, setCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const signature = items.length;

  useEffect(() => {
    setCount(batchSize);
  }, [batchSize, signature]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const hasMore = count < items.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => c + batchSize);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, batchSize, visible.length]);

  return {
    visible,
    hasMore,
    sentinelRef,
    loadMore: () => setCount((c) => c + batchSize),
    total: items.length,
  };
}
