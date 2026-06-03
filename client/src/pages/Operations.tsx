import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  Gauge,
  MapPinned,
  Route,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(value: unknown) {
  if (!value) return "-";
  return new Date(value as string | Date).toLocaleString("pt-BR");
}

function severityVariant(severity: string) {
  if (severity === "fatal" || severity === "error") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

function StatCard({
  title,
  value,
  suffix,
  icon: Icon,
}: {
  title: string;
  value: number;
  suffix?: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">
          {value}
          {suffix}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Operations() {
  const utils = trpc.useUtils();
  const dashboardQuery = trpc.admin.dashboard.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const cleanupE2eUsersMutation = trpc.admin.cleanupE2eUsers.useMutation({
    onSuccess: async (result) => {
      await utils.admin.dashboard.invalidate();
      toast.success(`${result.deletedCount} usuario(s) de teste removido(s).`);
    },
    onError: (error) => {
      toast.error(error.message || "Nao foi possivel limpar usuarios de teste.");
    },
  });

  const data = dashboardQuery.data;
  const stats = data?.stats;
  const routeQuality = (data as any)?.routeQuality;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">
              Operação
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Controle de usuários, rotas, erros e sinais de otimização ruim.
          </p>
        </div>

        {dashboardQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Usuários cadastrados" value={stats?.usersTotal ?? 0} icon={Users} />
            <StatCard title="Ativos em 7 dias" value={stats?.activeUsers7d ?? 0} icon={Activity} />
            <StatCard title="Rotas criadas" value={stats?.routesTotal ?? 0} icon={Route} />
            <StatCard title="Erros 24h" value={stats?.criticalEvents24h ?? 0} icon={AlertTriangle} />
            <StatCard title="Alertas de rota 24h" value={stats?.routeWarnings24h ?? 0} icon={MapPinned} />
          </div>
        )}

        {dashboardQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Route Quality Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Taxa correcao fiscal"
                  value={Math.round(routeQuality?.correctionRate ?? 0)}
                  suffix="%"
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Fallback OSRM"
                  value={Math.round(routeQuality?.osrmFallbackRate ?? 0)}
                  suffix="%"
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Retrabalho regional"
                  value={Math.round(routeQuality?.regionalReworkIndex ?? 0)}
                  suffix="%"
                  icon={MapPinned}
                />
                <StatCard
                  title="Score medio"
                  value={Math.round(routeQuality?.averageScore ?? 0)}
                  icon={Gauge}
                />
                <StatCard
                  title="Rotas avaliadas"
                  value={routeQuality?.scoredRoutes ?? 0}
                  icon={Route}
                />
                <StatCard
                  title="Correcoes do fiscal"
                  value={routeQuality?.corrections ?? 0}
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Revisitas evitadas"
                  value={routeQuality?.revisitsAvoided ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Saidas corrigidas"
                  value={routeQuality?.prematureExitsCorrected ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Cruzamentos detectados"
                  value={routeQuality?.routeCrossingsDetected ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="KM economizados"
                  value={Math.round(routeQuality?.estimatedKmSaved ?? 0)}
                  icon={MapPinned}
                />
                <StatCard
                  title="Min. economizados"
                  value={routeQuality?.estimatedMinutesSaved ?? 0}
                  icon={Activity}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Economia estimada a partir dos alertas corrigidos pelo fiscal.
                Dados reais de antes/depois entram quando houver telemetria de execucao completa.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <Card>
            <CardHeader>
              <CardTitle>Eventos recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboardQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-lg" />
                ))
              ) : data?.recentEvents?.length ? (
                data.recentEvents.map((event: any) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-border/80 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(event.severity) as any}>
                        {event.severity}
                      </Badge>
                      <span className="text-sm font-medium">{event.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {event.userName || event.userEmail || "Usuário não identificado"}
                      {event.routeName ? ` · ${event.routeName}` : ""}
                    </p>
                    {event.message ? (
                      <p className="mt-1 line-clamp-2 text-sm">{event.message}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.source} · {event.type}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum evento operacional registrado ainda.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manutencao segura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Remove apenas usuarios de teste com e-mail codex-e2e-*@example.com.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={cleanupE2eUsersMutation.isPending}
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Remover usuarios de teste E2E? Apenas contas codex-e2e-*@example.com serao afetadas."
                    );
                    if (!confirmed) return;
                    cleanupE2eUsersMutation.mutate();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {cleanupE2eUsersMutation.isPending
                    ? "Limpando..."
                    : "Limpar usuarios E2E"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Novos usuários</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))
                ) : data?.recentUsers?.length ? (
                  data.recentUsers.map((user: any) => (
                    <div key={user.id} className="rounded-lg border border-border/80 p-3">
                      <p className="text-sm font-medium">{user.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{user.email || "-"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cadastro: {formatDate(user.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sem cadastros recentes.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rotas recentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))
                ) : data?.recentRoutes?.length ? (
                  data.recentRoutes.map((route: any) => (
                    <div key={route.id} className="rounded-lg border border-border/80 p-3">
                      <div className="flex items-center gap-2">
                        <MapPinned className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">{route.name}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {route.userName || route.userEmail || "Usuário"} · {route.status}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(route.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sem rotas recentes.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
