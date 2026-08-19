import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AssistantMessage = { role: "user" | "assistant"; content: string };

export type PendingAction = { name: string; args: Record<string, unknown>; summary: string };

export type AssistantReply = { reply: string; pending?: PendingAction | null };

export const assistantChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { messages: AssistantMessage[]; confirm?: PendingAction | null }) => input,
  )
  .handler(async ({ data, context }): Promise<AssistantReply> => {
    const { runAssistant } = await import("./assistant.server");
    return runAssistant({
      supabase: context.supabase,
      userId: context.userId,
      messages: (data.messages ?? []).slice(-24),
      confirm: data.confirm ?? null,
    });
  });
