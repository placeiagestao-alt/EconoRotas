import { invokeLLM } from "./_core/llm";
import * as db from "./db";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

function formatDistanceKm(value: unknown) {
  const distance = Number(value);
  return Number.isFinite(distance) ? distance.toFixed(2) : "N/A";
}

/**
 * Build context from user's routes for the LLM
 */
async function buildRouteContext(userId: number, routeId?: number): Promise<string> {
  const routes = await db.getUserRoutes(userId);
  
  if (routes.length === 0) {
    return "O usuário ainda não tem rotas criadas.";
  }

  let context = `O usuário tem ${routes.length} rotas criadas:\n`;

  if (routeId) {
    const route = routes.find((r: any) => r.id === routeId);
    if (route) {
      const stops = await db.getRouteStops(routeId);
      context += `\nRota Selecionada: ${route.name}\n`;
      context += `- Modo: ${route.mode}\n`;
      context += `- Distância Total: ${route.totalDistance ? parseFloat(String(route.totalDistance)).toFixed(2) : "N/A"} km\n`;
      context += `- Tempo Total: ${route.totalTime || "N/A"} minutos\n`;
      context += `- Status: ${route.status}\n`;
      context += `- Paradas: ${stops.length}\n`;
    }
  } else {
    context += routes
      .map((r: any) => `- ${r.name} (${r.mode}, ${formatDistanceKm(r.totalDistance)} km)`)
      .join("\n");
  }

  const stats = await db.getUserStats(userId);
  if (stats) {
    context += `\n\nEstatísticas do Usuário:\n`;
    context += `- Total de Rotas: ${stats.totalRoutes}\n`;
    context += `- Distância Total: ${stats.totalDistance ? parseFloat(String(stats.totalDistance)).toFixed(2) : "0"} km\n`;
    context += `- Tempo Médio: ${stats.avgTime ? parseFloat(String(stats.avgTime)).toFixed(0) : "0"} minutos\n`;
    context += `- Rotas Concluídas: ${stats.completedRoutes}\n`;
  }

  return context;
}

function buildFallbackAssistantResponse(routeContext: string) {
  return [
    "No momento o assistente de IA não conseguiu acessar o provedor externo, mas o EconoRotas continua operacional.",
    "",
    "Resumo disponível:",
    routeContext,
    "",
    "Recomendações práticas:",
    "- confira se todos os endereços têm número, bairro, cidade e UF;",
    "- use a otimização por distância para reduzir deslocamento;",
    "- revise paradas sem coordenadas antes de iniciar a rota;",
    "- escolha Google Maps ou Waze no menu lateral antes de abrir a navegação.",
  ].join("\n");
}

/**
 * Send a message to the LLM with route context
 */
export async function chatWithLLM(
  userId: number,
  userMessage: string,
  routeId?: number,
  previousMessages: Message[] = []
): Promise<string> {
  let routeContext = "";

  try {
    // Build context from user's routes
    routeContext = await buildRouteContext(userId, routeId);

    // Prepare messages for LLM
    const messages: Message[] = [
      {
        role: "system",
        content: `Você é um assistente especializado em otimização de rotas e logística. 
Você ajuda usuários a criar, otimizar e gerenciar suas rotas de entrega.

Informações sobre o usuário:
${routeContext}

Responda de forma clara, concisa e útil. Se o usuário perguntar sobre otimização de rotas, 
forneça recomendações práticas baseadas em seus dados. Use markdown para formatar respostas.`,
      },
      ...previousMessages,
      {
        role: "user",
        content: userMessage,
      },
    ];

    // Call LLM
    const response = await invokeLLM({
      messages,
    });

    // Extract response text
    const content = response.choices?.[0]?.message?.content;
    const assistantMessage = typeof content === "string" 
      ? content 
      : "Desculpe, não consegui processar sua mensagem.";

    return assistantMessage;
  } catch (error) {
    console.error("[Chat] LLM Error:", error);
    return buildFallbackAssistantResponse(
      routeContext || "Não foi possível carregar o contexto das rotas agora."
    );
  }
}

/**
 * Format chat history for LLM context
 */
export function formatChatHistory(messages: any[]): Message[] {
  return messages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  }));
}
