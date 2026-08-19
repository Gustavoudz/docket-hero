import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Visualizador de PDF dentro do app (evita bloqueio de nova aba pelo navegador). */
export function PdfViewerDialog({
  open,
  onOpenChange,
  title,
  url,
  fileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
  fileName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <iframe
            src={url}
            title={title}
            className="h-[70vh] w-full rounded-lg border border-border/60 bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={url} download={fileName}>
                <Download className="mr-1.5 h-4 w-4" /> Baixar PDF
              </a>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                Abrir em nova aba
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
