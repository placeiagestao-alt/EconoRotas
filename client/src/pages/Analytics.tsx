import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { MapPin, Clock, Zap, TrendingUp } from "lucide-react";

const COLORS = ["#2563eb", "#22c55e", "#38bdf8", "#14b8a6", "#93c5fd"];

export default function Analytics() {
  const [days, setDays] = useState(30);

  const statsQuery = trpc.analytics.stats.useQuery({ days });
  const timelineQuery = trpc.analytics.timeline.useQuery({ days });

  const stats = statsQuery.data;
  const timeline = timelineQuery.data || [];

  const chartData = useMemo(() => {
    return timeline.map((item: any) => ({
      date: new Date(item.date).toLocaleDateString("pt-BR", {
        month: "short",
        day: "numeric",
      }),
      rotas: Number(item.count) || 0,
      distancia: parseFloat(String(item.totalDistance || 0)),
      tempo: Number(item.totalTime || 0),
    }));
  }, [timeline]);

  const modeDistribution = [
    { name: "Menor Distância", value: Math.round((stats?.totalRoutes || 0) * 0.4) },
    { name: "Menor Tempo", value: Math.round((stats?.totalRoutes || 0) * 0.35) },
    { name: "Balanceado", value: Math.round((stats?.totalRoutes || 0) * 0.25) },
  ];

  const axisStyle = { stroke: "#94a3b8", fontSize: 12 };
  const tooltipStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #d9e3ef",
    borderRadius: "12px",
    color: "#0f172a",
    boxShadow: "0 12px 28px rgb(15 23 42 / 12%)",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Dashboard de Analytics</h1>
            <p className="mt-2 text-muted-foreground">
              Visualize métricas e estatísticas das suas rotas
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={days === 7 ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(7)}
            >
              Últimos 7 dias
            </Button>
            <Button
              variant={days === 30 ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(30)}
            >
              Últimos 30 dias
            </Button>
            <Button
              variant={days === 90 ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(90)}
            >
              Últimos 90 dias
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-primary/35 bg-gradient-to-br from-primary/15 to-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Total de Rotas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{stats?.totalRoutes || 0}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Rotas criadas</p>
            </CardContent>
          </Card>

          <Card className="border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Zap className="h-4 w-4" />
                Distância Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{(stats?.totalDistance || 0).toFixed(1)}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">km percorridos</p>
            </CardContent>
          </Card>

          <Card className="border-accent/35 bg-gradient-to-br from-accent/10 to-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                Tempo Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{(stats?.avgTime || 0).toFixed(0)}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">minutos por rota</p>
            </CardContent>
          </Card>

          <Card className="border-blue-400/25 bg-gradient-to-br from-blue-400/10 to-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Rotas Concluídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{stats?.completedRoutes || 0}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">executadas com sucesso</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Atividade nos Últimos {days} Dias</CardTitle>
            </CardHeader>
            <CardContent>
              {timelineQuery.isLoading ? (
                <Skeleton className="h-80" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#d9e3ef" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={axisStyle}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={axisStyle}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={axisStyle}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "#0f172a" }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="rotas"
                      stroke="#2563eb"
                      name="Rotas"
                      strokeWidth={2.5}
                      dot={{ r: 2 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="distancia"
                      stroke="#22c55e"
                      name="Distância (km)"
                      strokeWidth={2.5}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <BrandLogo variant="mark" className="h-16 w-16 opacity-90" />
                  <div>
                    <p className="font-medium text-foreground">
                      Nenhum dado disponível
                    </p>
                    <p className="text-sm">
                      Crie e execute rotas para visualizar a evolução.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribuição de Modos de Otimização</CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-80" />
              ) : (stats?.totalRoutes || 0) > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={modeDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={86}
                      dataKey="value"
                    >
                      {modeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "#f8fafc" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <BrandLogo variant="mark" className="h-16 w-16 opacity-90" />
                  <div>
                    <p className="font-medium text-foreground">
                      Nenhuma rota criada ainda
                    </p>
                    <p className="text-sm">
                      Os modos de otimização aparecem depois das primeiras rotas.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Distância vs Tempo por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {timelineQuery.isLoading ? (
              <Skeleton className="h-80" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                    <CartesianGrid stroke="#d9e3ef" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={axisStyle}
                    axisLine={{ stroke: "#cbd5e1" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={axisStyle}
                    axisLine={{ stroke: "#cbd5e1" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={axisStyle}
                    axisLine={{ stroke: "#cbd5e1" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#0f172a" }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="distancia"
                    fill="#2563eb"
                    name="Distância (km)"
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="tempo"
                    fill="#22c55e"
                    name="Tempo (min)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <BrandLogo variant="mark" className="h-16 w-16 opacity-90" />
                <div>
                  <p className="font-medium text-foreground">
                    Nenhum dado disponível
                  </p>
                  <p className="text-sm">
                    A comparação aparece quando houver histórico de execução.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Média de Distância por Rota:</span>{" "}
              {stats?.totalRoutes
                ? (stats.totalDistance / stats.totalRoutes).toFixed(2)
                : 0}{" "}
              km
            </p>
            <p>
              <span className="font-medium">Taxa de Conclusão:</span>{" "}
              {stats?.totalRoutes
                ? ((stats.completedRoutes / stats.totalRoutes) * 100).toFixed(1)
                : 0}
              %
            </p>
            <p>
              <span className="font-medium">Período Analisado:</span> Últimos {days} dias
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
