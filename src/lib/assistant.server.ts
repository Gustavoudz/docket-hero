import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/hooks/useAuth";
import { toolsForRole, todaySP, type ToolCtx } from "./assistant-tools.server";
import type {
  ArgValue,
  AssistantMessage,
  AssistantReply,
  PendingAction,
  PhotoInput,
} from "./assistant.functions";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

async function resolveRole(supabase: SupabaseClient<Database>, userId: string): Promise<AppRole | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = (data ?? []).map((r) => r.role as AppRole);
  if (list.length === 0) return null;
  return list.includes("gerente") ? "gerente" : list[0]!;
}

function systemPrompt(role: AppRole) {
  return [
    "Você é o assistente interno da Legado Phones, uma loja de iPhones e MacBooks seminovos.",
    `Hoje é ${todaySP()} (fuso America/São_Paulo). O usuário logado tem o perfil "${role}".`,
    "Responda sempre em português do Brasil, de forma curta, direta e objetiva.",
    "Use as ferramentas disponíveis para consultar dados reais — nunca invente números, nomes, valores ou datas.",
    "Consultas podem ser feitas direto. Ações que criam, alteram ou cancelam algo passam por uma confirmação automática do sistema: apenas chame a ferramenta e o sistema mostra o resumo e pede o 'Confirma?'.",
    "Se faltar alguma informação obrigatória para a ação, pergunte antes de chamar a ferramenta. Nunca preencha um dado que o usuário não disse.",
    "O usuário pode enviar fotos no próprio chat: quando isso acontece, os dados lidos da foto chegam para você em uma mensagem do sistema. Use esses dados para concluir vendas com tag Upgrade (cadastro do aparelho da troca) e para cadastrar itens de estoque por foto. Se a ação precisar de foto e nenhuma foi enviada, peça a foto.",
    "Você não altera Configurações, Segurança nem usuários do sistema — se pedirem isso, explique que essas mudanças são feitas nas telas de Configurações.",
    "Se o usuário pedir algo fora do que o perfil dele pode fazer, explique que ele não tem permissão para essa ação.",
  ].join(" ");
}

export async function runAssistant(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  messages: AssistantMessage[];
  confirm: PendingAction | null;
  photo?: PhotoInput | null;
}): Promise<AssistantReply> {
  const role = await resolveRole(input.supabase, input.userId);
  if (!role) return { reply: "Seu usuário ainda não tem um perfil de acesso definido.", pending: null };

  const tools = toolsForRole(role);
  const ctx: ToolCtx = { supabase: input.supabase, userId: input.userId, role };

  // Foto enviada no chat: usa exatamente a mesma extração das telas de Estoque/Troca.
  let photoFields: Record<string, ArgValue> = {};
  let photoNote: string | null = null;
  if (input.photo && (input.photo.images ?? []).length > 0) {
    try {
      const [{ extractDevice }, { data: models }] = await Promise.all([
        import("./inventory-vision.server"),
        input.supabase.from("device_models").select("name").eq("active", true),
      ]);
      const read = await extractDevice({
        images: input.photo.images.slice(0, 5),
        condition: input.photo.condition,
        models: (models ?? []).map((m) => m.name as string),
      });
      photoFields = {
        foto_modelo: read.device_model,
        foto_cor: read.color,
        foto_armazenamento: read.storage,
        foto_serie: read.serial_number,
        foto_imei: read.imei,
        foto_estado: input.photo.condition,
      };
      photoNote =
        `Dados lidos da foto enviada pelo usuário (estado: ${input.photo.condition}): ` +
        `modelo=${read.device_model ?? "não legível"}, cor=${read.color ?? "não legível"}, ` +
        `armazenamento=${read.storage ?? "não legível"}, série=${read.serial_number ?? "não legível"}, ` +
        `IMEI=${read.imei ?? "não legível"}. Use exatamente esses dados, nunca invente os que faltam.`;
    } catch (e) {
      return {
        reply: e instanceof Error ? e.message : "Não consegui ler a foto. Tente de novo.",
        pending: null,
      };
    }
  }

  // Execução após o "sim" do usuário.
  if (input.confirm) {
    const tool = tools.find((t) => t.name === input.confirm!.name && t.write);
    if (!tool) return { reply: "Essa ação não está disponível para o seu perfil.", pending: null };
    try {
      return { reply: await tool.run(input.confirm.args, ctx), pending: null };
    } catch (e) {
      return {
        reply: `Não consegui concluir: ${e instanceof Error ? e.message : "erro inesperado"}`,
        pending: null,
      };
    }
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { reply: "O assistente está indisponível no momento.", pending: null };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(role) },
    ...(photoNote ? [{ role: "system" as const, content: photoNote }] : []),
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolSpec = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let step = 0; step < 5; step++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools: toolSpec }),
    });
    if (res.status === 429)
      return { reply: "Muitas mensagens seguidas. Tente novamente em instantes.", pending: null };
    if (res.status === 402) return { reply: "Os créditos de IA do workspace acabaram.", pending: null };
    if (!res.ok) return { reply: "Não consegui falar com a IA agora. Tente de novo.", pending: null };

    const json = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: ChatMessage["tool_calls"] } }[];
    };
    const msg = json.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (calls.length === 0) return { reply: msg?.content?.trim() || "Não entendi, pode repetir?", pending: null };

    // Ação de escrita: monta o resumo e devolve para confirmação.
    const writeCall = calls.find((c) => tools.find((t) => t.name === c.function.name)?.write);
    if (writeCall) {
      const tool = tools.find((t) => t.name === writeCall.function.name)!;
      let args: Record<string, ArgValue> = {};
      try {
        args = JSON.parse(writeCall.function.arguments || "{}");
      } catch {
        args = {};
      }
      args = { ...args, ...photoFields };
      try {
        const summary = tool.preview ? await tool.preview(args, ctx) : tool.description;
        return { reply: `${summary}\n\nConfirma?`, pending: { name: tool.name, args, summary } };
      } catch (e) {
        const message = e instanceof Error ? e.message : "erro inesperado";
        if (message.startsWith("UPGRADE:"))
          return { pending: null, reply: message.replace("UPGRADE:", "").trim() };
        return { reply: message, pending: null };
      }
    }

    messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.function.name);
      let out = "Ação não permitida para o seu perfil.";
      if (tool) {
        try {
          out = await tool.run(JSON.parse(call.function.arguments || "{}"), ctx);
        } catch (e) {
          out = `Erro: ${e instanceof Error ? e.message : "falha na consulta"}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: out });
    }
  }
  return { reply: "Não consegui finalizar esse pedido. Tente reformular.", pending: null };
}
