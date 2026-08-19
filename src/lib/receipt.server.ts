import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

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
      "id, reference, total, created_at, appointment_id, inventory_item_id, customers(name, email, cpf, phone, whatsapp, address), appointments(customer_name, customer_email, payment_method, installments, completed_at, attendant_id), inventory_items(device_model, color, storage, serial_number, condition)",
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
    customerDoc: cust?.cpf ?? null,
    customerPhone: cust?.phone || cust?.whatsapp || null,
    customerAddress: cust?.address ?? null,
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

/** Recibo em PDF: fundo branco, texto preto, hierarquia simples para impressão. */
export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const grey = rgb(0.35, 0.35, 0.35);
  const M = 50;
  const W = 595.28 - M * 2;
  let y = 790;

  const text = (s: string, opts: { size?: number; bold?: boolean; color?: any; x?: number } = {}) => {
    page.drawText(s, {
      x: opts.x ?? M,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: opts.color ?? black,
    });
  };
  const line = () => {
    page.drawLine({
      start: { x: M, y: y + 6 },
      end: { x: M + W, y: y + 6 },
      thickness: 0.7,
      color: rgb(0.8, 0.8, 0.8),
    });
  };
  const wrap = (s: string, size: number, max: number) => {
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > max) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const row = (label: string, value: string) => {
    text(label, { size: 9, color: grey });
    text(value, { size: 11, bold: true, x: M + 170 });
    y -= 20;
  };
  const section = (title: string) => {
    y -= 10;
    line();
    y -= 14;
    text(title.toUpperCase(), { size: 9, bold: true, color: grey });
    y -= 18;
  };

  // Cabeçalho da loja
  text(d.store.name, { size: 18, bold: true });
  y -= 18;
  if (d.store.address) {
    text(d.store.address, { size: 9, color: grey });
    y -= 12;
  }
  if (d.store.contact) {
    text(d.store.contact, { size: 9, color: grey });
    y -= 12;
  }
  y -= 8;
  const numero = `Recibo Nº ${String(d.number).padStart(4, "0")}`;
  text(numero, { size: 13, bold: true });
  page.drawText(`Venda ${d.saleReference}`, {
    x: M + W - font.widthOfTextAtSize(`Venda ${d.saleReference}`, 10),
    y,
    size: 10,
    font,
    color: grey,
  });
  y -= 12;

  section("Dados da venda");
  row("Data e horário", new Date(d.saleDate).toLocaleString("pt-BR"));
  row("Cliente", d.customerName);
  if (d.customerEmail) row("E-mail do cliente", d.customerEmail);
  row("Atendente", d.attendantName);

  section("Aparelho");
  row("Modelo", d.device.model);
  if (d.device.color) row("Cor", d.device.color);
  if (d.device.storage) row("Armazenamento", d.device.storage);
  if (d.device.serial) row("Número de série", d.device.serial);
  row("Condição", d.device.condition === "lacrado" ? "Lacrado" : "Seminovo");

  section("Valores");
  row("Valor da venda", brl(d.total));
  row("Forma de pagamento", d.paymentMethod);
  row("Parcelas", `${d.installments}x`);

  if (d.warranty) {
    section("Garantia");
    for (const l of wrap(d.warranty, 10, W)) {
      text(l, { size: 10 });
      y -= 14;
    }
  }

  y -= 20;
  line();
  y -= 16;
  for (const l of wrap(
    "Este documento é um recibo/comprovante de venda e não possui valor fiscal.",
    9,
    W,
  )) {
    text(l, { size: 9, color: grey });
    y -= 12;
  }

  return pdf.save();
}
