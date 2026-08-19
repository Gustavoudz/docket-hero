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

/** Contrato / recibo de venda em PDF, no formato de comprovante para o cliente. */
export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const grey = rgb(0.35, 0.35, 0.35);
  const soft = rgb(0.82, 0.82, 0.82);
  const M = 45;
  const W = 595.28 - M * 2;
  let y = 795;

  const at = (s: string, x: number, size = 9, b = false, color = black) =>
    page.drawText(s, { x, y, size, font: b ? bold : font, color });
  const right = (s: string, size = 9, b = false, color = black) => {
    const f = b ? bold : font;
    page.drawText(s, { x: M + W - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  };
  const rule = (dy = 6) =>
    page.drawLine({
      start: { x: M, y: y + dy },
      end: { x: M + W, y: y + dy },
      thickness: 0.7,
      color: soft,
    });
  const wrap = (s: string, size: number, max: number) => {
    const out: string[] = [];
    for (const raw of s.split("\n")) {
      let cur = "";
      for (const w of raw.split(/\s+/)) {
        const t = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) > max) {
          if (cur) out.push(cur);
          cur = w;
        } else cur = t;
      }
      out.push(cur);
    }
    return out;
  };
  const section = (title: string) => {
    y -= 12;
    page.drawRectangle({ x: M, y: y - 4, width: W, height: 16, color: rgb(0.94, 0.94, 0.94) });
    at(title.toUpperCase(), M + 6, 9, true, rgb(0.2, 0.2, 0.2));
    y -= 22;
  };
  const pair = (label: string, value: string) => {
    at(label, M, 7.5, false, grey);
    at(value, M + 110, 9.5, true);
    y -= 16;
  };

  // Cabeçalho
  at(d.store.name, M, 17, true);
  right(`Recibo Nº ${String(d.number).padStart(4, "0")}`, 13, true);
  y -= 16;
  if (d.store.address) {
    at(d.store.address, M, 8.5, false, grey);
    y -= 11;
  }
  if (d.store.contact) {
    at(d.store.contact, M, 8.5, false, grey);
    y -= 11;
  }
  at(new Date(d.saleDate).toLocaleString("pt-BR"), M, 8.5, false, grey);
  right(`Venda ${d.saleReference}`, 8.5, false, grey);
  y -= 8;
  rule();
  y -= 14;
  at("CONTRATO / RECIBO DE COMPRA E VENDA", M, 12, true);
  y -= 6;

  section("Dados do cliente");
  pair("Nome", d.customerName);
  if (d.customerDoc) pair("CPF", d.customerDoc);
  if (d.customerPhone) pair("Telefone", d.customerPhone);
  if (d.customerEmail) pair("E-mail", d.customerEmail);
  if (d.customerAddress) pair("Endereço", d.customerAddress);
  pair("Vendedor(a)", d.attendantName);

  section("Dados do produto");
  pair("Modelo", d.device.model);
  if (d.device.color) pair("Cor", d.device.color);
  if (d.device.storage) pair("Armazenamento", d.device.storage);
  if (d.device.serial) pair("Nº de série", d.device.serial);
  pair("Condição", d.device.condition === "lacrado" ? "Lacrado" : "Seminovo");
  y -= 4;
  rule();
  y -= 14;
  at("Valor total", M, 10, true);
  right(brl(d.total), 13, true);
  y -= 10;

  section("Pagamento");
  const list = d.payments.length
    ? d.payments
    : [{ method: d.paymentMethod, amount: d.total, installments: d.installments }];
  at("Forma de pagamento", M, 7.5, false, grey);
  at("Parcelas", M + 260, 7.5, false, grey);
  at("Valor", M + 340, 7.5, false, grey);
  y -= 14;
  for (const p of list) {
    at(p.method, M, 9.5);
    at(`${p.installments}x`, M + 260, 9.5);
    at(brl(p.amount), M + 340, 9.5, true);
    y -= 14;
  }

  if (d.warranty) {
    section("Garantia");
    for (const l of wrap(d.warranty, 9, W)) {
      at(l, M, 9);
      y -= 12;
    }
  }

  y -= 14;
  for (const l of wrap(
    "O comprador declara ter conferido o aparelho, seus acessórios e o funcionamento no ato da entrega, aceitando as condições descritas neste documento. Este documento é um recibo/comprovante de compra e venda e não possui valor fiscal.",
    8.5,
    W,
  )) {
    at(l, M, 8.5, false, grey);
    y -= 11;
  }

  y = Math.min(y, 130);
  page.drawLine({ start: { x: M, y }, end: { x: M + 210, y }, thickness: 0.7, color: soft });
  page.drawLine({ start: { x: M + W - 210, y }, end: { x: M + W, y }, thickness: 0.7, color: soft });
  y -= 12;
  at("Assinatura do cliente", M, 8.5, false, grey);
  at("Assinatura da loja", M + W - 210, 8.5, false, grey);
  y -= 12;
  at(d.customerName, M, 9);
  at(d.store.name, M + W - 210, 9);

  return pdf.save();
}
