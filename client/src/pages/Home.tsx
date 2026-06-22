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
import { getLoginUrl } from "@/const";
import { saveAuthSessionToken } from "@/lib/authSession";
import { readDeliveryProgress, readLastRouteProgress } from "@/lib/routeProgress";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Calendar,
  Download,
  History,
  MapPin,
  MessageSquare,
  Package,
  Play,
  Route,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";

const REMEMBERED_EMAIL_KEY = "econorotas:remembered-email";
const SHOW_ANDROID_DOWNLOAD_LINK =
  import.meta.env.VITE_ANDROID_DISTRIBUTION_CHANNEL !== "store";
const GOOGLE_LOGIN_CONFIGURED =
  import.meta.env.VITE_ENABLE_DEV_LOGIN !== "true" &&
  ((Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL?.trim()) &&
    Boolean(import.meta.env.VITE_APP_ID?.trim())) ||
    Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()));

type AuthSuccessPayload = {
  sessionToken?: string | null;
} | null | undefined;

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
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [email, setEmail] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ""
  );
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [lastRouteProgress, setLastRouteProgress] = useState(() =>
    typeof window === "undefined" ? null : readLastRouteProgress()
  );

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
  const resumeRoute = useMemo(() => {
    if (!lastRouteProgress) return null;

    const route = (routesQuery.data ?? []).find(
      (item: any) => item.id === lastRouteProgress.routeId
    );
    if (!route || route.status === "completed" || route.status === "cancelled") {
      return null;
    }

    const progress = readDeliveryProgress(route.id);
    const handledCount = new Set([
      ...(progress?.delivered ?? []),
      ...(progress?.failed ?? []),
    ]).size;

    return {
      id: route.id,
      name: route.name || lastRouteProgress.routeName || "Ultima rota",
      handledCount,
      deliveredCount: progress?.delivered?.length ?? 0,
      failedCount: progress?.failed?.length ?? 0,
    };
  }, [lastRouteProgress, routesQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshLastRoute = () => setLastRouteProgress(readLastRouteProgress());
    refreshLastRoute();
    window.addEventListener("focus", refreshLastRoute);
    document.addEventListener("visibilitychange", refreshLastRoute);

    return () => {
      window.removeEventListener("focus", refreshLastRoute);
      document.removeEventListener("visibilitychange", refreshLastRoute);
    };
  }, [isAuthenticated]);

  const afterAuthSuccess = async (data?: AuthSuccessPayload) => {
    setAuthError(null);
    setPassword("");
    saveAuthSessionToken(data?.sessionToken);
    if (rememberDevice && typeof window !== "undefined") {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
    } else if (typeof window !== "undefined") {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
    await utils.auth.me.invalidate();
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => afterAuthSuccess(data),
    onError: (error) => setAuthError(normalizeAuthError(error.message)),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => afterAuthSuccess(data),
    onError: (error) => setAuthError(normalizeAuthError(error.message)),
  });
  const resetPasswordMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: (data) => setResetMessage(data.message),
    onError: (error) => setAuthError(normalizeAuthError(error.message)),
  });
  const authPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    resetPasswordMutation.isPending;

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);

    try {
      if (authMode === "register") {
        await registerMutation.mutateAsync({
          name,
          email,
          password,
          phone,
          companyName,
          city,
          state: stateUf,
          vehicleType,
          acceptTerms,
        });
        return;
      }

      await loginMutation.mutateAsync({ email, password });
    } catch {
      // The mutation onError handler already shows the user-facing message.
    }
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
              <CardDescription>
                {authMode === "login"
                  ? "Use e-mail, senha ou conta Google para acessar."
                  : "Informe os dados básicos para liberar seu acesso operacional."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {GOOGLE_LOGIN_CONFIGURED ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mb-4 w-full gap-3 border-slate-300 bg-white font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                  onClick={() => {
                    window.location.href = getLoginUrl();
                  }}
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
                    />
                  </svg>
                  Entrar com Google
                </Button>
              ) : (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Login Google aguardando configuracao OAuth no Vercel.
                </div>
              )}
              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                {authMode === "register" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="name">Nome completo</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        disabled={authPending}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone/WhatsApp</Label>
                      <Input
                        id="phone"
                        name="phone"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        disabled={authPending}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleType">Veículo</Label>
                      <Input
                        id="vehicleType"
                        name="vehicleType"
                        placeholder="Moto, carro, van..."
                        value={vehicleType}
                        onChange={(event) => setVehicleType(event.target.value)}
                        disabled={authPending}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        name="city"
                        autoComplete="address-level2"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        disabled={authPending}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stateUf">Estado</Label>
                      <Input
                        id="stateUf"
                        name="stateUf"
                        autoComplete="address-level1"
                        value={stateUf}
                        onChange={(event) => setStateUf(event.target.value)}
                        disabled={authPending}
                        required
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="companyName">Empresa/Operação</Label>
                      <Input
                        id="companyName"
                        name="companyName"
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        disabled={authPending}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
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
                    name="password"
                    type="password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={authPending}
                    minLength={8}
                    required
                  />
                </div>

                {authMode === "login" && (
                  <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(event) => setRememberDevice(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-emerald-600"
                    />
                    <span>
                      Manter conectado neste aparelho. O EconoRota manterá sua
                      sessão ativa e o Safari/iCloud poderá preencher sua senha.
                    </span>
                  </label>
                )}

                {authMode === "login" && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    disabled={authPending || !email.trim()}
                    onClick={() => {
                      setAuthError(null);
                      setResetMessage(null);
                      resetPasswordMutation.mutate({ email });
                    }}
                  >
                    Esqueci minha senha
                  </Button>
                )}

                {authMode === "register" && (
                  <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(event) => setAcceptTerms(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-emerald-600"
                      required
                    />
                    <span>
                      Confirmo que os dados informados são corretos e aceito o uso operacional
                      do EconoRota para roteirização e suporte.
                    </span>
                  </label>
                )}

                {authError && <p className="text-sm text-red-600">{authError}</p>}
                {resetMessage && <p className="text-sm text-emerald-700">{resetMessage}</p>}

                <Button type="submit" size="lg" disabled={authPending} className="w-full">
                  {authPending
                    ? "Carregando..."
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

                {SHOW_ANDROID_DOWNLOAD_LINK && (
                  <Button asChild type="button" variant="outline" className="w-full gap-2">
                    <Link href="/baixar-aplicativo">
                      <Download className="h-4 w-4" />
                      Baixar aplicativo Android
                    </Link>
                  </Button>
                )}

                <nav
                  aria-label="Links publicos do EconoRota"
                  className="grid gap-2 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm sm:grid-cols-2"
                >
                  <Link className="font-medium text-emerald-700" href="/roteirizador-entregas">
                    Roteirizador de entregas
                  </Link>
                  <Link className="font-medium text-emerald-700" href="/roteirizador-shopee">
                    Roteirizador Shopee
                  </Link>
                  <Link className="font-medium text-orange-700" href="/spx-shopee">
                    SPX/Shopee completo
                  </Link>
                  <Link className="font-medium text-emerald-700" href="/roteirizador-imile">
                    Roteirizador iMile
                  </Link>
                  <Link className="font-medium text-emerald-700" href="/pwa-iphone">
                    PWA para iPhone
                  </Link>
                  <Link className="font-medium text-emerald-700" href="/privacidade">
                    Privacidade
                  </Link>
                  <Link className="font-medium text-emerald-700" href="/suporte">
                    Suporte
                  </Link>
                </nav>
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
          {resumeRoute && (
            <Card className="border-emerald-300 bg-white lg:col-span-2">
              <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">
                    Continuar ultima rota
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    {resumeRoute.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {resumeRoute.handledCount} parada(s) registradas:{" "}
                    {resumeRoute.deliveredCount} entregue(s),{" "}
                    {resumeRoute.failedCount} nao entregue(s).
                  </p>
                </div>
                <Button asChild size="lg" className="gap-2">
                  <Link href={`/routes/${resumeRoute.id}`}>
                    <Play className="h-4 w-4" />
                    Continuar rota
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

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
