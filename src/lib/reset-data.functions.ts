import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resetTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGerente, error: roleError } = await (
      context.supabase as unknown as { rpc: (fn: "is_gerente") => Promise<{ data: unknown; error: unknown }> }
    ).rpc("is_gerente");
    if (roleError || isGerente !== true) {
      throw new Error("Apenas o gerente pode resetar os dados de teste.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("reset_test_data");
    if (error) throw new Error(error.message);
    return data;
  });
