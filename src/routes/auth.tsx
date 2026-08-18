import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Agenda da Loja" },
      { name: "description", content: "Login da equipe para acessar os agendamentos da loja." },
      { property: "og:title", content: "Entrar — Agenda da Loja" },
      { property: "og:description", content: "Login da equipe para acessar os agendamentos da loja." },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres").max(72),
});

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/agenda", replace: true });
  }, [session, navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = credentials.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar. Confira e-mail e senha.");
      return;
    }
    navigate({ to: "/agenda", replace: true });
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("full_name") ?? "").trim();
    const parsed = credentials.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!name) {
      toast.error("Informe seu nome");
      return;
    }
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name, role: String(form.get("role") ?? "atendente") },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada. Confirme o e-mail para entrar.");
      return;
    }
    navigate({ to: "/agenda", replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col justify-center px-4 py-10">
      <div className="glass-strong mx-auto w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Agenda da Loja</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agendamentos de iPhones e MacBooks seminovos.
        </p>

        <Tabs defaultValue="login" className="mt-6">
          <TabsList className="glass grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="glass mt-3 space-y-4 rounded-xl p-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">E-mail</Label>
                <Input id="login-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Senha</Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Entrar
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="glass mt-3 space-y-4 rounded-xl p-4">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name">Nome</Label>
                <Input id="signup-name" name="full_name" required maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-email">E-mail</Label>
                <Input id="signup-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password">Senha</Label>
                <Input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-role">Perfil</Label>
                <select
                  id="signup-role"
                  name="role"
                  defaultValue="atendente"
                  className="h-9 w-full rounded-md border border-input bg-input/40 px-3 text-sm text-foreground"
                >
                  <option value="atendente">Atendente</option>
                  <option value="gerente">Gerente</option>
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Criar conta
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}