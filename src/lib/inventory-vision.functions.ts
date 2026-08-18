import { createServerFn } from "@tanstack/react-start";

type Extracted = {
  device_model: string | null;
  serial_number: string | null;
  imei: string | null;
};

export const extractDeviceFromPhoto = createServerFn({ method: "POST" })
  .inputValidator((input: { image: string; condition: "lacrado" | "seminovo"; models: string[] }) => {
    if (!input?.image?.startsWith("data:image/")) throw new Error("Imagem inválida");
    return input;
  })
  .handler(async ({ data }): Promise<Extracted> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível no momento");

    const context =
      data.condition === "lacrado"
        ? "A foto é da etiqueta da caixa de um aparelho Apple lacrado."
        : "A foto é da tela de Ajustes (Sobre) de um iPhone/MacBook seminovo.";

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
              `Para o modelo, escolha exatamente um item desta lista quando houver correspondência clara, senão null. Lista: ${list}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Leia modelo, número de série e IMEI." },
              { type: "image_url", image_url: { url: data.image } },
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
                },
                required: ["device_model", "serial_number", "imei"],
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
    if (!args) return { device_model: null, serial_number: null, imei: null };
    const parsed = JSON.parse(args) as Extracted;
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      device_model: clean(parsed.device_model),
      serial_number: clean(parsed.serial_number),
      imei: clean(parsed.imei),
    };
  });
