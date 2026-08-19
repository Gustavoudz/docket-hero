import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Transcreve o áudio gravado no chat do assistente (sempre no servidor). */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { audio: string; format: string }) => {
    if (!input?.audio || typeof input.audio !== "string") throw new Error("Áudio inválido");
    return input;
  })
  .handler(async ({ data }): Promise<{ text: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível no momento");
    const base64 = data.audio.includes(",") ? data.audio.split(",")[1]! : data.audio;
    const format = ["wav", "mp3", "webm", "m4a", "ogg", "aac", "flac"].includes(data.format)
      ? data.format
      : "webm";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Transcreva o áudio em português do Brasil. Responda apenas com a transcrição literal, sem comentários.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio." },
              { type: "input_audio", input_audio: { data: base64, format } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas gravações seguidas. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) throw new Error("Não consegui transcrever o áudio. Tente gravar de novo.");

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Não entendi o áudio. Tente gravar de novo.");
    return { text };
  });
