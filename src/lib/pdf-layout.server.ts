import type { PDFFont, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";

export const A4: [number, number] = [595.28, 841.89];
export const MARGIN = 40;
export const CONTENT_W = A4[0] - MARGIN * 2;

export const BLACK = rgb(0, 0, 0);
export const BORDER = rgb(0.45, 0.45, 0.45);
export const HEAD_FILL = rgb(0.937, 0.945, 0.949);

export type Cell = {
  w: number;
  text?: string;
  lines?: string[];
  bold?: boolean;
  align?: "left" | "right" | "center";
  size?: number;
};

export type Ctx = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
};

/** Quebra o texto em linhas que cabem na largura informada. */
export function wrapText(font: PDFFont, s: string, size: number, max: number): string[] {
  const out: string[] = [];
  for (const raw of String(s ?? "").split("\n")) {
    let cur = "";
    for (const w of raw.split(/\s+/).filter(Boolean)) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > max && cur) {
        out.push(cur);
        cur = w;
      } else cur = t;
    }
    out.push(cur);
  }
  return out;
}

function drawCellText(ctx: Ctx, c: Cell, x: number, top: number, h: number) {
  const size = c.size ?? 9.5;
  const f = c.bold ? ctx.bold : ctx.font;
  const lines = c.lines ?? (c.text ? [c.text] : []);
  if (!lines.length) return;
  const lh = size + 3;
  const blockH = lines.length * lh;
  let y = top - (h - blockH) / 2 - size;
  for (const line of lines) {
    const tw = f.widthOfTextAtSize(line, size);
    const x0 =
      c.align === "right"
        ? x + c.w - 6 - tw
        : c.align === "center"
          ? x + (c.w - tw) / 2
          : x + 6;
    ctx.page.drawText(line, { x: x0, y, size, font: f, color: BLACK });
    y -= lh;
  }
}

/** Desenha uma linha de tabela com bordas em todas as células. Retorna o novo topo. */
export function drawRow(
  ctx: Ctx,
  x: number,
  top: number,
  cells: Cell[],
  opts: { height?: number; fill?: boolean } = {},
): number {
  const size = cells[0]?.size ?? 9.5;
  const maxLines = Math.max(1, ...cells.map((c) => (c.lines ? c.lines.length : 1)));
  const h = opts.height ?? Math.max(20, maxLines * (size + 3) + 8);
  let cx = x;
  for (const c of cells) {
    ctx.page.drawRectangle({
      x: cx,
      y: top - h,
      width: c.w,
      height: h,
      borderColor: BORDER,
      borderWidth: 0.8,
      color: opts.fill ? HEAD_FILL : undefined,
    });
    drawCellText(ctx, c, cx, top, h);
    cx += c.w;
  }
  return top - h;
}

/** Linha tracejada de recorte. */
export function dashedLine(ctx: Ctx, x: number, y: number, w: number) {
  let cx = x;
  while (cx < x + w) {
    const end = Math.min(cx + 4, x + w);
    ctx.page.drawLine({
      start: { x: cx, y },
      end: { x: end, y },
      thickness: 0.8,
      color: BLACK,
    });
    cx += 7;
  }
}

/** Bloco de assinaturas (duas colunas com linha, nome e data). */
export function signatures(
  ctx: Ctx,
  y: number,
  left: { name: string; date?: string },
  right: { name: string; date?: string },
) {
  const lw = 240;
  const lx = MARGIN + 20;
  const rx = MARGIN + CONTENT_W - lw - 20;
  for (const [x, block] of [
    [lx, left],
    [rx, right],
  ] as const) {
    ctx.page.drawLine({
      start: { x, y },
      end: { x: x + lw, y },
      thickness: 1,
      color: BLACK,
    });
    const put = (s: string, dy: number) => {
      const tw = ctx.bold.widthOfTextAtSize(s, 9.5);
      ctx.page.drawText(s, {
        x: x + (lw - tw) / 2,
        y: y - dy,
        size: 9.5,
        font: ctx.bold,
        color: BLACK,
      });
    };
    put(block.name, 14);
    if (block.date) put(block.date, 27);
  }
}

export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export const num = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    v || 0,
  );

export const dt = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
