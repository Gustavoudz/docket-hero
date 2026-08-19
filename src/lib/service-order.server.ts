import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4,
  BLACK,
  CONTENT_W,
  MARGIN,
  drawRow,
  num,
  signatures,
  wrapText,
  type Ctx,
} from "./pdf-layout.server";

export type ServiceOrderData = {
  number: number;
  kind: string;
  status: string;
  openedAt: string;
  finishedAt: string | null;
  customerName: string;
  customerDoc: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  responsible: string;
  device: {
    model: string;
    imei: string | null;
    serial: string | null;
    color: string | null;
    storage: string | null;
    password: string | null;
  };
  reportedIssue: string | null;
  services: string | null;
  parts: string | null;
  total: number;
  paymentMethod: string | null;
  installments: number;
  warrantyDays: number;
  notes: string | null;
  store: { name: string; address: string; contact: string };
};

const fmtDoc = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return v ?? null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta - Em análise",
  em_andamento: "Em andamento",
  finalizado: "Finalizado - Aguardando retirada",
  entregue: "Entregue ao cliente",
};

/** Carrega a OS/garantia com os dados da loja. Recebe um client Supabase autorizado. */
export async function loadServiceOrderData(
  db: any,
  where: { id?: string; token?: string },
): Promise<ServiceOrderData | null> {
  let q = db
    .from("service_orders")
    .select("*, customers(name, cpf, phone, whatsapp, address)");
  q = where.token ? q.eq("public_token", where.token) : q.eq("id", where.id);
  const { data: os } = await q.maybeSingle();
  if (!os) return null;

  const cust = Array.isArray(os.customers) ? os.customers[0] : os.customers;

  const { data: settingRows } = await db.from("app_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const r of settingRows ?? []) settings[r.key] = r.value;

  let responsible = "—";
  const who = os.responsible_id ?? os.created_by;
  if (who) {
    const { data: p } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", who)
      .maybeSingle();
    responsible = p?.full_name || p?.email || "—";
  }

  return {
    number: Number(os.os_number),
    kind: os.kind,
    status: STATUS_LABEL[os.status] ?? os.status,
    openedAt: os.opened_at,
    finishedAt: os.finished_at ?? null,
    customerName: cust?.name || os.customer_name,
    customerDoc: fmtDoc(cust?.cpf),
    customerPhone: cust?.phone || cust?.whatsapp || null,
    customerAddress: cust?.address ?? null,
    responsible,
    device: {
      model: os.device_model,
      imei: os.imei ?? null,
      serial: os.serial_number ?? null,
      color: os.color ?? null,
      storage: os.storage ?? null,
      password: os.device_password ?? null,
    },
    reportedIssue: os.reported_issue ?? null,
    services: os.services ?? null,
    parts: os.parts ?? null,
    total: Number(os.total) || 0,
    paymentMethod: os.payment_method ?? null,
    installments: Number(os.installments) || 1,
    warrantyDays: Number(os.warranty_days) || 0,
    notes: os.notes ?? null,
    store: {
      name: settings["store_name"] || "Legado Phones",
      address: settings["store_address"] || "",
      contact: settings["store_contact"] || "",
    },
  };
}

/** Recibo de Ordem de Serviço / Garantia no formato exato do modelo da loja. */
export async function buildServiceOrderPdf(d: ServiceOrderData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const ctx: Ctx = {
    page,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const X = MARGIN;
  const W = CONTENT_W;
  let y = A4[1] - 55;

  const fmtDate = (v?: string | null) =>
    v
      ? new Date(v).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  // Cabeçalho: logo | dados da loja | identificação da OS
  const center = (s: string, size: number, b: boolean, cx: number, cy: number) => {
    const f = b ? ctx.bold : ctx.font;
    ctx.page.drawText(s, { x: cx - f.widthOfTextAtSize(s, size) / 2, y: cy, size, font: f });
  };
  const logoW = 150;
  ctx.page.drawRectangle({
    x: X,
    y: y - 58,
    width: logoW,
    height: 58,
    color: BLACK,
  });
  const logoText = d.store.name.toUpperCase();
  ctx.page.drawText(logoText, {
    x: X + (logoW - ctx.bold.widthOfTextAtSize(logoText, 13)) / 2,
    y: y - 33,
    size: 13,
    font: ctx.bold,
    color: A4 && ({ type: "RGB", red: 1, green: 1, blue: 1 } as never),
  });

  const cx = X + logoW + 145;
  let hy = y - 10;
  center(d.store.name, 11, false, cx, hy);
  hy -= 14;
  if (d.store.address) {
    center(d.store.address, 10, false, cx, hy);
    hy -= 14;
  }
  if (d.store.contact) {
    center(`Telefone: ${d.store.contact}`, 10, true, cx, hy);
    hy -= 14;
  }

  let ry = y - 10;
  const rx = X + W - 165;
  const rline = (lbl: string, val: string) => {
    ctx.page.drawText(lbl, { x: rx, y: ry, size: 10, font: ctx.bold });
    ctx.page.drawText(val, {
      x: rx + ctx.bold.widthOfTextAtSize(lbl, 10) + 3,
      y: ry,
      size: 10,
      font: ctx.font,
    });
    ry -= 14;
  };
  rline("N° OS:", String(d.number));
  rline("Emissão:", fmtDate(d.openedAt));
  if (d.finishedAt) rline("Finalização:", fmtDate(d.finishedAt));

  y = Math.min(hy, ry, y - 62) - 8;

  // Dados do cliente
  const info = (lbl: string, val: string) => {
    ctx.page.drawText(lbl, { x: X, y, size: 10, font: ctx.bold });
    ctx.page.drawText(val, {
      x: X + ctx.bold.widthOfTextAtSize(lbl, 10) + 4,
      y,
      size: 10,
      font: ctx.font,
    });
    y -= 15;
  };
  info("Responsável:", d.responsible);
  info("Cliente:", d.customerName.toUpperCase());
  if (d.customerAddress) info("Endereço:", d.customerAddress);
  if (d.customerPhone) info("Telefone:", d.customerPhone);
  if (d.customerDoc) info("CPF:", d.customerDoc);
  info("Status da OS:", d.status);

  y -= 6;
  if (d.reportedIssue) {
    const lbl = "Relato do cliente:";
    ctx.page.drawText(lbl, { x: X, y, size: 10, font: ctx.bold });
    const offset = ctx.bold.widthOfTextAtSize(lbl, 10) + 4;
    const lines = wrapText(ctx.font, d.reportedIssue, 10, W - offset);
    ctx.page.drawText(lines[0] ?? "", { x: X + offset, y, size: 10, font: ctx.font });
    y -= 14;
    for (const l of lines.slice(1)) {
      ctx.page.drawText(l, { x: X, y, size: 10, font: ctx.font });
      y -= 14;
    }
  }
  y -= 6;

  // Aparelho
  const ca = [130, 90, 95, 60, 40, 50, W - 465];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: ca[0], text: "Aparelho", bold: true },
      { w: ca[1], text: "IMEI", bold: true },
      { w: ca[2], text: "Serial Number", bold: true, size: 9 },
      { w: ca[3], text: "Marca", bold: true },
      { w: ca[4], text: "GB", bold: true },
      { w: ca[5], text: "Cor", bold: true },
      { w: ca[6], text: "Senha", bold: true },
    ],
    { fill: true },
  );
  y = drawRow(ctx, X, y, [
    { w: ca[0], text: d.device.model.toUpperCase(), size: 9 },
    { w: ca[1], text: d.device.imei ?? "", size: 8 },
    { w: ca[2], text: d.device.serial ?? "", size: 8 },
    { w: ca[3], text: "" },
    { w: ca[4], text: d.device.storage ?? "", size: 8.5 },
    { w: ca[5], text: d.device.color ?? "", size: 8.5 },
    { w: ca[6], text: d.device.password ?? "", size: 8.5 },
  ]);

  // Produtos (peças)
  y -= 12;
  const cprod = [W - 250, 80, 85, 85];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: cprod[0], text: "Produto", bold: true },
      { w: cprod[1], text: "Qtd.", bold: true, align: "right" },
      { w: cprod[2], text: "Desconto (R$)", bold: true, align: "right", size: 9 },
      { w: cprod[3], text: "Total (R$)", bold: true, align: "right" },
    ],
    { fill: true },
  );
  const parts = (d.parts ?? "").split("\n").filter((l) => l.trim());
  if (!parts.length) parts.push("—");
  for (const p of parts) {
    y = drawRow(ctx, X, y, [
      { w: cprod[0], lines: wrapText(ctx.font, p, 9.5, cprod[0] - 12) },
      { w: cprod[1], text: "1", align: "right" },
      { w: cprod[2], text: "" },
      { w: cprod[3], text: "" },
    ]);
  }

  // Serviços
  y -= 12;
  const cserv = [W - 170, 85, 85];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: cserv[0], text: "Serviço", bold: true },
      { w: cserv[1], text: "Desconto (R$)", bold: true, align: "right", size: 9 },
      { w: cserv[2], text: "Total (R$)", bold: true, align: "right" },
    ],
    { fill: true },
  );
  const services = (d.services ?? "").split("\n").filter((l) => l.trim());
  if (!services.length) services.push("—");
  for (const [idx, sv] of services.entries()) {
    y = drawRow(ctx, X, y, [
      { w: cserv[0], lines: wrapText(ctx.font, sv, 9.5, cserv[0] - 12) },
      { w: cserv[1], text: "" },
      { w: cserv[2], text: idx === 0 ? num(d.total) : "", align: "right" },
    ]);
  }

  // Pagamento
  y -= 12;
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: cserv[0], text: "Forma de pagamento", bold: true },
      { w: cserv[1], text: "Parcelas", bold: true, align: "right" },
      { w: cserv[2], text: "Valor (R$)", bold: true, align: "right" },
    ],
    { fill: true },
  );
  y = drawRow(ctx, X, y, [
    { w: cserv[0], text: (d.paymentMethod ?? "—").toUpperCase() },
    { w: cserv[1], text: String(d.installments), align: "right" },
    { w: cserv[2], text: num(d.total), align: "right" },
  ]);

  // Total
  y -= 22;
  ctx.page.drawText("Valor total da OS:", { x: X, y, size: 10.5, font: ctx.bold });
  const totalStr = `R$ ${num(d.total)}`;
  ctx.page.drawText(totalStr, {
    x: X + W - ctx.bold.widthOfTextAtSize(totalStr, 10.5),
    y,
    size: 10.5,
    font: ctx.bold,
  });
  y -= 10;
  ctx.page.drawLine({ start: { x: X, y }, end: { x: X + W, y }, thickness: 1, color: BLACK });

  signatures(
    ctx,
    Math.min(y - 130, 300),
    { name: d.customerName.toUpperCase(), date: fmtDate(d.finishedAt ?? d.openedAt) },
    { name: d.store.name, date: fmtDate(d.openedAt) },
  );

  return pdf.save();
}
