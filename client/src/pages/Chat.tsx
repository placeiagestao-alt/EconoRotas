import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIChatBox } from "@/components/AIChatBox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { MessageSquare } from "lucide-react";

const ALL_ROUTES_VALUE = "__all_routes__";

export default function Chat() {
  const [selectedRouteId, setSelectedRouteId] = useState<number | undefined>();

  const routesQuery = trpc.routes.list.useQuery();
  const routes = routesQuery.data || [];

  const chatQuery = trpc.chat.history.useQuery({ routeId: selectedRouteId });
  const messages = chatQuery.data || [];

  const respondMutation = trpc.chat.respond.useMutation();

  const handleSendMessage = async (content: string) => {
    try {
      await respondMutation.mutateAsync({
        routeId: selectedRouteId,
        content,
      });

      await chatQuery.refetch();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Chat com IA</h1>
          <p className="mt-2 text-muted-foreground">
            Faça perguntas sobre suas rotas e receba suporte inteligente
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Contexto da Rota</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Selecione uma rota (opcional)</label>
                  <Select
                    value={selectedRouteId ? String(selectedRouteId) : ALL_ROUTES_VALUE}
                    onValueChange={(value) =>
                      setSelectedRouteId(
                        value === ALL_ROUTES_VALUE ? undefined : parseInt(value, 10)
                      )
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Todas as rotas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ROUTES_VALUE}>Todas as rotas</SelectItem>
                      {routes.map((route: any) => (
                        <SelectItem key={route.id} value={String(route.id)}>
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 border-t border-border/70 pt-4 text-sm">
                  <p className="font-medium">Dicas de Uso:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>- Pergunte sobre otimização de rotas</li>
                    <li>- Solicite análise de distâncias</li>
                    <li>- Peça recomendações de agendamento</li>
                    <li>- Tire dúvidas sobre a plataforma</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card className="flex h-[calc(100dvh-13rem)] min-h-[280px] max-h-[calc(100dvh-8.5rem)] flex-col gap-3 py-3 md:h-[620px] md:min-h-[620px] md:max-h-none md:gap-6 md:py-6">
              <CardHeader className="px-4 pb-1 sm:px-6">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Assistente IA
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden px-2 pb-2 sm:px-6 sm:pb-6">
                <AIChatBox
                  messages={messages.map((msg: any) => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: new Date(msg.createdAt),
                  }))}
                  onSendMessage={handleSendMessage}
                  isLoading={respondMutation.isPending || chatQuery.isLoading}
                  placeholder="Digite sua pergunta sobre rotas..."
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Otimização</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Pergunte sobre como otimizar suas rotas usando diferentes modos
              (distância, tempo e balanceado).
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Análise</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Solicite análises detalhadas de rotas, incluindo métricas de distância
              e tempo.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recomendações</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Receba recomendações personalizadas para aumentar eficiência
              operacional.
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
