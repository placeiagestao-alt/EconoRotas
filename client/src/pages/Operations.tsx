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
  const routeMetrics = (data as any)?.routeMetrics;
  const geocodingCache = (data as any)?.geocodingCache;
  const geocodingImpact = (data as any)?.geocodingImpact;
  const executiveReport = (data as any)?.geocodingExecutiveReport;
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
