import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, Calendar, Package, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type Notification = {
  id: string;
  kind: string;
  message: string;
  created_at: string;
  read_by: string[];
};

function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, message, created_at, read_by")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as { message?: string };
          if (row.message) toast(row.message);
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const unread = data.filter((n) => !(n.read_by ?? []).includes(user?.id ?? ""));

  async function markAllRead() {
    if (!user) return;
    await Promise.all(
      unread.map((n) =>
        supabase
          .from("notifications")
          .update({ read_by: [...(n.read_by ?? []), user.id] })
          .eq("id", n.id),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && markAllRead()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nenhuma notificação ainda
          </div>
        )}
        {data.map((n) => (
          <div key={n.id} className="border-b px-2 py-2 text-sm last:border-b-0">
            <p className="leading-snug">{n.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(n.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SideMenu() {
  const [open, setOpen] = useState(false);
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });

  const menuItems = [
    { title: "Agenda", url: "/agenda", icon: Calendar, active: currentPath === "/agenda" },
    { title: "Estoque", url: "/estoque", icon: Package, maintenance: true },
    { title: "Controle de Vendas", url: "/vendas", icon: Receipt, maintenance: true },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="glass-strong w-4/5 border-r border-border/20 sm:max-w-xs">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="font-script text-2xl text-primary">Legado Phones</SheetTitle>
          <p className="text-xs text-muted-foreground">Sistema interno</p>
        </SheetHeader>
        <nav className="flex flex-col gap-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            if (item.maintenance) {
              return (
                <button
                  key={item.title}
                  onClick={() => {
                    toast.info("Em Manutenção", {
                      description: `${item.title} está temporariamente indisponível.`,
                    });
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    {item.title}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Em Manutenção
                  </Badge>
                </button>
              );
            }
            return (
              <SheetClose asChild key={item.title}>
                <Link
                  to={item.url}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                    item.active
                      ? "bg-primary/15 text-primary"
                      : "text-foreground hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.title}
                </Link>
              </SheetClose>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, fullName, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="glass-strong sticky top-0 z-20 border-x-0 border-t-0">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Link to="/agenda" className="text-base font-semibold tracking-tight">
            Agenda da Loja
          </Link>
          {role === "gerente" && (
            <Link
              to="/painel"
              className="ml-2 text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: "ml-2 text-sm font-medium text-foreground" }}
            >
              Painel
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1">
            {role === "gerente" && <NotificationBell />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="max-w-36 truncate">
                  {fullName || "Conta"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {role === "gerente" ? "Gerente" : "Atendente"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4 pb-24">{children}</main>
    </div>
  );
}