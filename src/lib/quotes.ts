import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QuoteStatus = "enviado" | "convertido" | "sem_resposta";
export type QuoteKind = "simples" | "upgrade";

export type Quote = {
  id: string;
  seller_id: string;
  kind: QuoteKind;
  status: QuoteStatus;
  customer_name: string | null;
  customer_contact: string | null;
  inventory_item_id: string | null;
  product_model: string;
  product_color: string | null;
  product_storage: string | null;
  product_condition: string | null;
  product_price: number;
  product_battery_health: number | null;
  discount: number;
  notes: string | null;
  trade_model: string | null;
  trade_color: string | null;
  trade_storage: string | null;
  trade_condition: string | null;
  trade_value: number | null;
  trade_battery_health: number | null;
  deadline_at: string;
  created_at: string;
};

const COLUMNS =
  "id, seller_id, kind, status, customer_name, customer_contact, inventory_item_id, product_model, product_color, product_storage, product_condition, product_price, product_battery_health, discount, notes, trade_model, trade_color, trade_storage, trade_condition, trade_value, trade_battery_health, deadline_at, created_at";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  enviado: "Enviados",
  convertido: "Convertidos",
  sem_resposta: "Sem resposta",
};

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        ...r,
        product_price: Number(r.product_price),
        discount: Number(r.discount),
        trade_value: r.trade_value === null ? null : Number(r.trade_value),
      })) as Quote[];
    },
  });
}

/** Hoje + 2 dias úteis (pula sábado e domingo). */
export function businessDeadline(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "sexta-feira" se for nesta semana, senão "23/08". */
export function formatDeadline(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const diff = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (diff <= 6) {
    return date.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** Guarda o contato limpo: só números quando parecer telefone. */
export function normalizeContact(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8 && /^[\d\s()+-]+$/.test(value)) return digits;
  return value.startsWith("@") ? value : value;
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type MessageTone = "suave" | "agressiva";

export function buildQuoteMessage(quote: Quote, tone: MessageTone) {
  const greeting = quote.customer_name?.trim()
    ? `Oi, ${quote.customer_name.trim()}!`
    : "Oi!";
  const produto = [quote.product_model, quote.product_storage, quote.product_condition]
    .filter(Boolean)
    .join(" ");
  const valorFinal = money(Math.max(0, quote.product_price - quote.discount - (quote.kind === "upgrade" ? (quote.trade_value ?? 0) : 0)));
  const dataLimite = formatDeadline(quote.deadline_at);

  if (quote.kind === "upgrade") {
    const trocaBase = [quote.trade_model, quote.trade_storage].filter(Boolean).join(" ");
    const troca = quote.trade_condition
      ? `${trocaBase}, ${quote.trade_condition.toLowerCase()} estado`
      : trocaBase;
    const avaliado = money(quote.trade_value ?? 0);
    if (tone === "suave") {
      return `${greeting} Fizemos a avaliação do seu ${troca} — consegui deixar ${avaliado} na troca, valendo direto pro seu upgrade do ${produto}, que fecha em ${valorFinal}. Prefere passar aqui hoje à tarde ou amanhã de manhã pra já deixarmos tudo certinho?`;
    }
    return `${greeting} Já avaliei seu ${troca} — consegui deixar ${avaliado} na troca pro seu upgrade do ${produto}, fechando em ${valorFinal}. Esse valor eu consigo garantir até ${dataLimite} — quer que eu já separe um horário pra você passar aqui?`;
  }

  if (tone === "suave") {
    return `${greeting} O ${produto} está disponível por ${valorFinal}. Prefere passar aqui hoje à tarde ou amanhã de manhã pra conhecer o aparelho de pertinho?`;
  }
  return `${greeting} O ${produto} está disponível por ${valorFinal} — consigo segurar esse valor pra você até ${dataLimite}. Quer que eu já separe um horário pra você vir ver o aparelho?`;
}
