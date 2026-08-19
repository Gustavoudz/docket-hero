import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.enum(["gerente", "atendente", "vendedora"]),
});

async function assertGerente(supabase: { rpc: (fn: "is_gerente") => Promise<{ data: unknown; error: unknown }> }) {
  const { data, error } = await supabase.rpc("is_gerente");
  if (error || data !== true) throw new Error("Apenas o gerente pode gerenciar colaboradores.");
}

export const createCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertGerente(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar colaborador.");
    const uid = created.user.id;
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, full_name: data.fullName, email: data.email });
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);
    return { id: uid };
  });

export const deleteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertGerente(context.supabase as never);
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
