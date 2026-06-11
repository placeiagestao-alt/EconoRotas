import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
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

function readinessVariant(status: string) {
  if (status === "READY") return "outline";
  if (status === "NO-GO" || status === "NO_GO") return "destructive";
  return "secondary";
}

function StatCard({
  title,
  value,
  suffix,
  icon: Icon,
}: {
  title: string;
  value: number | string;
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

function formatMs(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "0 ms";
  if (number >= 1000) return `${(number / 1000).toFixed(1)} s`;
  return `${Math.round(number)} ms`;
}

function formatHours(value: unknown) {
  if (value == null) return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (number < 1) return `${Math.round(number * 60)} min`;
  return `${number.toFixed(number >= 10 ? 0 : 1)} h`;
}

function PerformanceStageRow({
  label,
  metric,
}: {
  label: string;
  metric: any;
}) {
  return (
    <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-2 border-t border-border/70 py-2 text-sm">
      <span className="font-medium">{label}</span>
      <span>{formatMs(metric?.averageMs)}</span>
      <span>{formatMs(metric?.p50Ms)}</span>
      <span>{formatMs(metric?.p95Ms)}</span>
      <span>{formatMs(metric?.p99Ms)}</span>
    </div>
  );
}

function modeLabel(mode: string) {
  if (mode === "shortest_distance") return "Menor distancia";
  if (mode === "shortest_time") return "Menor tempo";
  return "Balanceado";
}

function confidenceDistributionItems(distribution: any) {
  if (
    distribution &&
    "score_0_20" in distribution &&
    "score_81_100" in distribution
  ) {
    return [
      { label: "0-20", value: distribution?.score_0_20 ?? 0 },
      { label: "21-40", value: distribution?.score_21_40 ?? 0 },
      { label: "41-60", value: distribution?.score_41_60 ?? 0 },
      { label: "61-80", value: distribution?.score_61_80 ?? 0 },
      { label: "81-100", value: distribution?.score_81_100 ?? 0 },
    ];
  }

  return [
    { label: "90-100", value: distribution?.excellent ?? 0 },
    { label: "75-89", value: distribution?.good ?? 0 },
    { label: "60-74", value: distribution?.attention ?? 0 },
    { label: "< 60", value: distribution?.suspicious ?? 0 },
    { label: "Sem score", value: distribution?.notClassified ?? 0 },
  ];
}

function formatPercent(value: unknown) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1)}%`;
}

function ImpactMetricRow({
  label,
  value7,
  value30,
  variation,
  suffix = "",
}: {
  label: string;
  value7: unknown;
  value30: unknown;
  variation: unknown;
  suffix?: string;
}) {
  return (
    <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] items-center gap-2 border-b border-border/70 py-2 text-sm last:border-0">
      <span className="font-medium">{label}</span>
      <span>
        {Number(value7 || 0).toFixed(suffix === "%" ? 1 : 0)}
        {suffix}
      </span>
      <span>
        {Number(value30 || 0).toFixed(suffix === "%" ? 1 : 0)}
        {suffix}
      </span>
      <span
        className={
          Number(variation || 0) >= 0 ? "text-emerald-700" : "text-red-700"
        }
      >
        {formatPercent(variation)}
      </span>
    </div>
  );
}

function MiniBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export default function Operations() {
  const { loading: authLoading, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const dashboardQuery = trpc.admin.dashboard.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30_000 : false,
  });
  const eventsQuery = trpc.admin.events.useQuery(
    { page: 1, limit: 30 },
    {
      enabled: isAdmin,
      refetchInterval: isAdmin ? 30_000 : false,
    }
  );
  const refreshDashboardMutation = trpc.admin.refreshDashboard.useMutation({
    onSuccess: async () => {
      await utils.admin.dashboard.invalidate();
      toast.success("Metricas do painel atualizadas.");
    },
    onError: (error) => {
      toast.error(error.message || "Nao foi possivel atualizar as metricas.");
    },
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
  const routeMetrics = (data as any)?.routeMetrics;
  const optimizationJobs = (data as any)?.optimizationJobs;
  const optimizationQueue = (data as any)?.optimizationQueue;
  const optimizationWorkers = (data as any)?.optimizationWorkers;
  const queueIntegrity = (data as any)?.queueIntegrity;
  const disasterReadiness = (data as any)?.disasterReadiness;
  const performanceBenchmarks = (data as any)?.performanceBenchmarks;
  const goLive500 = (data as any)?.goLive500;
  const multiVehicleReadiness = (data as any)?.multiVehicleReadiness;
  const geocodingCache = (data as any)?.geocodingCache;
  const geocodingImpact = (data as any)?.geocodingImpact;
  const executiveReport = (data as any)?.geocodingExecutiveReport;
  const operationExecutionReport = (data as any)?.operationExecutionReport;
  const execution30 = operationExecutionReport?.last30Days;
  const execution7 = operationExecutionReport?.last7Days;
  const executionComparison = operationExecutionReport?.comparison;
  const materialized = (data as any)?.materialized;
  const recentEvents = eventsQuery.data?.events ?? [];
  const impact7 = geocodingImpact?.last7Days;
  const impact30 = geocodingImpact?.last30Days;
  const impactComparison = geocodingImpact?.comparison;
  const confidenceItems = confidenceDistributionItems(
    impact30?.confidenceDistribution ??
      routeMetrics?.geocodingConfidence?.scoreDistribution
  );
  const maxConfidenceBucket = Math.max(
    0,
    ...confidenceItems.map((item) => Number(item.value || 0))
  );
  const providerItems = impact30?.providers ?? [];

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito ao administrador</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Esta area mostra metricas operacionais e eventos internos do
            sistema. Entre com uma conta administradora para acessar.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

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
          {materialized?.generatedAt ? (
            <p className="text-xs text-muted-foreground">
              Ultima atualizacao das metricas: {formatDate(materialized.generatedAt)}
              {materialized.stale ? " · snapshot aguardando atualizacao" : ""}
            </p>
          ) : null}
        </div>

        {dashboardQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : dashboardQuery.isError ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4">
              <p className="text-sm font-medium text-destructive">
                Falha ao carregar metricas administrativas.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dashboardQuery.error?.message ||
                  "Tente atualizar o painel. Os valores nao serao substituidos por zero."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={refreshDashboardMutation.isPending}
                onClick={() => refreshDashboardMutation.mutate()}
              >
                {refreshDashboardMutation.isPending ? "Atualizando..." : "Atualizar metricas"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Usuários cadastrados" value={stats?.usersTotal ?? 0} icon={Users} />
            <StatCard title="Ativos em 7 dias" value={stats?.activeUsers7d ?? 0} icon={Activity} />
            <StatCard title="Rotas criadas" value={stats?.routesTotal ?? 0} icon={Route} />
            <StatCard title="Erros 24h" value={stats?.criticalEvents24h ?? 0} icon={AlertTriangle} />
            <StatCard title="Alertas de rota 24h" value={stats?.routeWarnings24h ?? 0} icon={MapPinned} />
          </div>
        )}

        {!dashboardQuery.isLoading && operationExecutionReport ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5 text-primary" />
                Execução operacional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <StatCard
                  title="Rotas otimizadas"
                  value={execution30?.optimizedRoutes ?? 0}
                  icon={Route}
                />
                <StatCard
                  title="Rotas iniciadas"
                  value={execution30?.startedRoutes ?? 0}
                  icon={Activity}
                />
                <StatCard
                  title="Rotas concluídas"
                  value={execution30?.completedRoutes ?? 0}
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Rotas abandonadas"
                  value={execution30?.abandonedRoutes ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Taxa de início"
                  value={Math.round(execution30?.startRate ?? 0)}
                  suffix="%"
                  icon={Gauge}
                />
                <StatCard
                  title="Taxa de conclusão"
                  value={Math.round(execution30?.completionRate ?? 0)}
                  suffix="%"
                  icon={Gauge}
                />
              </div>

              <div className="rounded-lg border border-border/80 p-4">
                <div className="mb-2 grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] gap-2 text-xs font-medium uppercase text-muted-foreground">
                  <span>Métrica</span>
                  <span>7 dias</span>
                  <span>30 dias</span>
                  <span>Variação</span>
                </div>
                <ImpactMetricRow
                  label="Rotas otimizadas"
                  value7={execution7?.optimizedRoutes}
                  value30={execution30?.optimizedRoutes}
                  variation={executionComparison?.optimizedRoutes}
                />
                <ImpactMetricRow
                  label="Rotas iniciadas"
                  value7={execution7?.startedRoutes}
                  value30={execution30?.startedRoutes}
                  variation={executionComparison?.startedRoutes}
                />
                <ImpactMetricRow
                  label="Rotas concluídas"
                  value7={execution7?.completedRoutes}
                  value30={execution30?.completedRoutes}
                  variation={executionComparison?.completedRoutes}
                />
                <ImpactMetricRow
                  label="Taxa de início"
                  value7={execution7?.startRate}
                  value30={execution30?.startRate}
                  variation={executionComparison?.startRate}
                  suffix="%"
                />
                <ImpactMetricRow
                  label="Taxa de conclusão"
                  value7={execution7?.completionRate}
                  value30={execution30?.completionRate}
                  variation={executionComparison?.completionRate}
                  suffix="%"
                />
                <ImpactMetricRow
                  label="Taxa de abandono"
                  value7={execution7?.abandonmentRate}
                  value30={execution30?.abandonmentRate}
                  variation={executionComparison?.abandonmentRate}
                  suffix="%"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Bloqueios de início
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {execution30?.startBlockedAttempts ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tentativas bloqueadas em 30 dias
                  </p>
                </div>
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Tempo médio de execução
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {formatMs(execution30?.averageExecutionDurationMs)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Entre início e conclusão
                  </p>
                </div>
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Pendentes após otimização
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {execution30?.pendingAfterOptimization ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Otimizadas sem início registrado
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!dashboardQuery.isLoading && routeMetrics?.performance ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Performance da otimizaÃ§Ã£o
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {multiVehicleReadiness ? (
                <div
                  className={`rounded-lg border p-4 ${
                    multiVehicleReadiness.status === "READY"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : multiVehicleReadiness.status === "NO-GO"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-amber-300 bg-amber-50/60"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        Backlog Enterprise: Multi-Vehicle
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Fora do Go Live 500. Usado apenas como portao futuro para frota,
                        VRP e operacoes acima do produto comercial atual.
                      </p>
                    </div>
                    <Badge variant={readinessVariant(multiVehicleReadiness.status)}>
                      {multiVehicleReadiness.status}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {Object.entries(multiVehicleReadiness.items ?? {}).map(
                      ([key, item]: [string, any]) => (
                        <div
                          key={key}
                          className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">
                              {key
                                .replace(/([A-Z])/g, " $1")
                                .replace(/^./, (letter) => letter.toUpperCase())}
                            </p>
                            <Badge variant={readinessVariant(item.status)}>
                              {item.status}
                            </Badge>
                          </div>
                          {Array.isArray(item.blockers) && item.blockers.length > 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {item.blockers[0]}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Evidencia comprovada.
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  {Array.isArray(multiVehicleReadiness.multiVehicle?.blockers) &&
                  multiVehicleReadiness.multiVehicle.blockers.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-border/70 bg-background/80 p-3 text-sm">
                      <p className="font-medium">Bloqueios principais</p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {multiVehicleReadiness.multiVehicle.blockers
                          .slice(0, 6)
                          .map((blocker: string) => (
                            <li key={blocker}>- {blocker}</li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <StatCard
                  title="Jobs em fila"
                  value={optimizationQueue?.counts?.waiting ?? optimizationJobs?.queued ?? 0}
                  icon={Activity}
                />
                <StatCard
                  title="Executando"
                  value={optimizationQueue?.counts?.active ?? optimizationJobs?.running ?? 0}
                  icon={Activity}
                />
                <StatCard
                  title="Workers"
                  value={optimizationWorkers?.workerCount ?? optimizationQueue?.workerCount ?? 0}
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Falhos"
                  value={optimizationQueue?.counts?.failed ?? optimizationJobs?.failed ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Sucesso fila"
                  value={Math.round(optimizationJobs?.successRate ?? 0)}
                  suffix="%"
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Retry ativo"
                  value={optimizationJobs?.retrying ?? 0}
                  icon={Activity}
                />
              </div>

              {optimizationWorkers ? (
                <div
                  className={`rounded-lg border p-4 ${
                    optimizationWorkers.alert
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-border/80"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        Workers online: {optimizationWorkers.workerCount ?? 0}/
                        {optimizationWorkers.minimumWorkerCount ?? 2}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {optimizationWorkers.alert?.message ??
                          "Redundancia operacional dentro da meta."}
                      </p>
                    </div>
                    <Badge
                      variant={optimizationWorkers.alert ? "secondary" : "outline"}
                    >
                      {optimizationWorkers.status === "healthy" ? "Saudavel" : "Atencao"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Jobs processados
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {optimizationWorkers.workerJobsProcessed ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Jobs falhos
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {optimizationWorkers.workerJobsFailed ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Runtime medio
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {formatMs(optimizationWorkers.workerAverageRuntime)}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(optimizationWorkers.workers) &&
                  optimizationWorkers.workers.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {optimizationWorkers.workers.map((worker: any) => (
                        <div
                          key={worker.workerId}
                          className="grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 text-sm md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.8fr]"
                        >
                          <span className="font-medium">{worker.workerId}</span>
                          <span className="text-muted-foreground">
                            {worker.hostname ?? "host desconhecido"}
                          </span>
                          <span>OK</span>
                          <span>{worker.jobsProcessed ?? 0} concluido(s)</span>
                          <span>{formatDate(worker.lastHeartbeat)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Nenhum heartbeat de worker online encontrado.
                    </p>
                  )}
                </div>
              ) : null}

              {queueIntegrity ? (
                <div
                  className={`rounded-lg border p-4 ${
                    queueIntegrity.status === "healthy"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-amber-300 bg-amber-50/60"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Integridade da fila</p>
                      <p className="text-sm text-muted-foreground">
                        Meta: 0 jobs duplicados, 0 jobs perdidos e recuperacao apos falha.
                      </p>
                    </div>
                    <Badge
                      variant={queueIntegrity.status === "healthy" ? "outline" : "secondary"}
                    >
                      {queueIntegrity.status === "healthy" ? "Saudavel" : "Atencao"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <StatCard
                      title="Jobs duplicados"
                      value={queueIntegrity.duplicateJobs ?? 0}
                      icon={AlertTriangle}
                    />
                    <StatCard
                      title="Jobs travados"
                      value={queueIntegrity.stalledJobs ?? queueIntegrity.stalledCount ?? 0}
                      icon={AlertTriangle}
                    />
                    <StatCard
                      title="Jobs recuperados"
                      value={queueIntegrity.stalledRecoveredCount ?? queueIntegrity.recoveredJobs ?? 0}
                      icon={ShieldCheck}
                    />
                    <StatCard
                      title="Falhas recuperacao"
                      value={queueIntegrity.failedRecoveries ?? 0}
                      icon={AlertTriangle}
                    />
                    <StatCard
                      title="Redis reconexoes"
                      value={queueIntegrity.redisReconnectCount ?? 0}
                      icon={Activity}
                    />
                    <StatCard
                      title="Em execucao longa"
                      value={queueIntegrity.runningStalledJobs ?? 0}
                      icon={Gauge}
                    />
                  </div>
                  {Array.isArray(queueIntegrity.longRunningJobs) &&
                  queueIntegrity.longRunningJobs.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {queueIntegrity.longRunningJobs.slice(0, 5).map((job: any) => (
                        <div
                          key={job.jobId}
                          className="rounded-lg border border-amber-200 bg-background/80 p-3 text-sm"
                        >
                          <p className="font-medium">
                            Job {job.jobId} acima de {job.thresholdMultiplier}x o runtime medio
                          </p>
                          <p className="text-muted-foreground">
                            Em execucao ha {formatMs(job.runningMs)}. Worker:{" "}
                            {job.workerId ?? "desconhecido"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Ultima checagem: {formatDate(queueIntegrity.lastIntegrityCheck)}
                  </p>
                </div>
              ) : null}

              {disasterReadiness ? (
                <div
                  className={`rounded-lg border p-4 ${
                    disasterReadiness.status === "healthy"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : disasterReadiness.status === "critical"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-amber-300 bg-amber-50/60"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Disaster recovery</p>
                      <p className="text-sm text-muted-foreground">
                        Meta: RPO &lt; {disasterReadiness.rpoTargetHours ?? 24}h e RTO &lt;{" "}
                        {disasterReadiness.rtoTargetHours ?? 4}h.
                      </p>
                    </div>
                    <Badge
                      variant={
                        disasterReadiness.status === "critical"
                          ? "destructive"
                          : disasterReadiness.status === "healthy"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {disasterReadiness.status === "healthy"
                        ? "Saudavel"
                        : disasterReadiness.status === "critical"
                          ? "Critico"
                          : "Atencao"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Ultimo backup
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatDate(disasterReadiness.lastBackupAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Idade: {formatHours(disasterReadiness.backupAgeHours)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Restore test
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {disasterReadiness.restoreTestPassed ? "Aprovado" : "Sem evidencia"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(disasterReadiness.restoreTestAt)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Tabelas criticas
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {Array.isArray(disasterReadiness.criticalTables)
                          ? disasterReadiness.criticalTables.length
                          : 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Array.isArray(disasterReadiness.criticalTables)
                          ? `${disasterReadiness.criticalTables.filter((table: any) => table.status !== "ok").length} com falha`
                          : "Nao verificado"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Alertas DR
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {Array.isArray(disasterReadiness.alerts)
                          ? disasterReadiness.alerts.length
                          : 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Checado em {formatDate(disasterReadiness.checkedAt)}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(disasterReadiness.alerts) &&
                  disasterReadiness.alerts.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {disasterReadiness.alerts.slice(0, 4).map((alert: any) => (
                        <div
                          key={`${alert.type}-${alert.title}`}
                          className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{alert.title}</p>
                            <Badge variant={severityVariant(alert.severity)}>
                              {alert.severityLabel ?? alert.severity}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{alert.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {goLive500 ? (
                <div
                  className={`rounded-lg border p-4 ${
                    goLive500.verdict === "READY"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : goLive500.verdict === "NO_GO"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-amber-300 bg-amber-50/60"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Go Live 500</p>
                      <p className="text-sm text-muted-foreground">
                        Capacidade comercial limitada a 500 paradas, 20 usuarios simultaneos e 5 otimizacoes simultaneas.
                      </p>
                    </div>
                    <Badge variant={readinessVariant(goLive500.verdict)}>
                      {goLive500.verdict === "NO_GO" ? "NO-GO" : goLive500.verdict}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <StatCard
                      title="Maior rota"
                      value={goLive500.routes?.largestRouteStops ?? 0}
                      suffix={`/${goLive500.maxRouteStops ?? 500}`}
                      icon={Route}
                    />
                    <StatCard
                      title="Acima do limite"
                      value={goLive500.routes?.routesAbove500 ?? 0}
                      icon={AlertTriangle}
                    />
                    <StatCard
                      title="P95 ate 500"
                      value={formatMs(goLive500.runtime?.p95Ms)}
                      icon={Gauge}
                    />
                    <StatCard
                      title="Benchmark 500"
                      value={
                        goLive500.benchmark500?.status === "ready"
                          ? "OK"
                          : goLive500.benchmark500?.status === "no-go"
                            ? "NO-GO"
                            : "Pendente"
                      }
                      icon={ShieldCheck}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                      <MiniBar
                        label="Utilizacao do limite"
                        value={Math.round(goLive500.routes?.utilizationPercent ?? 0)}
                        max={100}
                      />
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>Rotas totais: {goLive500.routes?.total ?? 0}</span>
                        <span>Media: {goLive500.routes?.averageStops ?? 0} paradas</span>
                        <span>&gt;250: {goLive500.routes?.routesAbove250 ?? 0}</span>
                        <span>Perto do limite: {goLive500.routes?.routesNearLimit ?? 0}</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Media</span>
                        <span>{formatMs(goLive500.runtime?.averageMs)}</span>
                        <span className="text-muted-foreground">P50</span>
                        <span>{formatMs(goLive500.runtime?.p50Ms)}</span>
                        <span className="text-muted-foreground">P95</span>
                        <span>{formatMs(goLive500.runtime?.p95Ms)}</span>
                        <span className="text-muted-foreground">P99</span>
                        <span>{formatMs(goLive500.runtime?.p99Ms)}</span>
                      </div>
                    </div>
                  </div>

                  {Array.isArray(goLive500.issues) && goLive500.issues.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {goLive500.issues.map((issue: any, index: number) => (
                        <div
                          key={`${issue.message}-${index}`}
                          className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{issue.message}</p>
                            <Badge variant={issue.severity === "critical" ? "destructive" : "secondary"}>
                              {issue.severity === "critical" ? "Critico" : "Atencao"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {performanceBenchmarks ? (
                <div
                  className={`rounded-lg border p-4 ${
                    performanceBenchmarks.status === "ready"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : performanceBenchmarks.status === "no-go"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-amber-300 bg-amber-50/60"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Performance historica</p>
                      <p className="text-sm text-muted-foreground">
                        Benchmark automatizado para 250, 500, 1000 e 2000 paradas.
                      </p>
                    </div>
                    <Badge
                      variant={
                        performanceBenchmarks.status === "ready"
                          ? "outline"
                          : performanceBenchmarks.status === "no-go"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {performanceBenchmarks.status === "ready"
                        ? "READY"
                        : performanceBenchmarks.status === "no-go"
                          ? "NO-GO"
                          : performanceBenchmarks.status === "unavailable"
                            ? "Indisponivel"
                            : "PARTIAL"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <StatCard
                      title="Execucoes"
                      value={performanceBenchmarks.totalRuns ?? 0}
                      icon={Gauge}
                    />
                    <StatCard
                      title="Sucesso"
                      value={Math.round(performanceBenchmarks.successRate ?? 0)}
                      suffix="%"
                      icon={ShieldCheck}
                    />
                    <StatCard
                      title="Dentro da meta"
                      value={Math.round(performanceBenchmarks.criteriaMetRate ?? 0)}
                      suffix="%"
                      icon={Activity}
                    />
                    <StatCard
                      title="Falha OSRM"
                      value={Math.round(performanceBenchmarks.osrmFailureRate ?? 0)}
                      suffix="%"
                      icon={AlertTriangle}
                    />
                  </div>

                  {performanceBenchmarks.tableAvailable === false ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Tabela de benchmarks ainda indisponivel. Aplique a migration antes de
                      executar a suite oficial.
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-2">
                    {(performanceBenchmarks.targets ?? []).map((target: any) => (
                      <div
                        key={target.stopCount}
                        className="grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 text-sm md:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_0.8fr]"
                      >
                        <span className="font-medium">{target.stopCount} paradas</span>
                        <span>Meta: {formatMs(target.targetMs)}</span>
                        <span>Ultimo: {formatMs(target.latestRuntimeMs)}</span>
                        <span>P95: {formatMs(target.p95RuntimeMs)}</span>
                        <span>Pico: {target.latestPeakMemoryMb ?? 0} MB</span>
                        <Badge
                          variant={
                            target.status === "ready"
                              ? "outline"
                              : target.status === "no-go"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {target.status === "ready"
                            ? "READY"
                            : target.status === "no-go"
                              ? "NO-GO"
                              : "Sem dado"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  title="Fila media"
                  value={Math.round((optimizationJobs?.queueWait?.averageMs ?? 0) / 1000)}
                  suffix="s"
                  icon={Gauge}
                />
                <StatCard
                  title="Redis fila"
                  value={optimizationQueue?.reachable ? "OK" : "OFF"}
                  icon={ShieldCheck}
                />
                <StatCard
                  title="OSRM chamadas"
                  value={routeMetrics?.performance?.osrm?.callCount ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Falha OSRM"
                  value={Math.round(routeMetrics?.performance?.osrm?.failureRate ?? 0)}
                  suffix="%"
                  icon={AlertTriangle}
                />
                <StatCard
                  title="P95 total"
                  value={Math.round(
                    (routeMetrics?.performance?.stages?.totalRuntimeMs?.p95Ms ?? 0) /
                      1000
                  )}
                  suffix="s"
                  icon={Gauge}
                />
              </div>

              <div className="rounded-lg border border-border/80 p-4">
                <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-2 pb-2 text-xs font-medium uppercase text-muted-foreground">
                  <span>Etapa</span>
                  <span>Media</span>
                  <span>P50</span>
                  <span>P95</span>
                  <span>P99</span>
                </div>
                <PerformanceStageRow
                  label="Banco - leitura"
                  metric={routeMetrics.performance.stages.dbFetchMs}
                />
                <PerformanceStageRow
                  label="Clusterizacao"
                  metric={routeMetrics.performance.stages.clusteringMs}
                />
                <PerformanceStageRow
                  label="OSRM"
                  metric={routeMetrics.performance.stages.osrmMs}
                />
                <PerformanceStageRow
                  label="Otimizador"
                  metric={routeMetrics.performance.stages.optimizerMs}
                />
                <PerformanceStageRow
                  label="Fiscal"
                  metric={routeMetrics.performance.stages.auditMs}
                />
                <PerformanceStageRow
                  label="Correcao"
                  metric={routeMetrics.performance.stages.correctionMs}
                />
                <PerformanceStageRow
                  label="Banco - gravacao"
                  metric={routeMetrics.performance.stages.dbSaveMs}
                />
                <PerformanceStageRow
                  label="Total"
                  metric={routeMetrics.performance.stages.totalRuntimeMs}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!dashboardQuery.isLoading && geocodingImpact ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Impacto do geocoding
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Cache hit rate"
                  value={Math.round(impact30?.cache?.hitRate ?? 0)}
                  suffix="%"
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Chamadas evitadas"
                  value={impact30?.cache?.callsAvoided ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Correcoes manuais 30d"
                  value={impact30?.manualCorrections?.count ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Bloqueios baixa confianca"
                  value={impact30?.fiscalLowConfidenceBlocks ?? 0}
                  icon={ShieldCheck}
                />
              </div>

              <div className="rounded-lg border border-border/80 p-4">
                <div className="mb-2 grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] gap-2 text-xs font-medium uppercase text-muted-foreground">
                  <span>Metrica</span>
                  <span>7 dias</span>
                  <span>30 dias</span>
                  <span>Variacao</span>
                </div>
                <ImpactMetricRow
                  label="Rotas processadas"
                  value7={impact7?.processedRoutes}
                  value30={impact30?.processedRoutes}
                  variation={impactComparison?.processedRoutes}
                />
                <ImpactMetricRow
                  label="Confianca media"
                  value7={impact7?.averageConfidence}
                  value30={impact30?.averageConfidence}
                  variation={impactComparison?.averageConfidence}
                />
                <ImpactMetricRow
                  label="Menor confianca"
                  value7={impact7?.minConfidence}
                  value30={impact30?.minConfidence}
                  variation={impactComparison?.minConfidence}
                />
                <ImpactMetricRow
                  label="Paradas suspeitas"
                  value7={impact7?.suspiciousStops}
                  value30={impact30?.suspiciousStops}
                  variation={impactComparison?.suspiciousStops}
                />
                <ImpactMetricRow
                  label="Bloqueios fiscal"
                  value7={impact7?.fiscalBlocks}
                  value30={impact30?.fiscalBlocks}
                  variation={impactComparison?.fiscalBlocks}
                />
                <ImpactMetricRow
                  label="Correcoes automaticas"
                  value7={impact7?.autoCorrections}
                  value30={impact30?.autoCorrections}
                  variation={impactComparison?.autoCorrections}
                />
                <ImpactMetricRow
                  label="Score operacional"
                  value7={impact7?.averageOperationalScore}
                  value30={impact30?.averageOperationalScore}
                  variation={impactComparison?.averageOperationalScore}
                />
                <ImpactMetricRow
                  label="Taxa de cache"
                  value7={impact7?.cache?.hitRate}
                  value30={impact30?.cache?.hitRate}
                  variation={impactComparison?.cacheHitRate}
                  suffix="%"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium">Distribuicao de confianca</p>
                  <div className="mt-3 space-y-3">
                    {confidenceItems.map((item) => (
                      <MiniBar
                        key={item.label}
                        label={item.label}
                        value={Number(item.value || 0)}
                        max={maxConfidenceBucket}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium">Cache e consultas externas</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Local</p>
                      <p className="text-2xl font-semibold">
                        {impact30?.cache?.localHits ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Backend</p>
                      <p className="text-2xl font-semibold">
                        {impact30?.cache?.backendHits ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Misses</p>
                      <p className="text-2xl font-semibold">
                        {impact30?.cache?.misses ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Externas</p>
                      <p className="text-2xl font-semibold">
                        {impact30?.cache?.externalCallRate ?? 0}%
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium">Provedor usado</p>
                  <div className="mt-3 space-y-3">
                    {providerItems.length ? (
                      providerItems.map((item: any) => (
                        <MiniBar
                          key={item.provider}
                          label={`${item.provider} (${item.rate}%)`}
                          value={Number(item.count || 0)}
                          max={Math.max(
                            1,
                            ...providerItems.map((provider: any) =>
                              Number(provider.count || 0)
                            )
                          )}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sem eventos de provedor ainda.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium">Correcoes manuais</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    7 dias: {impact7?.manualCorrections?.count ?? 0} · 30 dias:{" "}
                    {impact30?.manualCorrections?.count ?? 0}
                  </p>
                  <div className="mt-3 space-y-2">
                    {(impact30?.manualCorrections?.topAddresses ?? [])
                      .slice(0, 5)
                      .map((item: any) => (
                        <div
                          key={item.value}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span className="line-clamp-1">{item.value}</span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/80 p-4">
                  <p className="text-sm font-medium">Relatorio executivo</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <span>Confianca media</span>
                    <strong>{executiveReport?.averageConfidence ?? 0}/100</strong>
                    <span>Taxa de cache</span>
                    <strong>{executiveReport?.cacheRate ?? 0}%</strong>
                    <span>Taxa fallback</span>
                    <strong>{executiveReport?.fallbackRate ?? 0}%</strong>
                    <span>Correcoes manuais</span>
                    <strong>{executiveReport?.manualCorrections ?? 0}</strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

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
                  title="Taxa correção fiscal"
                  value={Math.round(routeMetrics?.auditorCorrectionRate ?? 0)}
                  suffix="%"
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Fallback OSRM"
                  value={Math.round(routeMetrics?.osrmFallbackRate ?? 0)}
                  suffix="%"
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Confiança endereço"
                  value={Math.round(routeMetrics?.geocodingConfidence?.averageScore ?? 0)}
                  suffix="/100"
                  icon={MapPinned}
                />
                <StatCard
                  title="Menor confiança"
                  value={Math.round(routeMetrics?.geocodingConfidence?.minScore ?? 0)}
                  suffix="/100"
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Paradas suspeitas"
                  value={Math.round(routeMetrics?.geocodingConfidence?.suspiciousStopRate ?? 0)}
                  suffix="%"
                  icon={Gauge}
                />
                <StatCard
                  title="Cache local"
                  value={Math.round(geocodingCache?.localReuseRate ?? 0)}
                  suffix="%"
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Hits endereço"
                  value={geocodingCache?.localHits ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Misses endereço"
                  value={geocodingCache?.localMisses ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Retrabalho regional"
                  value={Math.round(routeMetrics?.regionalReworkIndex ?? 0)}
                  suffix="%"
                  icon={MapPinned}
                />
                <StatCard
                  title="Eficiência cluster"
                  value={Math.round(routeMetrics?.clusterEfficiencyIndex ?? 0)}
                  suffix="%"
                  icon={MapPinned}
                />
                <StatCard
                  title="Score médio"
                  value={Math.round(routeMetrics?.averageQualityScore ?? 0)}
                  icon={Gauge}
                />
                <StatCard
                  title="Métricas gravadas"
                  value={routeMetrics?.routeMetricCount ?? 0}
                  icon={Route}
                />
                <StatCard
                  title="Correções do fiscal"
                  value={routeMetrics?.routeOutcomes?.correctedCount ?? 0}
                  icon={ShieldCheck}
                />
                <StatCard
                  title="Bloqueios fiscal"
                  value={routeMetrics?.routeOutcomes?.blockedCount ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Revisitas"
                  value={routeMetrics?.issues?.regionRevisited ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Saídas prematuras"
                  value={routeMetrics?.issues?.prematureRegionExit ?? 0}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Paradas puladas"
                  value={routeMetrics?.issues?.nearbyStopSkipped ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Cruzamentos"
                  value={routeMetrics?.issues?.routeCrossing ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Clusters médio"
                  value={Math.round(routeMetrics?.averageClusterCount ?? 0)}
                  icon={MapPinned}
                />
                <StatCard
                  title="Runtime médio"
                  value={Math.round(routeMetrics?.averageOptimizationRuntimeSeconds ?? 0)}
                  suffix="s"
                  icon={Activity}
                />
                <StatCard
                  title="Rotas particionadas"
                  value={routeMetrics?.partitioning?.partitionedRouteCount ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="Taxa particionada"
                  value={Math.round(routeMetrics?.partitioning?.partitionedRouteRate ?? 0)}
                  suffix="%"
                  icon={Gauge}
                />
                <StatCard
                  title="Média partições"
                  value={Math.round(routeMetrics?.partitioning?.averagePartitionCount ?? 0)}
                  icon={Route}
                />
                <StatCard
                  title="Maior partição"
                  value={routeMetrics?.partitioning?.largestPartitionSize ?? 0}
                  icon={MapPinned}
                />
                <StatCard
                  title="KM economizados"
                  value={Math.round(routeMetrics?.commercialImpact?.estimatedKmSaved ?? 0)}
                  icon={MapPinned}
                />
                <StatCard
                  title="Tempo economizado"
                  value={Math.round(routeMetrics?.commercialImpact?.estimatedMinutesSaved ?? 0)}
                  suffix="min"
                  icon={Activity}
                />
                <StatCard
                  title="Combustível"
                  value={Math.round(routeMetrics?.commercialImpact?.estimatedFuelLitersSaved ?? 0)}
                  suffix="L"
                  icon={Gauge}
                />
                <StatCard
                  title="CO2 evitado"
                  value={Math.round(routeMetrics?.commercialImpact?.estimatedCo2KgAvoided ?? 0)}
                  suffix="kg"
                  icon={ShieldCheck}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Métricas dos últimos 30 dias gravadas em route_metrics a cada
                otimização, reotimização ou bloqueio do fiscal.
              </p>
              <div className="mt-5 rounded-lg border border-border/80 p-4">
                <p className="text-sm font-medium">
                  Distribuicao de confianca dos enderecos
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-5">
                  {confidenceDistributionItems(
                    routeMetrics?.geocodingConfidence?.scoreDistribution
                  ).map((item) => (
                    <div key={item.label} className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-2xl font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 overflow-x-auto rounded-lg border border-border/80">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Modo</th>
                      <th className="px-3 py-2 font-medium">Rotas</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">KM medio</th>
                      <th className="px-3 py-2 font-medium">Tempo medio</th>
                      <th className="px-3 py-2 font-medium">Correcao</th>
                      <th className="px-3 py-2 font-medium">Fallback OSRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(routeMetrics?.modePerformance ?? []).map((item: any) => (
                      <tr key={item.mode} className="border-t border-border/80">
                        <td className="px-3 py-2 font-medium">
                          {modeLabel(item.mode)}
                        </td>
                        <td className="px-3 py-2">{item.routeMetricCount ?? 0}</td>
                        <td className="px-3 py-2">
                          {Math.round(item.averageQualityScore ?? 0)}
                        </td>
                        <td className="px-3 py-2">
                          {Number(item.averageDistanceKm ?? 0).toFixed(1)}
                        </td>
                        <td className="px-3 py-2">
                          {Math.round(item.averageTimeMinutes ?? 0)} min
                        </td>
                        <td className="px-3 py-2">
                          {Math.round(item.auditorCorrectionRate ?? 0)}%
                        </td>
                        <td className="px-3 py-2">
                          {Math.round(item.osrmFallbackRate ?? 0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <Card>
            <CardHeader>
              <CardTitle>Eventos recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {eventsQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-lg" />
                ))
              ) : eventsQuery.isError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">
                    Falha ao carregar eventos.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {eventsQuery.error?.message ||
                      "Eventos ficam em consulta separada para manter o painel rapido."}
                  </p>
                </div>
              ) : recentEvents.length ? (
                recentEvents.map((event: any) => (
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
