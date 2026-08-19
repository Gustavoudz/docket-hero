import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MASTER_PASSWORD = "legado";

export function MasterPasswordDialog({
  open,
  onOpenChange,
  title = "Confirmar exclusão",
  description,
  confirmLabel = "Excluir",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function close(next: boolean) {
    if (!next) {
      setPassword("");
      setError(false);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {description ?? "Essa ação não pode ser desfeita."} Digite a senha mestre para continuar.
        </p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (password === MASTER_PASSWORD) {
              setError(false);
              onConfirm();
            } else {
              setError(true);
            }
          }}
        >
          <Label htmlFor="master-password">Senha mestre</Label>
          <Input
            id="master-password"
            type="password"
            autoComplete="off"
            maxLength={64}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
          />
          {error && <p className="text-sm text-destructive">Senha incorreta.</p>}
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={!password || pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}