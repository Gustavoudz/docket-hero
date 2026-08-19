import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border/30 bg-card p-8 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-primary" />
      <h1 className="mt-3 text-lg font-semibold">Acesso não permitido</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "Seu perfil não tem permissão para acessar esta área."}
      </p>
      <Button asChild variant="outline" className="mt-5">
        <Link to="/agenda">Voltar para a agenda</Link>
      </Button>
    </div>
  );
}
