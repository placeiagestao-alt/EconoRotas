import { useMemo, useState } from "react";
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

const COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b"];

export default function Analytics() {
  const [days, setDays] = useState(30);
  
  const statsQuery = trpc.analytics.stats.useQuery({ days });
  const timelineQuery = trpc.analytics.timeline.useQuery({ days });

  const stats = statsQuery.data;
  const timeline = timelineQuery.data || [];

  // Format timeline data for chart
  const chartData = useMemo(() => {
    return timeline.map((item: any) => ({
      date: new Date(item.date).toLocaleDateString("pt-BR", { month: "short", day: "numeric" }),
      rotas: Number(item.count) || 0,
      distancia: parseFloat(String(item.totalDistance || 0)),
      tempo: Number(item.totalTime || 0),
    }));
  }, [timeline]);

  // Prepare data for mode distribution (mock)
  const modeDistribution = [
    { name: "Menor Distância", value: Math.round((stats?.totalRoutes || 0) * 0.4) },
    { name: "Menor Tempo", value: Math.round((stats?.totalRoutes || 0) * 0.35) },
    { name: "Balanceado", value: Math.round((stats?.totalRoutes || 0) * 0.25) },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard de Analytics</h1>
            <p className="text-muted-foreground mt-2">Visualize métricas e estatísticas de suas rotas</p>
          </div>
          
          {/* Date Range Filters */}
          <div className="flex gap-2">
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Total de Rotas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{stats?.totalRoutes || 0}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Rotas criadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Distância Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{(stats?.totalDistance || 0).toFixed(1)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">km percorridos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Tempo Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{(stats?.avgTime || 0).toFixed(0)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">minutos por rota</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Rotas Concluídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{stats?.completedRoutes || 0}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">executadas com sucesso</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Timeline Chart */}
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="rotas"
                      stroke="#3b82f6"
                      name="Rotas"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="distancia"
                      stroke="#06b6d4"
                      name="Distância (km)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mode Distribution */}
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
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {modeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Nenhuma rota criada ainda
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Distance vs Time Chart */}
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="distancia" fill="#3b82f6" name="Distância (km)" />
                  <Bar yAxisId="right" dataKey="tempo" fill="#06b6d4" name="Tempo (min)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Média de Distância por Rota:</span>{" "}
              {stats?.totalRoutes ? (stats.totalDistance / stats.totalRoutes).toFixed(2) : 0} km
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
