/**
 * Extração de dados do aparelho por foto.
 * Mesma leitura usada no Cadastro de estoque por foto e no chat do assistente.
 */
export type ExtractedDevice = {
  device_model: string | null;
  serial_number: string | null;
  imei: string | null;
  color: string | null;
  storage: string | null;
};

export async function extractDevice(data: {
  images: string[];
  condition: "lacrado" | "seminovo";
  models: string[];
}): Promise<ExtractedDevice> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA indisponível no momento");

  const seminovo = data.condition === "seminovo";
  const context = seminovo
    ? "As fotos são da tela de Ajustes (Geral > Sobre) de um iPhone/MacBook seminovo. Elas podem ser partes diferentes da mesma tela (role para baixo): combine as informações de todas as fotos em um único resultado."
    : "A(s) foto(s) são da etiqueta da caixa de um aparelho Apple lacrado.";

  const list = data.models.slice(0, 200).join(" | ");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            `${context} Extraia SOMENTE o que estiver claramente legível na imagem. ` +
            `Nunca invente, adivinhe ou complete dados: se um campo não estiver legível, retorne null. ` +
            (seminovo
              ? `Extraia apenas: nome do modelo, número de série, capacidade (armazenamento) e IMEI. Retorne color sempre null. `
              : "") +
            `Para o modelo, escolha exatamente um item desta lista quando houver correspondência clara, senão null. Lista: ${list}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: seminovo
                ? "Leia modelo, número de série, IMEI e capacidade de armazenamento."
                : "Leia modelo, número de série, IMEI, cor e capacidade de armazenamento.",
            },
            ...data.images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "preencher_item",
            description: "Retorna os dados lidos na imagem",
            parameters: {
              type: "object",
              properties: {
                device_model: { type: ["string", "null"] },
                serial_number: { type: ["string", "null"] },
                imei: { type: ["string", "null"] },
                color: {
                  type: ["string", "null"],
                  description:
                    "Cor do aparelho, em português (ex: Meia-noite, Estelar, Preto-espacial)",
                },
                storage: {
                  type: ["string", "null"],
                  description: "Capacidade de armazenamento, ex: 128GB, 256GB, 1TB",
                },
              },
              required: ["device_model", "serial_number", "imei", "color", "storage"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "preencher_item" } },
    }),
  });

  if (res.status === 429) throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
  if (!res.ok) throw new Error("Não foi possível ler a foto. Preencha manualmente.");

  const json = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { device_model: null, serial_number: null, imei: null, color: null, storage: null };
  const parsed = JSON.parse(args) as ExtractedDevice;
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    device_model: clean(parsed.device_model),
    serial_number: clean(parsed.serial_number),
    imei: clean(parsed.imei),
    color: seminovo ? null : clean(parsed.color),
    storage: clean(parsed.storage),
  };
}
