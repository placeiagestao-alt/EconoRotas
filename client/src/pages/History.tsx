import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function History() {
  const historyQuery = trpc.history.list.useQuery({ limit: 50 });
  const routesQuery = trpc.routes.list.useQuery();
  const history = historyQuery.data || [];
  const routes = routesQuery.data || [];

  const [exportedUrl, setExportedUrl] = useState<string | undefined>();

  const exportMutation = trpc.history.export.useMutation();

  const handleExportPDF = async () => {
    try {
      const fileName = `rotas_${new Date().toISOString().split("T")[0]}.pdf`;
      const result = await exportMutation.mutateAsync({
        format: "pdf",
        fileName,
      });
      setExportedUrl(result.url);
      toast.success("PDF exportado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao exportar PDF");
    }
  };

  const handleExportCSV = async () => {
    try {
      const fileName = `rotas_${new Date().toISOString().split("T")[0]}.csv`;
      const result = await exportMutation.mutateAsync({
        format: "csv",
        fileName,
      });
      setExportedUrl(result.url);
      toast.success("CSV exportado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao exportar CSV");
    }
  };

  const getRouteName = (routeId: number) => {
    return routes.find((r: any) => r.id === routeId)?.name || "Rota desconhecida";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-accent/20 text-accent border-accent/35";
      case "in_progress":
        return "bg-primary/20 text-primary border-primary/35";
      case "cancelled":
        return "bg-destructive/20 text-destructive border-destructive/35";
      default:
        return "bg-secondary text-muted-foreground border-border/70";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Concluída";
      case "in_progress":
        return "Em Progresso";
      case "cancelled":
        return "Cancelada";
      default:
        return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {exportedUrl && (
          <Card className="border-accent/40 bg-accent/10">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">Arquivo exportado com sucesso!</p>
                  <a
                    href={exportedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    Clique aqui para acessar o arquivo
                  </a>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setExportedUrl(undefined)}>
                  Fechar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Histórico de Rotas</h1>
            <p className="mt-1 text-muted-foreground">
              Visualize e exporte o histórico de execução das suas rotas
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleExportPDF}
              disabled={exportMutation.isPending}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {exportMutation.isPending ? "Exportando..." : "Exportar PDF"}
            </Button>
            <Button
              onClick={handleExportCSV}
              disabled={exportMutation.isPending}
              variant="outline"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {exportMutation.isPending ? "Exportando..." : "Exportar CSV"}
            </Button>
          </div>
        </div>

        {historyQuery.isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Carregando histórico...</p>
            </CardContent>
          </Card>
        ) : history.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Nenhuma rota executada ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {history.map((item: any) => (
              <Card key={item.id}>
                <CardContent className="pt-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{getRouteName(item.routeId)}</h3>
                        <Badge className={getStatusColor(item.status)}>
                          {getStatusLabel(item.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Executada em {new Date(item.executedDate).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
                      <p className="text-xs text-muted-foreground">Distância</p>
                      <p className="text-lg font-semibold text-foreground">
                        {item.actualDistance
                          ? parseFloat(String(item.actualDistance)).toFixed(2)
                          : "N/A"}{" "}
                        km
                      </p>
                    </div>
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                      <p className="text-xs text-muted-foreground">Tempo</p>
                      <p className="text-lg font-semibold text-foreground">
                        {item.actualTime || "N/A"} min
                      </p>
                    </div>
                    <div className="rounded-xl border border-accent/30 bg-accent/10 p-3">
                      <p className="text-xs text-muted-foreground">Velocidade Média</p>
                      <p className="text-lg font-semibold text-foreground">
                        {item.actualDistance && item.actualTime
                          ? (
                              (parseFloat(String(item.actualDistance)) / item.actualTime) *
                              60
                            ).toFixed(1)
                          : "N/A"}{" "}
                        km/h
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportPDF}
                      disabled={exportMutation.isPending}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Detalhes
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
