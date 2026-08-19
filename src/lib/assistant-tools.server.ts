import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/hooks/useAuth";

export type ToolCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
  role: AppRole;
};

type Json = Record<string, unknown>;

export type AssistantTool = {
  name: string;
  description: string;
  parameters: Json;
  /** Ações de escrita exigem confirmação explícita do usuário. */
  write?: boolean;
  roles: AppRole[];
  /** Resumo mostrado antes de executar uma ação de escrita. */
  preview?: (args: Json, ctx: ToolCtx) => Promise<string>;
  run: (args: Json, ctx: ToolCtx) => Promise<string>;
};

const BRL = (v: unknown) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** "Hoje" no fuso da loja (America/Sao_Paulo). */
export function todaySP() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodRange(periodo: string | null) {
  const today = todaySP();
  if (periodo === "semana") {
    const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = shift(today, -dow);
    return { start, end: shift(start, 6), label: "esta semana" };
  }
  if (periodo === "mes") {
    const start = `${today.slice(0, 7)}-01`;
    const [y, m] = start.split("-").map(Number);
    const end = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
    return { start, end, label: "este mês" };
  }
  if (periodo === "tudo") return { start: "2000-01-01", end: "2999-12-31", label: "todo o período" };
  return { start: today, end: today, label: "hoje" };
}

const ASSISTANT_TAG = "[via assistente]";

async function audit(ctx: ToolCtx, action: string, entity: string, id: string | null, details: Json) {
  try {
    await ctx.supabase.rpc("write_audit_log", {
      _action: action,
      _entity_type: entity,
      _entity_id: id as string,
      _details: { ...details, via: "assistente" } as never,
    });
  } catch {
    /* auditoria é best-effort */
  }
}

/** Reserva automática: item Disponível mais antigo do modelo (mesma regra das telas). */
async function autoReserve(ctx: ToolCtx, model: string) {
  const { data } = await ctx.supabase
    .from("inventory_items")
    .select("id")
    .eq("device_model", model)
    .eq("status", "disponivel")
    .order("entered_at", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

async function findAppointment(
  ctx: ToolCtx,
  args: Json,
  recordType: "agendamento" | "venda" | null,
) {
  const id = str(args["appointment_id"]);
  let q = ctx.supabase
    .from("appointments")
    .select(
      "id, customer_name, device_model, scheduled_at, status, tag, record_type, inventory_device_id, product_price, notes",
    )
    .in("status", ["pendente"]);
  if (id) q = q.eq("id", id);
  else {
    const busca = str(args["cliente"]) ?? str(args["busca"]);
    if (!busca) throw new Error("Informe o cliente ou o identificador do registro.");
    q = q.ilike("customer_name", `%${busca}%`);
  }
  if (recordType) q = q.eq("record_type", recordType);
  const { data, error } = await q.order("scheduled_at", { ascending: true }).limit(5);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) throw new Error("Nenhum registro pendente encontrado com esses dados.");
  if (rows.length > 1)
    throw new Error(
      `Encontrei ${rows.length} registros: ${rows
        .map((r) => `${r.customer_name} (${r.device_model}, ${new Date(r.scheduled_at).toLocaleString("pt-BR")})`)
        .join("; ")}. Peça ao usuário para especificar qual.`,
    );
  return rows[0]!;
}

function appointmentPayload(args: Json, ctx: ToolCtx, type: "agendamento" | "venda") {
  const cliente = str(args["cliente"]);
  const modelo = str(args["modelo"]);
  const data = str(args["data"]);
  const hora = str(args["hora"]) ?? "10:00";
  if (!cliente) throw new Error("Falta o nome do cliente.");
  if (!modelo) throw new Error("Falta o modelo do aparelho.");
  if (!data) throw new Error("Falta a data.");
  const price = num(args["valor_produto"]);
  const sinal = num(args["sinal"]);
  const notes = [str(args["observacoes"]), ASSISTANT_TAG].filter(Boolean).join(" ");
  return {
    customer_name: cliente,
    device_model: modelo,
    customer_phone: str(args["telefone"]),
    customer_instagram: str(args["instagram"])?.replace(/^@+/, "") ?? null,
    notes,
    tag: str(args["tag"]),
    record_type: type,
    deposit_paid: type === "agendamento" && !!sinal,
    deposit_amount: type === "agendamento" && sinal ? sinal : null,
    product_price: price && price > 0 ? price : null,
    payments: [],
    scheduled_at: new Date(`${data}T${hora}:00-03:00`).toISOString(),
    attendant_id: ctx.userId,
    seller_id: ctx.userId,
  };
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  // ---------- Consultas ----------
  {
    name: "listar_agendamentos",
    description:
      "Consulta agendamentos e vendas registrados. Filtra por período (hoje/semana/mes/tudo), status e nome do cliente.",
    roles: ["gerente", "vendedora", "atendente"],
    parameters: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoje", "semana", "mes", "tudo"] },
        status: { type: "string", enum: ["pendente", "concluido", "cancelado", "convertido"] },
        cliente: { type: "string" },
        tipo: { type: "string", enum: ["agendamento", "venda"] },
      },
    },
    run: async (args, ctx) => {
      const { start, end, label } = periodRange(str(args["periodo"]));
      let q = ctx.supabase
        .from("appointments")
        .select("customer_name, device_model, scheduled_at, status, tag, record_type, product_price")
        .gte("scheduled_at", `${start}T00:00:00-03:00`)
        .lte("scheduled_at", `${end}T23:59:59-03:00`)
        .neq("status", "legado")
        .order("scheduled_at", { ascending: true })
        .limit(60);
      const status = str(args["status"]);
      if (status) q = q.eq("status", status as never);
      const tipo = str(args["tipo"]);
      if (tipo) q = q.eq("record_type", tipo as never);
      const cliente = str(args["cliente"]);
      if (cliente) q = q.ilike("customer_name", `%${cliente}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) return `Nenhum registro encontrado (${label}).`;
      return `${rows.length} registro(s) — ${label}:\n${rows
        .map(
          (r) =>
            `- ${new Date(r.scheduled_at).toLocaleString("pt-BR")} · ${r.customer_name} · ${r.device_model} · ${r.record_type ?? "agendamento"} · ${r.status}${r.tag ? ` · tag ${r.tag}` : ""}${r.product_price ? ` · ${BRL(r.product_price)}` : ""}`,
        )
        .join("\n")}`;
    },
  },
  {
    name: "consultar_vendas",
    description: "Consulta as vendas concluídas do dia ou do período, com faturamento total.",
    roles: ["gerente", "atendente"],
    parameters: {
      type: "object",
      properties: { periodo: { type: "string", enum: ["hoje", "semana", "mes", "tudo"] } },
    },
    run: async (args, ctx) => {
      const { start, end, label } = periodRange(str(args["periodo"]));
      const { data, error } = await ctx.supabase
        .from("appointments")
        .select("customer_name, device_model, product_price, status, completed_at")
        .eq("record_type", "venda")
        .eq("status", "concluido")
        .gte("scheduled_at", `${start}T00:00:00-03:00`)
        .lte("scheduled_at", `${end}T23:59:59-03:00`)
        .limit(100);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const total = rows.reduce((s, r) => s + Number(r.product_price ?? 0), 0);
      if (rows.length === 0) return `Nenhuma venda concluída ${label}.`;
      return `${rows.length} venda(s) ${label} — total ${BRL(total)}:\n${rows
        .map((r) => `- ${r.customer_name} · ${r.device_model} · ${BRL(r.product_price)}`)
        .join("\n")}`;
    },
  },
  {
    name: "consultar_estoque",
    description:
      "Consulta o estoque por modelo e/ou status. Retorna quantidade, itens e valor total disponível.",
    roles: ["gerente", "vendedora", "atendente"],
    parameters: {
      type: "object",
      properties: {
        modelo: { type: "string" },
        status: {
          type: "string",
          enum: ["disponivel", "reservado", "vendido", "manutencao", "incompleto"],
        },
      },
    },
    run: async (args, ctx) => {
      let q = ctx.supabase
        .from("inventory_items")
        .select("device_model, color, storage, serial_number, status, sale_price, entered_at")
        .order("entered_at", { ascending: true })
        .limit(120);
      const modelo = str(args["modelo"]);
      if (modelo) q = q.ilike("device_model", `%${modelo}%`);
      const status = str(args["status"]);
      if (status) q = q.eq("status", status as never);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) return "Nenhum item encontrado no estoque com esse filtro.";
      const disponiveis = rows.filter((r) => r.status === "disponivel");
      const total = disponiveis.reduce((s, r) => s + Number(r.sale_price ?? 0), 0);
      return `${rows.length} item(ns). Disponíveis: ${disponiveis.length} (valor de venda somado ${BRL(total)}).\n${rows
        .slice(0, 40)
        .map(
          (r) =>
            `- ${r.device_model}${r.color ? ` ${r.color}` : ""}${r.storage ? ` ${r.storage}` : ""} · ${r.status}${r.serial_number ? ` · série ${r.serial_number}` : ""}${r.sale_price ? ` · ${BRL(r.sale_price)}` : ""}`,
        )
        .join("\n")}`;
    },
  },
  {
    name: "estoque_parado",
    description:
      "Lista itens disponíveis parados há mais dias que o limite configurado e mostra o giro de estoque do período.",
    roles: ["gerente", "vendedora", "atendente"],
    parameters: { type: "object", properties: { dias: { type: "number" } } },
    run: async (args, ctx) => {
      const dias = num(args["dias"]) ?? 30;
      const { data, error } = await ctx.supabase
        .from("inventory_items")
        .select("device_model, entered_at, status, sold_at")
        .limit(300);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const today = Date.now();
      const parados = rows
        .filter((r) => r.status === "disponivel")
        .map((r) => ({
          ...r,
          dias: Math.floor((today - new Date(`${r.entered_at}T00:00:00`).getTime()) / 86_400_000),
        }))
        .filter((r) => r.dias > dias)
        .sort((a, b) => b.dias - a.dias);
      const vendidos = rows.filter(
        (r) => r.sold_at && today - new Date(r.sold_at).getTime() <= dias * 86_400_000,
      ).length;
      const entradas = rows.filter(
        (r) => today - new Date(`${r.entered_at}T00:00:00`).getTime() <= dias * 86_400_000,
      ).length;
      return `Giro nos últimos ${dias} dias: ${entradas} entrada(s), ${vendidos} venda(s).\n${
        parados.length === 0
          ? "Nenhum item parado além do limite."
          : `Parados há mais de ${dias} dias (${parados.length}):\n${parados
              .slice(0, 20)
              .map((r) => `- ${r.device_model} · ${r.dias} dias`)
              .join("\n")}`
      }`;
    },
  },
  {
    name: "consultar_comissoes",
    description:
      "Consulta comissões do período. Vendedora vê apenas as próprias; gerente vê todas.",
    roles: ["gerente", "vendedora"],
    parameters: {
      type: "object",
      properties: { periodo: { type: "string", enum: ["hoje", "semana", "mes", "tudo"] } },
    },
    run: async (args, ctx) => {
      const { start, end, label } = periodRange(str(args["periodo"]));
      let q = ctx.supabase
        .from("commissions")
        .select("seller_id, amount, device_model, completed_at, status")
        .eq("status", "ativa")
        .gte("completed_at", `${start}T00:00:00-03:00`)
        .lte("completed_at", `${end}T23:59:59-03:00`)
        .limit(200);
      if (ctx.role === "vendedora") q = q.eq("seller_id", ctx.userId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const total = rows.reduce((s, r) => s + Number(r.amount), 0);
      return `Comissões ${label}: ${rows.length} venda(s), total ${BRL(total)}.`;
    },
  },
  {
    name: "consultar_financeiro",
    description: "Consulta faturamento recebido, taxas, líquido e lucro do período (só gerente).",
    roles: ["gerente"],
    parameters: {
      type: "object",
      properties: { periodo: { type: "string", enum: ["hoje", "semana", "mes", "tudo"] } },
    },
    run: async (args, ctx) => {
      const { start, end, label } = periodRange(str(args["periodo"]));
      const [{ data: pays, error: pErr }, { data: apps, error: aErr }] = await Promise.all([
        ctx.supabase
          .from("payments")
          .select("gross_amount, fee_amount, net_amount, method")
          .eq("status", "aprovado")
          .gte("created_at", `${start}T00:00:00-03:00`)
          .lte("created_at", `${end}T23:59:59-03:00`),
        ctx.supabase
          .from("appointments")
          .select("profit_cents")
          .eq("status", "concluido")
          .gte("scheduled_at", `${start}T00:00:00-03:00`)
          .lte("scheduled_at", `${end}T23:59:59-03:00`),
      ]);
      if (pErr) throw new Error(pErr.message);
      if (aErr) throw new Error(aErr.message);
      const gross = (pays ?? []).reduce((s, p) => s + Number(p.gross_amount ?? 0), 0);
      const fees = (pays ?? []).reduce((s, p) => s + Number(p.fee_amount ?? 0), 0);
      const net = (pays ?? []).reduce((s, p) => s + Number(p.net_amount ?? 0), 0);
      const profit = (apps ?? []).reduce((s, a) => s + Number(a.profit_cents ?? 0), 0) / 100;
      return `Financeiro ${label}: recebido ${BRL(gross)} · taxas ${BRL(fees)} · líquido ${BRL(net)} · lucro das vendas ${BRL(profit)} (${(pays ?? []).length} pagamento(s)).`;
    },
  },

  // ---------- Ações ----------
  {
    name: "criar_agendamento",
    description:
      "Cria um novo agendamento (reserva automática de estoque igual à tela normal). Data no formato AAAA-MM-DD e hora HH:MM.",
    roles: ["gerente", "vendedora"],
    write: true,
    parameters: {
      type: "object",
      properties: {
        cliente: { type: "string" },
        modelo: { type: "string" },
        data: { type: "string", description: "AAAA-MM-DD" },
        hora: { type: "string", description: "HH:MM" },
        telefone: { type: "string" },
        instagram: { type: "string" },
        valor_produto: { type: "number" },
        sinal: { type: "number" },
        tag: { type: "string" },
        observacoes: { type: "string" },
      },
      required: ["cliente", "modelo", "data", "hora"],
    },
    preview: async (args, ctx) => {
      const p = appointmentPayload(args, ctx, "agendamento");
      return `Criar agendamento: ${p.customer_name} · ${p.device_model} · ${new Date(p.scheduled_at).toLocaleString("pt-BR")}${p.product_price ? ` · ${BRL(p.product_price)}` : ""}${p.deposit_amount ? ` · sinal ${BRL(p.deposit_amount)}` : ""}`;
    },
    run: async (args, ctx) => {
      const payload = appointmentPayload(args, ctx, "agendamento");
      const reserved = await autoReserve(ctx, payload.device_model);
      const { data, error } = await ctx.supabase
        .from("appointments")
        .insert({ ...payload, inventory_device_id: reserved } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await audit(ctx, "assistente_criar_agendamento", "appointments", data!.id, payload as Json);
      return `Agendamento criado para ${payload.customer_name}.${reserved ? " Aparelho reservado automaticamente no estoque." : " Nenhum aparelho disponível desse modelo para reservar."}`;
    },
  },
  {
    name: "cancelar_agendamento",
    description: "Cancela um agendamento pendente. O motivo é obrigatório.",
    roles: ["gerente", "vendedora"],
    write: true,
    parameters: {
      type: "object",
      properties: {
        appointment_id: { type: "string" },
        cliente: { type: "string" },
        motivo: { type: "string" },
      },
      required: ["motivo"],
    },
    preview: async (args, ctx) => {
      const motivo = str(args["motivo"]);
      if (!motivo) throw new Error("O motivo do cancelamento é obrigatório.");
      const a = await findAppointment(ctx, args, "agendamento");
      return `Cancelar agendamento de ${a.customer_name} (${a.device_model}, ${new Date(a.scheduled_at).toLocaleString("pt-BR")}) — motivo: ${motivo}`;
    },
    run: async (args, ctx) => {
      const motivo = str(args["motivo"]);
      if (!motivo) throw new Error("O motivo do cancelamento é obrigatório.");
      const a = await findAppointment(ctx, args, "agendamento");
      const { error } = await ctx.supabase
        .from("appointments")
        .update({ status: "cancelado", cancel_reason: `${motivo} ${ASSISTANT_TAG}` })
        .eq("id", a.id);
      if (error) throw new Error(error.message);
      await audit(ctx, "assistente_cancelar_agendamento", "appointments", a.id, { motivo });
      return `Agendamento de ${a.customer_name} cancelado (${motivo}).`;
    },
  },
  {
    name: "criar_venda",
    description: "Cria um novo registro de venda. Data AAAA-MM-DD e hora HH:MM.",
    roles: ["gerente", "atendente"],
    write: true,
    parameters: {
      type: "object",
      properties: {
        cliente: { type: "string" },
        modelo: { type: "string" },
        data: { type: "string" },
        hora: { type: "string" },
        telefone: { type: "string" },
        valor_produto: { type: "number" },
        tag: { type: "string" },
        observacoes: { type: "string" },
      },
      required: ["cliente", "modelo", "data", "hora"],
    },
    preview: async (args, ctx) => {
      const p = appointmentPayload(args, ctx, "venda");
      return `Criar venda: ${p.customer_name} · ${p.device_model} · ${new Date(p.scheduled_at).toLocaleString("pt-BR")}${p.product_price ? ` · ${BRL(p.product_price)}` : ""}`;
    },
    run: async (args, ctx) => {
      const payload = appointmentPayload(args, ctx, "venda");
      const reserved = await autoReserve(ctx, payload.device_model);
      const { data, error } = await ctx.supabase
        .from("appointments")
        .insert({ ...payload, inventory_device_id: reserved } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await audit(ctx, "assistente_criar_venda", "appointments", data!.id, payload as Json);
      return `Venda criada para ${payload.customer_name}.${reserved ? " Aparelho reservado no estoque." : ""}`;
    },
  },
  {
    name: "transformar_agendamento_em_venda",
    description:
      "Transforma um agendamento pendente em venda, mantendo o vínculo com o registro de origem.",
    roles: ["gerente", "atendente"],
    write: true,
    parameters: {
      type: "object",
      properties: { appointment_id: { type: "string" }, cliente: { type: "string" } },
    },
    preview: async (args, ctx) => {
      const a = await findAppointment(ctx, args, "agendamento");
      return `Transformar em venda o agendamento de ${a.customer_name} (${a.device_model}, ${new Date(a.scheduled_at).toLocaleString("pt-BR")})`;
    },
    run: async (args, ctx) => {
      const a = await findAppointment(ctx, args, "agendamento");
      const reserved = a.inventory_device_id ?? (await autoReserve(ctx, a.device_model));
      const { data, error } = await ctx.supabase
        .from("appointments")
        .insert({
          customer_name: a.customer_name,
          device_model: a.device_model,
          record_type: "venda",
          tag: a.tag,
          product_price: a.product_price,
          notes: [a.notes, ASSISTANT_TAG].filter(Boolean).join(" "),
          scheduled_at: new Date().toISOString(),
          attendant_id: ctx.userId,
          seller_id: ctx.userId,
          deposit_paid: false,
          payments: [],
          inventory_device_id: reserved,
          converted_from_appointment_id: a.id,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { error: convErr } = await ctx.supabase
        .from("appointments")
        .update({ status: "convertido" })
        .eq("id", a.id);
      if (convErr) throw new Error(convErr.message);
      await audit(ctx, "assistente_converter_venda", "appointments", data!.id, { origem: a.id });
      return `Agendamento de ${a.customer_name} virou venda. Conclua a venda quando o pagamento for registrado.`;
    },
  },
  {
    name: "concluir_venda",
    description:
      "Conclui uma venda pendente. Se a venda tiver tag de Upgrade, exige que o usuário tenha enviado no chat a foto do aparelho recebido na troca e informado valor de custo e valor de venda desse aparelho.",
    roles: ["gerente", "atendente"],
    write: true,
    parameters: {
      type: "object",
      properties: {
        appointment_id: { type: "string" },
        cliente: { type: "string" },
        troca_valor_custo: {
          type: "number",
          description: "Valor de custo do aparelho recebido na troca (só em venda com Upgrade)",
        },
        troca_valor_venda: {
          type: "number",
          description: "Valor de venda do aparelho recebido na troca (só em venda com Upgrade)",
        },
      },
    },
    preview: async (args, ctx) => {
      const a = await findAppointment(ctx, args, "venda");
      if (isUpgrade(a.tag)) {
        const t = tradeFromArgs(args);
        return (
          `Concluir venda Upgrade de ${a.customer_name} (${a.device_model}${a.product_price ? `, ${BRL(a.product_price)}` : ""})\n` +
          `Aparelho recebido na troca (lido da foto): ${t.modelo}${t.cor ? ` ${t.cor}` : ""}${t.armazenamento ? ` ${t.armazenamento}` : ""}${t.serie ? ` · série ${t.serie}` : ""}\n` +
          `Custo ${BRL(t.custo)} · venda ${BRL(t.venda)}`
        );
      }
      return `Concluir venda de ${a.customer_name} (${a.device_model}${a.product_price ? `, ${BRL(a.product_price)}` : ""})`;
    },
    run: async (args, ctx) => {
      const a = await findAppointment(ctx, args, "venda");
      if (isUpgrade(a.tag)) {
        const t = tradeFromArgs(args);
        const status = t.serie ? "disponivel" : "incompleto";
        const { data: created, error: createErr } = await ctx.supabase
          .from("inventory_items")
          .insert({
            device_model: t.modelo,
            color: t.cor,
            storage: t.armazenamento,
            serial_number: t.serie,
            imei: t.imei,
            sale_price: t.venda,
            condition: "seminovo" as never,
            status: status as never,
            entered_at: todaySP(),
            notes: `Recebido na venda de ${a.customer_name} ${ASSISTANT_TAG}`,
            created_by: ctx.userId,
          } as never)
          .select("id")
          .single();
        if (createErr) throw new Error(createErr.message);
        const { error: costErr } = await ctx.supabase
          .from("inventory_costs")
          .insert({ item_id: created!.id, cost_price: t.custo });
        if (costErr) throw new Error(costErr.message);
        await ctx.supabase.from("inventory_events").insert({
          item_id: created!.id,
          kind: "criado_via_troca",
          reason: `Recebido na venda de ${a.customer_name} ${ASSISTANT_TAG}`,
          appointment_id: a.id,
          actor_id: ctx.userId,
        });
        const soldId = a.inventory_device_id ?? (await autoReserve(ctx, a.device_model));
        if (!soldId)
          throw new Error("Não é possível concluir sem um aparelho vinculado ao estoque.");
        const { error: updErr } = await ctx.supabase
          .from("appointments")
          .update({ status: "concluido", inventory_device_id: soldId })
          .eq("id", a.id);
        if (updErr) throw new Error(updErr.message);
        await audit(ctx, "assistente_concluir_venda_upgrade", "appointments", a.id, {
          troca_item: created!.id,
        });
        return `Venda Upgrade de ${a.customer_name} concluída. ${t.modelo} entrou no estoque como ${status === "disponivel" ? "Disponível" : "Incompleto"}.`;
      }
      const itemId = a.inventory_device_id ?? (await autoReserve(ctx, a.device_model));
      if (!itemId)
        throw new Error("Não é possível concluir sem um aparelho vinculado ao estoque.");
      const { error } = await ctx.supabase
        .from("appointments")
        .update({ status: "concluido", inventory_device_id: itemId })
        .eq("id", a.id);
      if (error) throw new Error(error.message);
      await audit(ctx, "assistente_concluir_venda", "appointments", a.id, {});
      return `Venda de ${a.customer_name} concluída. Pagamentos, comissão e lucro foram gerados pelo fluxo normal.`;
    },
  },
  {
    name: "cadastrar_item_estoque",
    description:
      "Cadastra um item de estoque. Aceita os dados digitados pelo usuário ou os dados lidos de uma foto enviada no chat (caixa do lacrado ou tela de Ajustes do seminovo). Precisa de modelo, valor de custo e valor de venda.",
    roles: ["gerente", "vendedora", "atendente"],
    write: true,
    parameters: {
      type: "object",
      properties: {
        modelo: { type: "string" },
        cor: { type: "string" },
        armazenamento: { type: "string" },
        valor_custo: { type: "number" },
        valor_venda: { type: "number" },
        email: { type: "string", description: "Apple ID do aparelho" },
        numero_serie: { type: "string" },
        estado: { type: "string", enum: ["lacrado", "seminovo"] },
      },
      required: ["modelo", "valor_custo", "valor_venda"],
    },
    preview: async (args) => {
      applyPhotoFallback(args);
      if (!str(args["modelo"])) throw new Error("Falta o modelo.");
      if (num(args["valor_custo"]) == null) throw new Error("Falta o valor de custo.");
      if (num(args["valor_venda"]) == null) throw new Error("Falta o valor de venda.");
      return `Cadastrar no estoque: ${str(args["modelo"])}${str(args["cor"]) ? ` ${str(args["cor"])}` : ""}${str(args["armazenamento"]) ? ` ${str(args["armazenamento"])}` : ""} · custo ${BRL(num(args["valor_custo"]))} · venda ${BRL(num(args["valor_venda"]))}${str(args["numero_serie"]) ? ` · série ${str(args["numero_serie"])}` : ""}${str(args["email"]) ? ` · ${str(args["email"])}` : ""}`;
    },
    run: async (args, ctx) => {
      applyPhotoFallback(args);
      const modelo = str(args["modelo"]);
      const custo = num(args["valor_custo"]);
      const venda = num(args["valor_venda"]);
      if (!modelo || custo == null || venda == null)
        throw new Error("Modelo, valor de custo e valor de venda são obrigatórios.");
      const { data, error } = await ctx.supabase
        .from("inventory_items")
        .insert({
          device_model: modelo,
          color: str(args["cor"]),
          storage: str(args["armazenamento"]),
          apple_id: str(args["email"]),
          serial_number: str(args["numero_serie"]),
          imei: str(args["foto_imei"]),
          sale_price: venda,
          condition: (str(args["estado"]) ?? "seminovo") as never,
          status: "disponivel",
          entered_at: todaySP(),
          notes: ASSISTANT_TAG,
          created_by: ctx.userId,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { error: costErr } = await ctx.supabase
        .from("inventory_costs")
        .insert({ item_id: data!.id, cost_price: custo });
      if (costErr) throw new Error(costErr.message);
      await audit(ctx, "assistente_cadastrar_item", "inventory_items", data!.id, { modelo });
      return `${modelo} cadastrado no estoque como Disponível.`;
    },
  },
  {
    name: "marcar_item_manutencao",
    description: "Marca um item do estoque como Em manutenção.",
    roles: ["gerente", "vendedora", "atendente"],
    write: true,
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        numero_serie: { type: "string" },
        modelo: { type: "string" },
        motivo: { type: "string" },
      },
    },
    preview: async (args, ctx) => {
      const item = await findItem(ctx, args);
      return `Marcar como Em manutenção: ${item.device_model}${item.serial_number ? ` (série ${item.serial_number})` : ""}${str(args["motivo"]) ? ` — ${str(args["motivo"])}` : ""}`;
    },
    run: async (args, ctx) => {
      const item = await findItem(ctx, args);
      const { error } = await ctx.supabase
        .from("inventory_items")
        .update({ status: "manutencao" })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
      await ctx.supabase.from("inventory_events").insert({
        item_id: item.id,
        kind: "manutencao",
        reason: `${str(args["motivo"]) ?? "Enviado para manutenção"} ${ASSISTANT_TAG}`,
        actor_id: ctx.userId,
      });
      await audit(ctx, "assistente_manutencao", "inventory_items", item.id, {});
      return `${item.device_model} marcado como Em manutenção.`;
    },
  },
];

const isUpgrade = (tag: unknown) => String(tag ?? "").toLowerCase().includes("upgrade");

/** Quando o usuário mandou foto, os campos lidos entram como padrão nos dados do item. */
function applyPhotoFallback(args: Json) {
  args["modelo"] = str(args["modelo"]) ?? str(args["foto_modelo"]);
  args["cor"] = str(args["cor"]) ?? str(args["foto_cor"]);
  args["armazenamento"] = str(args["armazenamento"]) ?? str(args["foto_armazenamento"]);
  args["numero_serie"] = str(args["numero_serie"]) ?? str(args["foto_serie"]);
  args["estado"] = str(args["estado"]) ?? str(args["foto_estado"]);
}

/** Dados do aparelho recebido na troca, sempre vindos da leitura da foto enviada no chat. */
function tradeFromArgs(args: Json) {
  const modelo = str(args["foto_modelo"]);
  if (!modelo)
    throw new Error(
      "UPGRADE: para concluir essa venda preciso da foto do aparelho recebido na troca — mande a foto aqui no chat (tela de Ajustes > Sobre).",
    );
  const custo = num(args["troca_valor_custo"]);
  const venda = num(args["troca_valor_venda"]);
  if (custo == null || venda == null)
    throw new Error(
      "UPGRADE: me diga o valor de custo e o valor de venda do aparelho recebido na troca.",
    );
  return {
    modelo,
    cor: str(args["foto_cor"]),
    armazenamento: str(args["foto_armazenamento"]),
    serie: str(args["foto_serie"]),
    imei: str(args["foto_imei"]),
    custo,
    venda,
  };
}

async function findItem(ctx: ToolCtx, args: Json) {
  let q = ctx.supabase
    .from("inventory_items")
    .select("id, device_model, serial_number, status")
    .neq("status", "vendido")
    .limit(5);
  const id = str(args["item_id"]);
  const serie = str(args["numero_serie"]);
  const modelo = str(args["modelo"]);
  if (id) q = q.eq("id", id);
  else if (serie) q = q.ilike("serial_number", `%${serie}%`);
  else if (modelo) q = q.ilike("device_model", `%${modelo}%`).eq("status", "disponivel");
  else throw new Error("Informe o número de série ou o modelo do item.");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) throw new Error("Item não encontrado no estoque.");
  if (rows.length > 1)
    throw new Error(
      `Encontrei ${rows.length} itens desse modelo. Peça o número de série para identificar qual.`,
    );
  return rows[0]!;
}

export function toolsForRole(role: AppRole) {
  return ASSISTANT_TOOLS.filter((t) => t.roles.includes(role));
}
