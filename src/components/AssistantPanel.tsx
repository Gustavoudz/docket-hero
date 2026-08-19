import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  assistantChat,
  type AssistantMessage,
  type PendingAction,
} from "@/lib/assistant.functions";

const GREETING =
  "Oi! Sou o assistente da loja. Posso consultar agenda, vendas, estoque, comissões e financeiro, além de criar agendamentos, vendas e itens de estoque — sempre pedindo sua confirmação antes de agir.";

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const chat = useServerFn(assistantChat);
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = useMutation({
    mutationFn: async (payload: { history: AssistantMessage[]; confirm?: PendingAction | null }) =>
      chat({ data: { messages: payload.history, confirm: payload.confirm ?? null } }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setPending(res.pending ?? null);
      if (!res.pending) {
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
        queryClient.invalidateQueries({ queryKey: ["commissions"] });
      }
    },
    onError: (e: Error) =>
      setMessages((m) => [...m, { role: "assistant", content: e.message || "Falha na conexão." }]),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || send.isPending) return;
    const history: AssistantMessage[] = [...messages, { role: "user", content: value }];
    setMessages(history);
    setText("");
    setPending(null);
    send.mutate({ history });
  }

  function confirm() {
    if (!pending) return;
    const history: AssistantMessage[] = [...messages, { role: "user", content: "Sim, confirmo." }];
    setMessages(history);
    const action = pending;
    setPending(null);
    send.mutate({ history, confirm: action });
  }

  function cancel() {
    setPending(null);
    setMessages((m) => [
      ...m,
      { role: "user", content: "Cancelar" },
      { role: "assistant", content: "Tudo bem, não fiz nada." },
    ]);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir assistente">
          <Sparkles className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="glass-strong flex w-full flex-col border-l border-border/20 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/20 px-4 py-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" /> Assistente
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-sm bg-primary/85 text-primary-foreground"
                    : "rounded-bl-sm bg-foreground/5 text-foreground ring-1 ring-border/30",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-foreground/5 px-3.5 py-2.5 text-sm text-muted-foreground ring-1 ring-border/30">
                Pensando…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {pending && !send.isPending && (
          <div className="flex gap-2 border-t border-border/20 px-4 py-3">
            <Button className="flex-1" onClick={confirm}>
              Sim, confirmar
            </Button>
            <Button variant="outline" className="flex-1" onClick={cancel}>
              <X className="mr-1 h-4 w-4" /> Cancelar
            </Button>
          </div>
        )}

        <form onSubmit={submit} className="flex gap-2 border-t border-border/20 px-4 py-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Peça alguma coisa…"
            disabled={send.isPending}
          />
          <Button type="submit" size="icon" disabled={send.isPending || !text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
