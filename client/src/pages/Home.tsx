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
import {
  readDeliveryProgress,
  readLastRouteProgress,
} from "@/lib/routeProgress";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  Headphones,
  History,
  Info,
  MapPin,
  MessageCircle,
  MessageSquare,
  Navigation,
  Package,
  Play,
  Route,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
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
const SUPPORT_WHATSAPP_URL =
  "https://wa.me/5518996531491?text=Ola%2C%20preciso%20de%20suporte%20no%20EconoRota.";

const trustItems = [
  { icon: ShieldCheck, label: "Dados protegidos" },
  { icon: MessageCircle, label: "WhatsApp ativo" },
  { icon: FileCheck2, label: "Política clara" },
  { icon: CheckCircle2, label: "Termos públicos" },
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
    text: "Escolha sequência STOP, ordem da tabela ou rota inteligente.",
  },
  {
    icon: Navigation,
    title: "Entregue",
    text: "Abra no Maps ou Waze e acompanhe pacotes, paradas e status.",
  },
];

const proofItems = [
  {
    icon: Route,
    value: "Rotas",
    label: "otimizadas e acompanhadas no painel operacional.",
  },
  {
    icon: Package,
    value: "STOP",
    label: "pacote e parada destacados para reduzir erro na rua.",
  },
  {
    icon: MapPin,
    value: "GPS",
    label: "usado para sinalizar entregas marcadas longe do ponto.",
  },
];

const aboutItems = [
  {
    icon: Users,
    title: "Feito para entrega real",
    text: "O EconoRota nasceu para motoristas e operações de marketplace que precisam sair rápido, conferir pacote e manter a sequência compreensível.",
  },
  {
    icon: BarChart3,
    title: "Painel que cobra a verdade",
    text: "A operação registra rotas iniciadas, concluídas, abandonadas, uso de rota alternativa e alertas fortes para o admin saber se melhorou ou piorou.",
  },
  {
    icon: Headphones,
    title: "Suporte antes do cadastro",
    text: "Dúvidas sobre tabela, PWA, Android ou STOP podem ir direto para o WhatsApp de suporte, sem depender de tentativa e erro.",
  },
];

type AuthSuccessPayload =
  | {
      sessionToken?: string | null;
    }
  | null
  | undefined;

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
      : (window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "")
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
    const completedRoutes = routes.filter(
      (route: any) => route.status === "completed"
    ).length;
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
    if (
      !route ||
      route.status === "completed" ||
      route.status === "cancelled"
    ) {
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

    const refreshLastRoute = () =>
      setLastRouteProgress(readLastRouteProgress());
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
      window.localStorage.setItem(
        REMEMBERED_EMAIL_KEY,
        email.trim().toLowerCase()
      );
    } else if (typeof window !== "undefined") {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
    await utils.auth.me.invalidate();
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: data => afterAuthSuccess(data),
    onError: error => setAuthError(normalizeAuthError(error.message)),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: data => afterAuthSuccess(data),
    onError: error => setAuthError(normalizeAuthError(error.message)),
  });
  const resetPasswordMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: data => setResetMessage(data.message),
    onError: error => setAuthError(normalizeAuthError(error.message)),
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
      <div className="min-h-screen bg-[#f8fafc] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <header className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white/92 p-4 shadow-[0_16px_42px_rgb(15_23_42_/_8%)] backdrop-blur dark:border-slate-800 dark:bg-card lg:flex-row lg:items-center lg:justify-between">
            <BrandLogo variant="full" className="h-16 w-56 justify-start" />
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-2 text-sm font-normal text-slate-600 dark:text-slate-300">
                {trustItems.map(item => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <item.icon className="h-3.5 w-3.5 text-emerald-600" />
                    {item.label}
                  </span>
                ))}
              </div>
              <Button
                asChild
                variant="outline"
                className="h-10 justify-center gap-2 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              >
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Falar com suporte
                </a>
              </Button>
            </div>
          </header>

          <main className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_60px_rgb(15_23_42_/_10%)] dark:border-slate-800 dark:bg-card">
              <div className="space-y-6 p-5 sm:p-7">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <ShieldCheck className="h-4 w-4" />
                    Instalação recomendada: PWA
                  </div>
                  <div className="space-y-3">
                    <h1 className="max-w-3xl text-[32px] font-extrabold leading-tight tracking-normal text-slate-950 dark:text-white">
                      Roteirização simples para quem entrega SPX/Shopee.
                    </h1>
                    <p className="max-w-2xl text-sm font-normal leading-6 text-slate-600 dark:text-slate-300">
                      Escolha seguir a sequência STOP, usar a ordem da tabela ou
                      otimizar por setores. O número do pacote fica visível na
                      parada para reduzir erro na rua.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        asChild
                        className="h-12 justify-center gap-2 bg-[#ff6d00] text-base font-bold text-white hover:bg-[#f97316]"
                      >
                        <a href="#cadastro">Começar agora</a>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="h-12 justify-center gap-2 border-emerald-200 text-base font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <a href="#quem-somos">
                          <Info className="h-4 w-4" />
                          Quem está por trás
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>

                <figure className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 shadow-[0_16px_34px_rgb(15_23_42_/_16%)]">
                  <img
                    src="/og-image.png"
                    alt="EconoRota com roteirização inteligente e dados reais"
                    className="h-auto w-full"
                    loading="eager"
                  />
                </figure>

                <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <PwaInstallButton
                      className="h-14 min-w-64 gap-2 rounded-2xl bg-[#ff6d00] px-6 text-base font-extrabold text-white shadow-[0_14px_30px_rgb(255_109_0_/_28%)] hover:bg-[#f97316] hover:brightness-100"
                      label="Instalar pelo navegador"
                    />
                    <div className="space-y-1">
                      <p className="text-xl font-semibold tracking-normal text-slate-950 dark:text-white">
                        Não precisa baixar APK
                      </p>
                      <p className="text-sm font-normal leading-6 text-slate-600 dark:text-slate-300">
                        Abre como aplicativo no celular, com ícone próprio e
                        menos atrito para o usuário final.
                      </p>
                    </div>
                  </div>

                  {SHOW_ANDROID_DOWNLOAD_LINK && (
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-orange-200 bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start gap-3">
                        <Download className="mt-0.5 h-4 w-4 text-slate-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            APK para testes Android
                          </p>
                          <p className="text-sm font-normal text-slate-500 dark:text-slate-400">
                            Opção secundária para testadores e aparelhos
                            específicos.
                          </p>
                        </div>
                      </div>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                      >
                        <Link href="/baixar-aplicativo">Ver APK</Link>
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-[28px] border border-slate-800 bg-slate-950 p-5 text-white shadow-[0_16px_36px_rgb(15_23_42_/_18%)]">
                  <div className="flex flex-col gap-4">
                    <div className="max-w-2xl">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-200">
                        Prova operacional
                      </p>
                      <p className="mt-2 text-[28px] font-extrabold leading-tight tracking-normal">
                        O painel mostra execução real, não só a rota planejada.
                      </p>
                      <p className="mt-3 text-sm font-normal leading-6 text-slate-300">
                        O admin acompanha rotas iniciadas, concluídas,
                        abandonadas, uso de rota alternativa e entregas marcadas
                        longe do GPS para entender se a operação melhorou ou
                        piorou.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {proofItems.map(item => (
                        <div
                          key={item.value}
                          className="rounded-2xl bg-white/10 p-3"
                        >
                          <item.icon className="mb-3 h-5 w-5 text-orange-200" />
                          <p className="text-xl font-semibold">{item.value}</p>
                          <p className="mt-1 text-sm leading-5 text-slate-300">
                            {item.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {steps.map((step, index) => (
                    <div
                      key={step.title}
                      className="relative rounded-[24px] border border-orange-100 bg-white p-4 shadow-[0_10px_24px_rgb(15_23_42_/_6%)] dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-[#9a3412] dark:bg-orange-950 dark:text-orange-200">
                          {index + 1}
                        </span>
                        <step.icon className="h-6 w-6 text-[#ff6d00]" />
                      </div>
                      <h2 className="text-xl font-semibold tracking-normal text-slate-950 dark:text-white">
                        {step.title}
                      </h2>
                      <p className="mt-2 text-sm font-normal leading-6 text-slate-600 dark:text-slate-300">
                        {step.text}
                      </p>
                      {index < steps.length - 1 && (
                        <ArrowRight className="absolute -right-4 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-orange-300 sm:block" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <Card
              id="cadastro"
              className="rounded-[32px] border-orange-100 bg-white shadow-[0_24px_60px_rgb(15_23_42_/_10%)] dark:border-slate-800 dark:bg-card"
            >
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
                    Login com Google em ativação. Use e-mail e senha por
                    enquanto.
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
                          onChange={event => setName(event.target.value)}
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
                          onChange={event => setPhone(event.target.value)}
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
                          onChange={event => setVehicleType(event.target.value)}
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
                          onChange={event => setCity(event.target.value)}
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
                          onChange={event => setStateUf(event.target.value)}
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
                          onChange={event => setCompanyName(event.target.value)}
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
                      onChange={event => setEmail(event.target.value)}
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
                      autoComplete={
                        authMode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      value={password}
                      onChange={event => setPassword(event.target.value)}
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
                        onChange={event =>
                          setRememberDevice(event.target.checked)
                        }
                        className="mt-1 h-4 w-4 accent-[#ff6d00]"
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
                        onChange={event => setAcceptTerms(event.target.checked)}
                        className="mt-1 h-4 w-4 accent-[#ff6d00]"
                        required
                      />
                      <span>
                        Confirmo que os dados informados sao corretos e aceito o
                        uso operacional do EconoRota.
                      </span>
                    </label>
                  )}

                  {authError && (
                    <p className="text-sm text-red-600">{authError}</p>
                  )}
                  {resetMessage && (
                    <p className="text-sm text-[#9a3412]">{resetMessage}</p>
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
                    {authMode === "login"
                      ? "Criar uma nova conta"
                      : "Já tenho conta"}
                  </Button>

                  <nav
                    aria-label="Links publicos do EconoRota"
                    className="grid gap-2 rounded-2xl border border-orange-100 bg-orange-50/80 p-3 text-sm sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <Link
                      className="font-medium text-[#9a3412] dark:text-orange-200"
                      href="/spx-shopee"
                    >
                      SPX/Shopee completo
                    </Link>
                    <Link
                      className="font-medium text-[#9a3412] dark:text-orange-200"
                      href="/baixar-aplicativo"
                    >
                      Instalar no celular
                    </Link>
                    <Link
                      className="font-medium text-[#9a3412] dark:text-orange-200"
                      href="/privacidade"
                    >
                      Privacidade
                    </Link>
                    <Link
                      className="font-medium text-[#9a3412] dark:text-orange-200"
                      href="/suporte"
                    >
                      Suporte
                    </Link>
                    <a
                      className="font-medium text-emerald-700 dark:text-emerald-200"
                      href="#quem-somos"
                    >
                      Quem somos
                    </a>
                    <a
                      className="font-medium text-emerald-700 dark:text-emerald-200"
                      href={SUPPORT_WHATSAPP_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </nav>
                </form>
              </CardContent>
            </Card>
          </main>

          <section
            id="quem-somos"
            className="grid gap-5 rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_42px_rgb(15_23_42_/_8%)] sm:p-6 lg:grid-cols-[0.85fr_1.15fr] dark:border-slate-800 dark:bg-card"
          >
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                Quem somos
              </p>
              <h2 className="text-2xl font-extrabold tracking-normal text-slate-950 dark:text-white">
                Um produto focado no motorista e na operação.
              </h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                O EconoRota organiza rotas de entrega com regras reais de rua:
                sequência STOP quando o motorista escolhe seguir a tabela,
                otimização quando faz sentido e leitura simples no celular.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {aboutItems.map(item => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                >
                  <item.icon className="mb-3 h-6 w-6 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            id="suporte-whatsapp"
            className="grid gap-4 rounded-[32px] border border-emerald-200 bg-emerald-50 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-300">
                <Headphones className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-normal text-slate-950 dark:text-white">
                  Suporte visível antes da rota.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Dúvidas sobre tabela, PWA, Android, STOP ou pacote podem ir
                  direto para o canal de atendimento. Isso reduz tentativa e
                  erro antes do motorista sair para a rua.
                </p>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-2 dark:text-slate-200">
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 dark:bg-slate-950">
                    <Smartphone className="h-4 w-4 text-emerald-600" />
                    PWA, Android e instalação
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 dark:bg-slate-950">
                    <Package className="h-4 w-4 text-emerald-600" />
                    Tabela, STOP e pacote
                  </span>
                </div>
              </div>
            </div>
            <Button
              asChild
              className="h-12 justify-center gap-2 bg-emerald-700 px-5 text-white hover:bg-emerald-800"
            >
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                Chamar no WhatsApp
              </a>
            </Button>
          </section>
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
              Olá, {user?.name || "Motorista"}
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
                    <p className="text-3xl font-bold">
                      {routeSummary.totalRoutes}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-100">
                      Eficiência
                    </p>
                    <p className="text-3xl font-bold">
                      {routeSummary.efficiency}%
                    </p>
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
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <Card className="group cursor-pointer border-border/80 bg-white dark:bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold">
                      {item.title}
                    </CardTitle>
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
