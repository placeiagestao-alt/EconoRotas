import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIChatBox } from "@/components/AIChatBox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { MessageSquare } from "lucide-react";

export default function Chat() {
  const [selectedRouteId, setSelectedRouteId] = useState<number | undefined>();

  // Fetch user's routes for context
  const routesQuery = trpc.routes.list.useQuery();
  const routes = routesQuery.data || [];

  // Fetch chat history
  const chatQuery = trpc.chat.history.useQuery({ routeId: selectedRouteId });
  const messages = chatQuery.data || [];

  // Send message mutation
  const respondMutation = trpc.chat.respond.useMutation();

  const handleSendMessage = async (content: string) => {
    try {
      await respondMutation.mutateAsync({
        routeId: selectedRouteId,
        content,
      });

      // Refetch chat history
      await chatQuery.refetch();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Chat com IA</h1>
          <p className="text-muted-foreground mt-2">Faça perguntas sobre suas rotas e receba suporte inteligente</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar with route selection */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contexto da Rota</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Selecione uma rota (opcional)</label>
                  <Select
                    value={selectedRouteId ? String(selectedRouteId) : ""}
                    onValueChange={(value) => setSelectedRouteId(value ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Todas as rotas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas as rotas</SelectItem>
                      {routes.map((route: any) => (
                        <SelectItem key={route.id} value={String(route.id)}>
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4 border-t space-y-2 text-sm">
                  <p className="font-medium">Dicas de Uso:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Pergunte sobre otimização de rotas</li>
                    <li>• Solicite análise de distâncias</li>
                    <li>• Peça recomendações de agendamento</li>
                    <li>• Tire dúvidas sobre a plataforma</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat area */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Assistente IA
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
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

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Otimização</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Pergunte sobre como otimizar suas rotas usando diferentes modos (distância, tempo, balanceado).
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Análise</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Solicite análises detalhadas de suas rotas, incluindo métricas de distância e tempo.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recomendações</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Receba recomendações personalizadas para melhorar sua eficiência operacional.
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
