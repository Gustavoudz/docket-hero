import { createServerFn } from "@tanstack/react-start";
import type { ExtractedDevice } from "./inventory-vision.server";

export const extractDeviceFromPhoto = createServerFn({ method: "POST" })
  .inputValidator((input: { images: string[]; condition: "lacrado" | "seminovo"; models: string[] }) => {
    const images = (input?.images ?? []).filter((i) => typeof i === "string" && i.startsWith("data:image/"));
    if (images.length === 0) throw new Error("Imagem inválida");
    if (images.length > 5) throw new Error("Envie no máximo 5 fotos");
    input.images = images;
    return input;
  })
  .handler(async ({ data }): Promise<ExtractedDevice> => {
    const { extractDevice } = await import("./inventory-vision.server");
    return extractDevice(data);
  });
