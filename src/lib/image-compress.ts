/**
 * Comprime a foto no navegador antes de enviar para a IA.
 * Mantém resolução suficiente para leitura de série/IMEI.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.75;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a foto"));
    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  if (!file.type.startsWith("image/") || typeof document === "undefined") return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("imagem inválida"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && dataUrl.length < 900_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", QUALITY);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

export function compressImageFiles(files: File[]) {
  return Promise.all(files.map(compressImageFile));
}
