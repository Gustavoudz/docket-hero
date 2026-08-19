import type { AppRole } from "@/hooks/useAuth";

export type RecordType = "agendamento" | "venda";

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  agendamento: "Agendamento",
  venda: "Venda",
};

/** Tipos de registro que o perfil pode criar. */
export function allowedRecordTypes(role: AppRole | null): RecordType[] {
  if (role === "gerente") return ["agendamento", "venda"];
  if (role === "atendente") return ["venda"];
  if (role === "vendedora") return ["agendamento"];
  return [];
}

/** Regra de visibilidade de um registro para o perfil logado. */
export function canViewRecord(
  role: AppRole | null,
  record: { record_type?: RecordType | null; attendant_id: string },
  userId: string | undefined,
): boolean {
  if (role === "gerente") return true;
  const type = record.record_type ?? "agendamento";
  if (role === "atendente") return type === "venda";
  if (role === "vendedora") return type === "agendamento" && record.attendant_id === userId;
  return record.attendant_id === userId;
}
