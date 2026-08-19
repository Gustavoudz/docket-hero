import { INVENTORY_STATUS_LABEL, type InventoryItem } from "@/lib/inventory";

function cell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function brDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/** Gera e baixa uma planilha CSV (abre no Excel) com os itens informados. */
export function exportInventoryCSV(
  items: InventoryItem[],
  costs: Record<string, number>,
  filename = "estoque",
) {
  const header = [
    "Modelo",
    "Cor",
    "Armazenamento",
    "Número de série",
    "IMEI",
    "Valor de custo",
    "Situação",
    "Data de entrada",
    "Data de venda",
  ];
  const rows = items.map((i) => [
    i.device_model,
    i.color ?? "",
    i.storage ?? "",
    i.serial_number ?? "",
    i.imei ?? "",
    costs[i.id] != null ? costs[i.id]!.toFixed(2).replace(".", ",") : "",
    INVENTORY_STATUS_LABEL[i.status],
    brDate(i.entered_at),
    brDate(i.sold_at),
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  downloadCSV(csv, filename);
}

export function exportRowsCSV(header: string[], rows: (string | number)[][], filename: string) {
  const csv = [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  downloadCSV(csv, filename);
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
