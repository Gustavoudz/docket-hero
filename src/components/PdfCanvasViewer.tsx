import { useEffect, useRef, useState } from "react";

/** Renderiza o PDF em canvas (sem iframe), evitando bloqueios do navegador/extensões. */
export function PdfCanvasViewer({ src, className }: { src: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const res = await fetch(src, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Não foi possível carregar o PDF (${res.status})`);
        const buffer = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (cancelled) return;

        container.innerHTML = "";
        const width = container.clientWidth || 700;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * (window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "rounded-lg bg-white shadow-sm";
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao exibir o PDF");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      className={
        className ??
        "h-[70vh] w-full overflow-y-auto rounded-lg border border-border/60 bg-muted/30 p-3"
      }
    >
      {loading && <p className="p-4 text-sm text-muted-foreground">Carregando recibo…</p>}
      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      <div ref={containerRef} className="space-y-3" />
    </div>
  );
}
