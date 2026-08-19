import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

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

/** Recibo de Ordem de Serviço / Garantia em PDF (A4, pronto para impressão). */
export async function buildServiceOrderPdf(d: ServiceOrderData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
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
  const pair = (label: string, value: string, x = M, colW = W) => {
    at(label, x, 7.5, false, grey);
    at(value, x + 90, 9.5, true);
    void colW;
    y -= 16;
  };

  // Cabeçalho
  at(d.store.name, M, 17, true);
  at(`Nº OS ${String(d.number).padStart(4, "0")}`, M + W - 110, 13, true);
  y -= 16;
  if (d.store.address) {
    at(d.store.address, M, 8.5, false, grey);
    y -= 11;
  }
  if (d.store.contact) {
    at(d.store.contact, M, 8.5, false, grey);
    y -= 11;
  }
  at(
    `Emissão: ${new Date(d.openedAt).toLocaleString("pt-BR")}` +
      (d.finishedAt ? `   ·   Finalização: ${new Date(d.finishedAt).toLocaleString("pt-BR")}` : ""),
    M,
    8.5,
    false,
    grey,
  );
  y -= 8;
  rule();
  y -= 14;
  at(
    d.kind === "manutencao" ? "ORDEM DE SERVIÇO - MANUTENÇÃO" : "ORDEM DE SERVIÇO - GARANTIA",
    M,
    12,
    true,
  );
  y -= 6;

  section("Cliente");
  pair("Cliente", d.customerName);
  if (d.customerDoc) pair("CPF", d.customerDoc);
  if (d.customerPhone) pair("Telefone", d.customerPhone);
  if (d.customerAddress) pair("Endereço", d.customerAddress);
  pair("Responsável", d.responsible);
  pair("Status da OS", d.status);

  section("Aparelho");
  pair("Modelo", d.device.model);
  if (d.device.imei) pair("IMEI", d.device.imei);
  if (d.device.serial) pair("Nº de série", d.device.serial);
  if (d.device.color) pair("Cor", d.device.color);
  if (d.device.storage) pair("Armazenamento", d.device.storage);
  if (d.device.password) pair("Senha", d.device.password);

  if (d.reportedIssue) {
    section("Relato do cliente");
    for (const l of wrap(d.reportedIssue, 9.5, W)) {
      at(l, M, 9.5);
      y -= 13;
    }
  }

  if (d.services || d.parts) {
    section("Serviços e peças");
    for (const l of wrap([d.services, d.parts].filter(Boolean).join("\n"), 9.5, W)) {
      at(l, M, 9.5);
      y -= 13;
    }
  }

  section("Valores");
  pair("Valor total da OS", brl(d.total));
  if (d.paymentMethod) pair("Forma de pagamento", d.paymentMethod);
  if (d.installments > 1) pair("Parcelas", `${d.installments}x`);

  section("Garantia do serviço");
  for (const l of wrap(
    d.warrantyDays > 0
      ? `Garantia de ${d.warrantyDays} dias sobre o serviço executado e as peças substituídas, a contar da data de finalização desta OS. A garantia não cobre danos por queda, contato com líquidos, mau uso ou intervenção de terceiros.`
      : "Serviço sem garantia adicional.",
    9,
    W,
  )) {
    at(l, M, 9);
    y -= 12;
  }
  if (d.notes) {
    y -= 6;
    for (const l of wrap(d.notes, 9, W)) {
      at(l, M, 9, false, grey);
      y -= 12;
    }
  }

  // Assinaturas
  y = Math.min(y, 150);
  page.drawLine({ start: { x: M, y }, end: { x: M + 210, y }, thickness: 0.7, color: soft });
  page.drawLine({
    start: { x: M + W - 210, y },
    end: { x: M + W, y },
    thickness: 0.7,
    color: soft,
  });
  y -= 12;
  at("Assinatura do cliente", M, 8.5, false, grey);
  at("Assinatura da loja", M + W - 210, 8.5, false, grey);
  y -= 12;
  at(d.customerName, M, 9);
  at(d.store.name, M + W - 210, 9);

  return pdf.save();
}
