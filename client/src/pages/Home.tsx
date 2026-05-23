import { useAuth } from "@/_core/hooks/useAuth";
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
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Calendar,
  History,
  MapPin,
  MessageSquare,
  Zap,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "wouter";

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const afterAuthSuccess = async () => {
    setAuthError(null);
    setPassword("");
    await utils.auth.me.invalidate();
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: afterAuthSuccess,
    onError: (error) => setAuthError(error.message),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: afterAuthSuccess,
    onError: (error) => setAuthError(error.message),
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-4 py-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">EconoRotas</h1>
            <p className="text-lg text-slate-300">
              Otimize suas rotas com inteligencia artificial
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="flex items-start space-x-3">
              <Zap className="w-5 h-5 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white">Otimizacao TSP</p>
                <p className="text-sm text-slate-400">Algoritmo inteligente</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <BarChart3 className="w-5 h-5 text-cyan-400 mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white">Analytics</p>
                <p className="text-sm text-slate-400">Metricas em tempo real</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <MessageSquare className="w-5 h-5 text-blue-400 mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white">Chat com IA</p>
                <p className="text-sm text-slate-400">Suporte inteligente</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Calendar className="w-5 h-5 text-cyan-400 mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white">Agendamento</p>
                <p className="text-sm text-slate-400">Recorrencias automaticas</p>
              </div>
            </div>
          </div>

          <Card className="text-left">
            <CardHeader>
              <CardTitle>
                {authMode === "login" ? "Entrar" : "Criar conta"}
              </CardTitle>
              <CardDescription>
                Use seu e-mail e senha para acessar o EconoRotas.
              </CardDescription>
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
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={authPending}
                    minLength={8}
                    required
                  />
                </div>

                {authError && (
                  <p className="text-sm text-red-600">{authError}</p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={authPending}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold"
                >
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
                  {authMode === "login"
                    ? "Criar uma nova conta"
                    : "Ja tenho conta"}
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
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Bem-vindo, {user?.name || "Usuario"}!
          </h1>
          <p className="text-muted-foreground">
            Gerencie e otimize suas rotas com inteligencia artificial
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/routes/new">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Nova Rota</CardTitle>
                  <MapPin className="w-5 h-5 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Crie e otimize uma nova rota com multiplos destinos
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/analytics">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Analytics</CardTitle>
                  <BarChart3 className="w-5 h-5 text-cyan-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Visualize metricas e estatisticas de suas rotas
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/chat">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Chat com IA</CardTitle>
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Faca perguntas sobre suas rotas a IA
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/schedules">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Agendamentos</CardTitle>
                  <Calendar className="w-5 h-5 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Agende rotas recorrentes com notificacoes
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/history">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Historico</CardTitle>
                  <History className="w-5 h-5 text-green-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Veja o historico de rotas executadas
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/routes">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Minhas Rotas</CardTitle>
                  <MapPin className="w-5 h-5 text-red-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Gerencie todas as suas rotas salvas
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dicas de Uso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Crie rotas com multiplos destinos</p>
              <p>Use o mapa interativo para visualizar</p>
              <p>Otimize por distancia, tempo ou modo balanceado</p>
              <p>Agende rotas recorrentes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recursos Disponiveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Algoritmo TSP para otimizacao</p>
              <p>Integracao com OpenStreetMap</p>
              <p>Chat com IA para suporte</p>
              <p>Exportacao de relatorios em PDF ou CSV</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
