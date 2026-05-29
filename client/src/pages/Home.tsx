import { useAuth } from "@/_core/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Calendar,
  History,
  MapPin,
  MessageSquare,
  Package,
  Route,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";

function normalizeAuthError(errorMessage: string) {
  const message = errorMessage.toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Sem conexão com o servidor agora. Tente novamente em alguns segundos.";
  }

  if (message.includes("503") || message.includes("unavailable")) {
    return "Serviço temporariamente indisponível. Tente novamente em instantes.";
  }

  return errorMessage;
}

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const routesQuery = trpc.routes.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const routeSummary = useMemo(() => {
    const routes = routesQuery.data ?? [];
    const totalRoutes = routes.length;
    const completedRoutes = routes.filter((route: any) => route.status === "completed").length;
    const totalDistance = routes.reduce(
      (acc: number, route: any) => acc + Number(route.totalDistance || 0),
      0
    );

    return {
      totalRoutes,
      completedRoutes,
      totalDistance,
      efficiency:
        totalRoutes > 0 ? Math.round((completedRoutes / totalRoutes) * 100) : 0,
    };
  }, [routesQuery.data]);

  const afterAuthSuccess = async () => {
    setAuthError(null);
    setPassword("");
    await utils.auth.me.invalidate();
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: afterAuthSuccess,
    onError: (error) => setAuthError(normalizeAuthError(error.message)),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: afterAuthSuccess,
    onError: (error) => setAuthError(normalizeAuthError(error.message)),
  });
  const authPending = loginMutation.isPending || registerMutation.isPending;

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);

    if (authMode === "register") {
      await registerMutation.mutateAsync({ name, email, password });
      return;
    }

    await loginMutation.mutateAsync({ email, password });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
        <div className="pointer-events-none absolute -left-20 top-8 h-56 w-56 rounded-full bg-emerald-300/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-10 h-56 w-56 rounded-full bg-sky-300/30 blur-3xl" />

        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-border/85 bg-white">
            <CardHeader className="space-y-5">
              <BrandLogo
                variant="full"
                className="h-28 w-full max-w-[320px] justify-start"
              />
              <div className="space-y-2">
                <CardDescription className="text-base text-slate-600">
                  Roteirização inteligente para reduzir tempo, combustível e retrabalho.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-secondary/55 p-4">
                <p className="mb-1 text-sm font-semibold">Otimização Inteligente</p>
                <p className="text-sm text-muted-foreground">Rotas mais rápidas com base em dados reais.</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-secondary/55 p-4">
                <p className="mb-1 text-sm font-semibold">Economia de Combustível</p>
                <p className="text-sm text-muted-foreground">Menos quilômetros improdutivos no dia a dia.</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-secondary/55 p-4">
                <p className="mb-1 text-sm font-semibold">Mais Tempo para Entregar</p>
                <p className="text-sm text-muted-foreground">Execução mais previsível e com menos desvios.</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-secondary/55 p-4">
                <p className="mb-1 text-sm font-semibold">Analytics Operacional</p>
                <p className="text-sm text-muted-foreground">Indicadores claros para evolução contínua.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/85 bg-white">
            <CardHeader>
              <CardTitle>{authMode === "login" ? "Entrar" : "Criar conta"}</CardTitle>
              <CardDescription>Use seu e-mail e senha para acessar o painel.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                {authMode === "register" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      disabled={authPending}
                      required
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={authPending}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={authPending}
                    minLength={8}
                    required
                  />
                </div>

                {authError && <p className="text-sm text-red-600">{authError}</p>}

                <Button type="submit" size="lg" disabled={authPending} className="w-full">
                  {authPending
                    ? "Aguarde..."
                    : authMode === "login"
                    ? "Entrar"
                    : "Criar conta"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={authPending}
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode(authMode === "login" ? "register" : "login");
                  }}
                >
                  {authMode === "login" ? "Criar uma nova conta" : "Já tenho conta"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              Olá, {user?.name || "Motorista"} 👋
            </h1>
            <p className="mt-2 text-slate-600">
              Aqui está o resumo das suas rotas e entregas de hoje.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
            Plataforma ativa e sincronizada
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="border-emerald-200 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
            <CardHeader>
              <CardTitle className="text-lg text-white">Resumo Operacional</CardTitle>
              <CardDescription className="text-emerald-50/90">
                Indicadores principais da sua operação.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {routesQuery.isLoading ? (
                <>
                  <Skeleton className="h-16 bg-white/25" />
                  <Skeleton className="h-16 bg-white/25" />
                  <Skeleton className="h-16 bg-white/25" />
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-100">Distância Total</p>
                    <p className="text-3xl font-bold">{routeSummary.totalDistance.toFixed(1)} km</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-100">Rotas</p>
                    <p className="text-3xl font-bold">{routeSummary.totalRoutes}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-100">Eficiência</p>
                    <p className="text-3xl font-bold">{routeSummary.efficiency}%</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <Card className="bg-white">
              <CardContent className="flex items-center gap-3 pt-6">
                <Route className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Concluídas</p>
                  <p className="text-2xl font-bold">{routeSummary.completedRoutes}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="flex items-center gap-3 pt-6">
                <Package className="h-8 w-8 text-sky-600" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Pacotes</p>
                  <p className="text-2xl font-bold">{Math.max(routeSummary.totalRoutes * 3, 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="flex items-center gap-3 pt-6">
                <TrendingUp className="h-8 w-8 text-emerald-600" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Performance</p>
                  <p className="text-2xl font-bold">Alta</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/routes/new">
            <Card className="group cursor-pointer border-border/80 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Criar Rota</CardTitle>
                  <MapPin className="h-5 w-5 text-primary transition-transform duration-200 group-hover:scale-110" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Monte uma nova rota com importação ou cadastro manual.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/analytics">
            <Card className="group cursor-pointer border-border/80 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Analytics</CardTitle>
                  <BarChart3 className="h-5 w-5 text-sky-600 transition-transform duration-200 group-hover:scale-110" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Acompanhe métricas e tendências de execução.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/chat">
            <Card className="group cursor-pointer border-border/80 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Chat IA</CardTitle>
                  <MessageSquare className="h-5 w-5 text-primary transition-transform duration-200 group-hover:scale-110" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Tire dúvidas e receba recomendações inteligentes.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/schedules">
            <Card className="group cursor-pointer border-border/80 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Agendamentos</CardTitle>
                  <Calendar className="h-5 w-5 text-emerald-600 transition-transform duration-200 group-hover:scale-110" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Automatize rotas recorrentes com horário definido.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/history">
            <Card className="group cursor-pointer border-border/80 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Histórico</CardTitle>
                  <History className="h-5 w-5 text-slate-600 transition-transform duration-200 group-hover:scale-110" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Revise execuções anteriores e resultados.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/routes">
            <Card className="group cursor-pointer border-border/80 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Minhas Rotas</CardTitle>
                  <Zap className="h-5 w-5 text-primary transition-transform duration-200 group-hover:scale-110" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Gerencie, inicie e acompanhe suas rotas salvas.</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
