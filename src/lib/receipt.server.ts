import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4,
  CONTENT_W,
  MARGIN,
  brl,
  dashedLine,
  drawRow,
  signatures,
  wrapText,
  type Ctx,
} from "./pdf-layout.server";

export type ReceiptData = {
  number: number;
  token: string;
  sentAt: string | null;
  saleReference: string;
  saleDate: string;
  customerName: string;
  customerEmail: string | null;
  customerDoc: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerCep: string | null;
  customerCity: string | null;
  customerState: string | null;
  device: { model: string; color: string | null; storage: string | null; serial: string | null; condition: string };
  total: number;
  paymentMethod: string;
  installments: number;
  payments: { method: string; amount: number; installments: number }[];
  attendantName: string;
  store: { name: string; address: string; contact: string };
  warranty: string;
};

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  dinheiro: "Dinheiro",
};

const fmtDoc = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return v ?? null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** Carrega tudo que o recibo precisa. Recebe um client Supabase já autorizado. */
export async function loadReceiptData(
  db: any,
  where: { saleId?: string; token?: string },
): Promise<ReceiptData | null> {
  let q = db
    .from("receipts")
    .select("id, receipt_number, public_token, customer_email, sale_id, sent_at");
  q = where.token ? q.eq("public_token", where.token) : q.eq("sale_id", where.saleId);
  const { data: receipt } = await q.maybeSingle();
  if (!receipt) return null;

  const { data: sale } = await db
    .from("sales")
    .select(
      "id, reference, total, created_at, appointment_id, inventory_item_id, customers(name, email, cpf, phone, whatsapp, address, street, street_number, complement, district, city, state, cep, birth_date), appointments(customer_name, customer_email, payment_method, installments, completed_at, attendant_id), inventory_items(device_model, color, storage, serial_number, condition)",
    )
    .eq("id", receipt.sale_id)
    .maybeSingle();
  if (!sale) return null;

  const appt = Array.isArray(sale.appointments) ? sale.appointments[0] : sale.appointments;
  const cust = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
  const item = Array.isArray(sale.inventory_items) ? sale.inventory_items[0] : sale.inventory_items;

  const { data: settingRows } = await db.from("app_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const r of settingRows ?? []) settings[r.key] = r.value;

  let attendantName = "—";
  if (appt?.attendant_id) {
    const { data: p } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", appt.attendant_id)
      .maybeSingle();
    attendantName = p?.full_name || p?.email || "—";
  }

  const condition = item?.condition === "lacrado" ? "lacrado" : "seminovo";

  const { data: paymentRows } = await db
    .from("payments")
    .select("method, gross_amount, installments, status")
    .eq("sale_id", receipt.sale_id);
  const payments = (paymentRows ?? [])
    .filter((p: any) => p.status !== "cancelado" && p.status !== "estornado")
    .map((p: any) => ({
      method: METHOD_LABEL[p.method] ?? String(p.method),
      amount: Number(p.gross_amount) || 0,
      installments: Number(p.installments) || 1,
    }));

  return {
    number: Number(receipt.receipt_number),
    token: receipt.public_token,
    sentAt: receipt.sent_at ?? null,
    saleReference: sale.reference,
    saleDate: appt?.completed_at ?? sale.created_at,
    customerName: cust?.name || appt?.customer_name || "Cliente",
    customerEmail: receipt.customer_email || appt?.customer_email || cust?.email || null,
    customerDoc: fmtDoc(cust?.cpf),
    customerPhone: cust?.phone || cust?.whatsapp || null,
    customerAddress:
      [
        [cust?.street, cust?.street_number].filter(Boolean).join(", "),
        cust?.complement,
        cust?.district,
      ]
        .filter(Boolean)
        .join(" — ") ||
      cust?.address ||
      null,
    customerCep: cust?.cep ?? null,
    customerCity: cust?.city ?? null,
    customerState: cust?.state ?? null,
    device: {
      model: item?.device_model ?? "—",
      color: item?.color ?? null,
      storage: item?.storage ?? null,
      serial: item?.serial_number ?? null,
      condition,
    },
    total: Number(sale.total) || 0,
    paymentMethod: METHOD_LABEL[appt?.payment_method ?? ""] ?? "Não informado",
    installments: Number(appt?.installments) || 1,
    payments,
    attendantName,
    store: {
      name: settings["store_name"] || "Legado Phones",
      address: settings["store_address"] || "",
      contact: settings["store_contact"] || "",
    },
    warranty:
      condition === "lacrado"
        ? settings["warranty_lacrado"] || ""
        : settings["warranty_seminovo"] || "",
  };
}

/** Recibo de venda no formato exato do modelo da loja. */
export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const ctx: Ctx = {
    page,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const X = MARGIN;
  const W = CONTENT_W;
  let y = A4[1] - 45;

  const label = (s: string, dy = 14) => {
    y -= dy;
    ctx.page.drawText(s, { x: X, y: y - 9, size: 10, font: ctx.bold });
    y -= 13;
  };

  // Faixa superior de recebimento
  y = drawRow(ctx, X, y, [
    {
      w: W,
      text: `RECIBO DE ${d.store.name.toUpperCase()} OS PRODUTOS E/OU SERVIÇOS CONSTANTES NO PEDIDO`,
      bold: true,
      size: 10,
    },
  ]);
  y = drawRow(ctx, X, y, [
    { w: 160, text: "Data de recebimento", bold: true },
    { w: 225, text: "Identificação e assinatura do recebedor", bold: true },
    {
      w: W - 385,
      lines: wrapText(ctx.bold, `Recibo da venda: ${d.saleReference}`, 8.5, W - 397),
      bold: true,
      size: 8.5,
    },
  ]);

  y -= 12;
  dashedLine(ctx, X, y, W);
  y -= 12;

  // Cabeçalho da loja
  const storeLines = [d.store.name];
  if (d.store.address) storeLines.push(...wrapText(ctx.font, d.store.address, 9.5, 235));
  if (d.store.contact) storeLines.push(`Telefone: ${d.store.contact}`);
  const rightLines = [
    new Date(d.saleDate).toLocaleDateString("pt-BR"),
    ...wrapText(ctx.bold, `VENDEDOR: ${d.attendantName.toUpperCase()}`, 8.5, W - 397),
    "RECIBO DA VENDA:",
    d.saleReference,
  ];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: 140, text: d.store.name.toUpperCase(), bold: true, align: "center", size: 12 },
      { w: 245, lines: storeLines, align: "center" },
      { w: W - 385, lines: rightLines, align: "center", bold: true, size: 8.5 },
    ],
    { height: 78 },
  );

  // Destinatário
  label("DESTINATÁRIO/REMETENTE");
  const c4: [number,number,number,number] = [200, 120, 110, W - 430];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: c4[0], text: "Nome/Razão social", bold: true, align: "center" },
      { w: c4[1], text: "Telefone", bold: true, align: "center" },
      { w: c4[2], text: "CPF/CNPJ", bold: true, align: "center" },
      { w: c4[3], text: "E-mail", bold: true, align: "center" },
    ],
    { fill: true },
  );
  y = drawRow(ctx, X, y, [
    { w: c4[0], text: d.customerName.toUpperCase() },
    { w: c4[1], text: d.customerPhone ?? "" },
    { w: c4[2], text: d.customerDoc ?? "" },
    { w: c4[3], text: d.customerEmail ?? "", size: 8 },
  ]);
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: c4[0], text: "Endereço", bold: true, align: "center" },
      { w: c4[1], text: "CEP", bold: true, align: "center" },
      { w: c4[2], text: "Cidade", bold: true, align: "center" },
      { w: c4[3], text: "Estado", bold: true, align: "center" },
    ],
    { fill: true },
  );
  y = drawRow(ctx, X, y, [
    { w: c4[0], lines: wrapText(ctx.font, d.customerAddress ?? "", 9.5, c4[0] - 12) },
    { w: c4[1], text: d.customerCep ?? "" },
    { w: c4[2], text: d.customerCity ?? "" },
    { w: c4[3], text: d.customerState ?? "" },
  ]);

  // Produto
  label("DADOS DO PRODUTO");
  const cp: [number,number,number,number,number,number] = [50, 225, 35, 75, 60, W - 445];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: cp[0], text: "Cód", bold: true, align: "center" },
      { w: cp[1], text: "Produto", bold: true, align: "center" },
      { w: cp[2], text: "Qtd", bold: true, align: "center" },
      { w: cp[3], text: "Valor Unitário", bold: true, align: "center", size: 8.5 },
      { w: cp[4], text: "Desconto", bold: true, align: "center" },
      { w: cp[5], text: "Valor Total", bold: true, align: "center", size: 8.5 },
    ],
    { fill: true },
  );
  const productName = [
    d.device.model,
    d.device.storage,
    d.device.color,
    d.device.serial ? `Série: ${d.device.serial}` : null,
  ]
    .filter(Boolean)
    .join(" - ")
    .toUpperCase();
  y = drawRow(ctx, X, y, [
    { w: cp[0], text: String(d.number).padStart(6, "0"), align: "center" },
    { w: cp[1], lines: wrapText(ctx.font, productName, 9.5, cp[1] - 12) },
    { w: cp[2], text: "1", align: "right" },
    { w: cp[3], text: brl(d.total), align: "right" },
    { w: cp[4], text: "R$", align: "right" },
    { w: cp[5], text: brl(d.total), align: "right" },
  ]);
  y = drawRow(ctx, X, y, [
    { w: cp[0], text: "" },
    { w: cp[1], text: "Total", bold: true, align: "right" },
    { w: cp[2], text: "" },
    { w: cp[3], text: brl(d.total), align: "right" },
    { w: cp[4], text: "R$", align: "right" },
    { w: cp[5], text: brl(d.total), align: "right" },
  ]);

  // Pagamento
  label("PAGAMENTO");
  const cg: [number,number,number,number] = [180, 180, 100, W - 460];
  y = drawRow(
    ctx,
    X,
    y,
    [
      { w: cg[0], text: "Forma de Pagamento", bold: true, align: "center" },
      { w: cg[1], text: "Detalhes", bold: true, align: "center" },
      { w: cg[2], text: "Valor Pago", bold: true, align: "center" },
      { w: cg[3], text: "Parcelas", bold: true, align: "center", size: 8.5 },
    ],
    { fill: true },
  );
  const list = d.payments.length
    ? d.payments
    : [{ method: d.paymentMethod, amount: d.total, installments: d.installments }];
  for (const p of list) {
    y = drawRow(ctx, X, y, [
      { w: cg[0], text: p.method.toUpperCase() },
      { w: cg[1], text: "" },
      { w: cg[2], text: brl(p.amount), align: "right" },
      { w: cg[3], text: String(p.installments), align: "center", size: 8 },
    ]);
  }
  y = drawRow(ctx, X, y, [
    { w: cg[0], text: "" },
    { w: cg[1], text: "Total", bold: true, align: "right" },
    { w: cg[2], text: brl(list.reduce((a, p) => a + p.amount, 0)), align: "right" },
    { w: cg[3], text: "" },
  ]);

  label("OBSERVAÇÃO");
  /** Texto do termo com o nome real da loja no lugar do marcador [Loja]. */
  const warrantyText = (d.warranty ?? "").split("[Loja]").join(d.store.name);
  const BOTTOM = 70;

  /** Abre uma página nova mantendo o cabeçalho reduzido do modelo. */
  const newPage = () => {
    ctx.page = pdf.addPage(A4);
    let top = A4[1] - MARGIN;
    ctx.page.drawText(d.store.name.toUpperCase(), { x: X, y: top - 10, size: 10, font: ctx.bold });
    ctx.page.drawText(`RECIBO DA VENDA: ${d.saleReference}`, {
      x: X + W - ctx.font.widthOfTextAtSize(`RECIBO DA VENDA: ${d.saleReference}`, 8.5),
      y: top - 10,
      size: 8.5,
      font: ctx.font,
    });
    top -= 24;
    dashedLine(ctx, X, top, W);
    return top - 14;
  };

  if (warrantyText) {
    // Reduz a fonte (até 7pt) para tentar caber sem quebrar página; depois pagina.
    let size = 9;
    for (const candidate of [9, 8.5, 8, 7.5, 7]) {
      size = candidate;
      const lines = wrapText(ctx.font, warrantyText, candidate, W);
      if (y - lines.length * (candidate + 3) > BOTTOM + 120) break;
    }
    for (const l of wrapText(ctx.font, warrantyText, size, W)) {
      if (y - (size + 3) < BOTTOM) y = newPage();
      ctx.page.drawText(l, { x: X, y: y - size, size, font: ctx.font });
      y -= size + 3;
    }
  }
  if (y < 180) y = newPage();
  label("DADOS ADICIONAIS", 10);

  signatures(
    ctx,
    Math.max(BOTTOM + 40, Math.min(y - 60, 250)),
    { name: d.customerName.toUpperCase() },
    {
      name: d.store.name,
      date: new Date(d.saleDate).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  );

  return pdf.save();
}
