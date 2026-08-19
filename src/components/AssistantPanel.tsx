import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ImagePlus, Loader2, Mic, Send, Sparkles, Square, X } from "lucide-react";
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
import { compressImageFiles } from "@/lib/image-compress";
import { transcribeAudio } from "@/lib/assistant-audio.functions";
import {
  assistantChat,
  type AssistantMessage,
  type AssistantReply,
  type PendingAction,
  type PhotoInput,
} from "@/lib/assistant.functions";

const GREETING =
  "Oi! Sou o assistente da loja. Posso consultar agenda, vendas, estoque, comissões e financeiro, além de criar agendamentos, vendas e itens de estoque — sempre pedindo sua confirmação antes de agir. Você também pode mandar foto (caixa ou tela de Ajustes) e áudio aqui no chat.";

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoCondition, setPhotoCondition] = useState<"lacrado" | "seminovo">("seminovo");
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chat = useServerFn(assistantChat);
  const transcribe = useServerFn(transcribeAudio);
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = useMutation({
    mutationFn: async (payload: {
      history: AssistantMessage[];
      confirm?: PendingAction | null;
      photo?: PhotoInput | null;
    }): Promise<AssistantReply> =>
      (await chat({
        data: {
          messages: payload.history,
          confirm: payload.confirm ?? null,
          photo: payload.photo ?? null,
        },
      })) as AssistantReply,
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

  function sendText(value: string, photo?: PhotoInput | null) {
    const label = photo
      ? `${value}${value ? "\n" : ""}[foto anexada · ${photo.condition}]`
      : value;
    const history: AssistantMessage[] = [...messages, { role: "user", content: label }];
    setMessages(history);
    setText("");
    setPending(null);
    setPhotos([]);
    send.mutate({ history, photo: photo ?? null });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (send.isPending || preparing) return;
    if (!value && photos.length === 0) return;
    sendText(
      value || "Segue a foto do aparelho.",
      photos.length > 0 ? { images: photos, condition: photoCondition } : null,
    );
  }

  async function pickPhotos(files: File[]) {
    if (files.length === 0) return;
    setPreparing(true);
    try {
      const images = await compressImageFiles(files.slice(0, 5));
      setPhotos(images);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Não consegui ler essa foto." }]);
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const format = (recorder.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        setPreparing(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("falha ao ler o áudio"));
            reader.readAsDataURL(blob);
          });
          const res = (await transcribe({ data: { audio: base64, format } })) as { text: string };
          setPreparing(false);
          sendText(res.text, photos.length > 0 ? { images: photos, condition: photoCondition } : null);
        } catch (e) {
          setPreparing(false);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: e instanceof Error ? e.message : "Não consegui transcrever o áudio.",
            },
          ]);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Preciso da permissão do microfone para gravar." },
      ]);
    }
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

        {(photos.length > 0 || preparing) && (
          <div className="flex items-center gap-2 border-t border-border/20 px-4 py-2 text-xs">
            {preparing ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando…
              </span>
            ) : (
              <>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                  {photos.length} foto(s)
                </span>
                {(["seminovo", "lacrado"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPhotoCondition(c)}
                    className={cn(
                      "rounded-full px-2 py-0.5 ring-1 ring-border/40",
                      photoCondition === c
                        ? "bg-primary/85 text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {c === "seminovo" ? "Seminovo" : "Lacrado"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPhotos([])}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  Remover
                </button>
              </>
            )}
          </div>
        )}

        <form onSubmit={submit} className="flex gap-2 border-t border-border/20 px-4 py-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => pickPhotos(Array.from(e.target.files ?? []))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Anexar foto"
            disabled={send.isPending || preparing}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={recording ? "destructive" : "ghost"}
            size="icon"
            aria-label={recording ? "Parar gravação" : "Gravar áudio"}
            disabled={send.isPending || preparing}
            onClick={toggleRecording}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Peça alguma coisa…"
            disabled={send.isPending || recording}
          />
          <Button
            type="submit"
            size="icon"
            disabled={send.isPending || preparing || (!text.trim() && photos.length === 0)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
