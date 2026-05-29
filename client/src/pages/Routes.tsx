import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, MapPin, Navigation, Plus } from "lucide-react";
import { Link } from "wouter";

function getStatusLabel(status: string) {
  switch (status) {
    case "optimized":
      return "Otimizada";
    case "completed":
      return "Concluída";
    case "cancelled":
      return "Cancelada";
    default:
      return "Rascunho";
  }
}

export default function Routes() {
  const routesQuery = trpc.routes.list.useQuery();
  const routes = routesQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight">Minhas Rotas</h1>
            <p className="text-muted-foreground">Gerencie, acompanhe e abra suas rotas em execução.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/routes/new">
              <Button variant="outline" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Importar tabela
              </Button>
            </Link>
            <Link href="/routes/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Rota
              </Button>
            </Link>
          </div>
        </div>

        {routesQuery.isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">
            Carregando rotas...
          </Card>
        ) : routesQuery.error ? (
          <Card className="p-8 text-center text-destructive">
            Não foi possível carregar suas rotas.
          </Card>
        ) : routes.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto flex max-w-md flex-col items-center gap-4">
              <BrandLogo variant="mark" className="h-24 w-24" />
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">
                  Nenhuma rota criada ainda
                </p>
                <p className="text-sm text-muted-foreground">
                  Comece criando uma rota manualmente ou importando uma tabela.
                </p>
              </div>
              <Link href="/routes/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Criar primeira rota
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {routes.map((route: any) => (
              <Card key={route.id}>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      {route.name}
                    </CardTitle>
                    {route.startLocation && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Início: {route.startLocation}
                      </p>
                    )}
                    {route.endLocation && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Fim: {route.endLocation}
                      </p>
                    )}
                  </div>
                  <Badge variant={route.status === "completed" ? "default" : "outline"}>
                    {getStatusLabel(route.status)}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span>
                      Distância: {route.totalDistance ? `${route.totalDistance} km` : "N/A"}
                    </span>
                    <span className="mx-2">•</span>
                    <span>Tempo: {route.totalTime ? `${route.totalTime} min` : "N/A"}</span>
                  </div>
                  <Link href={`/routes/${route.id}`}>
                    <Button className="gap-2">
                      <Navigation className="h-4 w-4" />
                      Abrir rota
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

