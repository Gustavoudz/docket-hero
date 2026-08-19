import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RecordType } from "@/lib/permissions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: RecordType) => void;
};

export function RecordTypePicker({ open, onOpenChange, onSelect }: Props) {
  const options: { type: RecordType; emoji: string; title: string; subtitle: string }[] = [
    {
      type: "agendamento",
      emoji: "📅",
      title: "Novo agendamento",
      subtitle: "Cliente ainda vai vir",
    },
    { type: "venda", emoji: "💳", title: "Nova venda", subtitle: "Cliente está na loja agora" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>O que você quer registrar?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {options.map((o) => (
            <button
              key={o.type}
              type="button"
              onClick={() => onSelect(o.type)}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-4 py-7 text-center transition-all hover:border-primary/60 hover:bg-primary/10 active:scale-[0.98]"
            >
              <span className="text-3xl">{o.emoji}</span>
              <span className="text-sm font-medium">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.subtitle}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
