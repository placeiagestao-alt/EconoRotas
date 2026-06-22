import { useAuth } from "@/_core/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import DashboardLayout from "@/components/DashboardLayout";
import { PwaInstallButton } from "@/components/PwaInstallButton";
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
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  Fuel,
  History,
  MapPin,
  MessageCircle,
  MessageSquare,
  Navigation,
  Package,
  Play,
  Route,
  ShieldCheck,
  TrendingUp,
  WandSparkles,
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

const trustItems = [
  { icon: ShieldCheck, label: "LGPD e privacidade" },
  { icon: MessageCircle, label: "Suporte WhatsApp" },
  { icon: FileCheck2, label: "Politica e termos" },
  { icon: CheckCircle2, label: "PWA oficial" },
];

const steps = [
  {
    icon: ClipboardList,
    title: "Cole as entregas",
    text: "Importe tabela Shopee/SPX, CSV ou cadastre paradas pelo celular.",
  },
  {
    icon: WandSparkles,
    title: "Otimize",
    text: "Escolha sequencia STOP, ordem da tabela ou rota inteligente.",
  },
  {
    icon: Navigation,
    title: "Entregue",
    text: "Abra no Maps ou Waze e acompanhe pacotes, paradas e status.",
  },
];

type AuthSuccessPayload = {
  sessionToken?: string | null;
} | null | undefined;

function normalizeAuthError(errorMessage: string) {
  const message = errorMessage.toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Sem conexao com o servidor agora. Tente novamente em alguns segundos.";
  }

  if (message.includes("503") || message.includes("unavailable")) {
    return "Servico temporariamente indisponivel. Tente novamente em instantes.";
  }

  return errorMessage;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
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
  );
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
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-16 w-52" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 rounded-2xl border border-border/85 bg-white/90 p-4 shadow-[0_10px_24px_rgb(15_23_42_/_7%)] dark:bg-card sm:flex-row sm:items-center sm:justify-between">
            <BrandLogo variant="full" className="h-16 w-56 justify-start" />
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {trustItems.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-2"
                >
                  <item.icon className="h-3.5 w-3.5 text-primary" />
                  {item.label}
                </span>
              ))}
            </div>
          </header>

          <main className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="space-y-5 rounded-2xl border border-border/85 bg-white p-5 shadow-[0_14px_36px_rgb(15_23_42_/_8%)] dark:bg-card sm:p-7">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  <ShieldCheck className="h-4 w-4" />
                  PWA oficial recomendado
                </div>
                <div className="space-y-3">
                  <h1 className="max-w-3xl text-[32px] font-extrabold leading-tight tracking-normal text-slate-950 dark:text-white">
                    Organize suas entregas em 1 toque.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                    Especialista em SPX/Shopee para seguir a sequencia STOP,
                    encaixar paradas sem STOP e otimizar quando voce quiser.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                <PwaInstallButton
                  className="h-12 gap-2 px-5 text-base font-bold"
                  label="Instalar pelo navegador"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Nao precisa baixar APK. Funciona como app no celular e evita
                  alertas de instalacao externa.
                </p>
              </div>

              {SHOW_ANDROID_DOWNLOAD_LINK && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  APK disponivel apenas para testes Android.{" "}
                  <Link className="font-semibold text-primary" href="/baixar-aplicativo">
                    Ver opcoes de instalacao
                  </Link>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-secondary/45 p-4">
                  <Fuel className="mb-3 h-6 w-6 text-primary" />
                  <p className="text-2xl font-extrabold text-slate-950 dark:text-white">
                    28 km
                  </p>
                  <p className="text-sm text-muted-foreground">a menos por dia*</p>
                </div>
                <div className="rounded-2xl border border-border bg-secondary/45 p-4">
                  <Clock className="mb-3 h-6 w-6 text-blue-600" />
                  <p className="text-2xl font-extrabold text-slate-950 dark:text-white">
                    1h20
                  </p>
                  <p className="text-sm text-muted-foreground">economizados por turno*</p>
                </div>
                <div className="rounded-2xl border border-border bg-secondary/45 p-4">
                  <Package className="mb-3 h-6 w-6 text-orange-600" />
                  <p className="text-2xl font-extrabold text-slate-950 dark:text-white">
                    150
                  </p>
                  <p className="text-sm text-muted-foreground">paradas por rota em teste</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                *Estimativa operacional usada como referencia de produto. O ganho real
                varia conforme cidade, tabela e sequencia escolhida.
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                {steps.map((step, index) => (
                  <div
                    key={step.title}
                    className="rounded-2xl border border-border bg-white p-4 shadow-[0_8px_20px_rgb(15_23_42_/_5%)] dark:bg-slate-950"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white dark:bg-white dark:text-slate-950">
                        {index + 1}
                      </span>
                      <step.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold tracking-normal text-slate-950 dark:text-white">
                      {step.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {step.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <Card className="border-border/85 bg-white shadow-[0_14px_36px_rgb(15_23_42_/_8%)] dark:bg-card">
              <CardHeader>
                <CardTitle className="text-xl font-bold">
                  {authMode === "login" ? "Entrar" : "Criar conta"}
                </CardTitle>
                <CardDescription>
                  {authMode === "login"
                    ? "Use e-mail, senha ou conta Google para acessar."
                    : "Informe os dados basicos para liberar seu acesso operacional."}
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
                    <GoogleIcon />
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
                        <Label htmlFor="vehicleType">Veiculo</Label>
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
                        <Label htmlFor="companyName">Empresa/Operacao</Label>
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
                    <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(event) => setRememberDevice(event.target.checked)}
                        className="mt-1 h-4 w-4 accent-emerald-600"
                      />
                      <span>
                        Manter conectado neste aparelho. O EconoRota mantera sua
                        sessao ativa.
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
                    <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(event) => setAcceptTerms(event.target.checked)}
                        className="mt-1 h-4 w-4 accent-emerald-600"
                        required
                      />
                      <span>
                        Confirmo que os dados informados sao corretos e aceito o
                        uso operacional do EconoRota.
                      </span>
                    </label>
                  )}

                  {authError && <p className="text-sm text-red-600">{authError}</p>}
                  {resetMessage && (
                    <p className="text-sm text-emerald-700">{resetMessage}</p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={authPending}
                    className="w-full"
                  >
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
                    {authMode === "login" ? "Criar uma nova conta" : "Ja tenho conta"}
                  </Button>

                  <nav
                    aria-label="Links publicos do EconoRota"
                    className="grid gap-2 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm sm:grid-cols-2"
                  >
                    <Link className="font-medium text-emerald-700" href="/spx-shopee">
                      SPX/Shopee completo
                    </Link>
                    <Link className="font-medium text-emerald-700" href="/baixar-aplicativo">
                      Instalar no celular
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
          </main>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[32px] font-extrabold tracking-normal text-slate-900 dark:text-white">
              Ola, {user?.name || "Motorista"}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Aqui esta o resumo das suas rotas e entregas de hoje.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Plataforma ativa e sincronizada
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {resumeRoute && (
            <Card className="border-emerald-300 bg-white dark:bg-card lg:col-span-2">
              <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">
                    Continuar ultima rota
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
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
              <CardTitle className="text-xl font-bold text-white">
                Resumo operacional
              </CardTitle>
              <CardDescription className="text-emerald-50/90">
                Indicadores principais da sua operacao.
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
                    <p className="text-xs uppercase tracking-wide text-emerald-100">
                      Distancia total
                    </p>
                    <p className="text-3xl font-bold">
                      {routeSummary.totalDistance.toFixed(1)} km
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-100">
                      Rotas
                    </p>
                    <p className="text-3xl font-bold">{routeSummary.totalRoutes}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-100">
                      Eficiencia
                    </p>
                    <p className="text-3xl font-bold">{routeSummary.efficiency}%</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {routesQuery.isLoading ? (
              <>
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </>
            ) : (
              <>
                <Card className="bg-white dark:bg-card">
                  <CardContent className="flex items-center gap-3 pt-6">
                    <Route className="h-8 w-8 text-primary" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Concluidas
                      </p>
                      <p className="text-2xl font-bold">
                        {routeSummary.completedRoutes}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white dark:bg-card">
                  <CardContent className="flex items-center gap-3 pt-6">
                    <Package className="h-8 w-8 text-sky-600" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Pacotes
                      </p>
                      <p className="text-2xl font-bold">
                        {Math.max(routeSummary.totalRoutes * 3, 0)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white dark:bg-card">
                  <CardContent className="flex items-center gap-3 pt-6">
                    <TrendingUp className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Performance
                      </p>
                      <p className="text-2xl font-bold">Alta</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/routes/new",
              title: "Importar entregas",
              text: "Monte uma rota com tabela, voz ou cadastro manual.",
              icon: MapPin,
              color: "text-primary",
            },
            {
              href: "/routes",
              title: "Comecar rota",
              text: "Abra rotas salvas e acompanhe entregas em andamento.",
              icon: Zap,
              color: "text-primary",
            },
            {
              href: "/history",
              title: "Historico",
              text: "Revise execucoes anteriores e resultados.",
              icon: History,
              color: "text-slate-600",
            },
            {
              href: "/analytics",
              title: "Analytics",
              text: "Acompanhe metricas e tendencias de execucao.",
              icon: BarChart3,
              color: "text-sky-600",
            },
            {
              href: "/chat",
              title: "Chat IA",
              text: "Tire duvidas e receba recomendacoes inteligentes.",
              icon: MessageSquare,
              color: "text-primary",
            },
            {
              href: "/schedules",
              title: "Agendamentos",
              text: "Automatize rotas recorrentes com horario definido.",
              icon: Calendar,
              color: "text-emerald-600",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="group cursor-pointer border-border/80 bg-white dark:bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold">{item.title}</CardTitle>
                    <item.icon
                      className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 ${item.color}`}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
