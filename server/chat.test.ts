import { describe, expect, it, vi, beforeEach } from "vitest";
import { chatWithLLM, formatChatHistory, type Message } from "./chat";
import * as db from "./db";

// Mock the db module
vi.mock("./db", () => ({
  getUserRoutes: vi.fn(),
  getRouteStops: vi.fn(),
  getUserStats: vi.fn(),
  getUserChatHistory: vi.fn(),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

describe("Chat Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatChatHistory", () => {
    it("formats chat history correctly", () => {
      const messages = [
        { role: "user", content: "Hello", createdAt: new Date() },
        { role: "assistant", content: "Hi there", createdAt: new Date() },
      ];

      const formatted = formatChatHistory(messages);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({ role: "user", content: "Hello" });
      expect(formatted[1]).toEqual({ role: "assistant", content: "Hi there" });
    });

    it("handles empty history", () => {
      const formatted = formatChatHistory([]);
      expect(formatted).toEqual([]);
    });

    it("preserves message order", () => {
      const messages = [
        { role: "user", content: "First", createdAt: new Date() },
        { role: "assistant", content: "Response", createdAt: new Date() },
        { role: "user", content: "Second", createdAt: new Date() },
      ];

      const formatted = formatChatHistory(messages);

      expect(formatted[0].content).toBe("First");
      expect(formatted[1].content).toBe("Response");
      expect(formatted[2].content).toBe("Second");
    });
  });

  describe("chatWithLLM", () => {
    it("returns error message on LLM failure", async () => {
      const { invokeLLM } = await import("./_core/llm");
      vi.mocked(invokeLLM).mockRejectedValue(new Error("LLM Error"));
      vi.mocked(db.getUserRoutes).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);

      const result = await chatWithLLM(1, "Test message").catch((e) => e.message);

      expect(result).toBe("Erro ao processar mensagem com IA");
    });

    it("builds context from user routes", async () => {
      const { invokeLLM } = await import("./_core/llm");
      
      const mockRoutes = [
        { id: 1, name: "Route 1", mode: "balanced", totalDistance: "50.25" },
        { id: 2, name: "Route 2", mode: "shortest_distance", totalDistance: 30 },
      ];

      vi.mocked(db.getUserRoutes).mockResolvedValue(mockRoutes);
      vi.mocked(db.getRouteStops).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue({
        totalRoutes: 2,
        totalDistance: 80,
        avgTime: 45,
        completedRoutes: 1,
      });
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{ message: { content: "Test response" } }],
      } as any);

      const result = await chatWithLLM(1, "Tell me about my routes");

      expect(result).toBe("Test response");
      expect(vi.mocked(db.getUserRoutes)).toHaveBeenCalledWith(1);
    });

    it("includes route-specific context when routeId provided", async () => {
      const { invokeLLM } = await import("./_core/llm");

      vi.mocked(db.getUserRoutes).mockResolvedValue([
        { id: 1, name: "Route 1", mode: "balanced", totalDistance: 50 },
      ]);
      vi.mocked(db.getRouteStops).mockResolvedValue([
        { id: 1, address: "Stop 1", latitude: 0, longitude: 0, sequence: 0 },
        { id: 2, address: "Stop 2", latitude: 1, longitude: 1, sequence: 1 },
      ]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{ message: { content: "Route details" } }],
      } as any);

      await chatWithLLM(1, "Optimize this route", 1);

      expect(vi.mocked(db.getRouteStops)).toHaveBeenCalledWith(1);
    });

    it("includes previous messages in context", async () => {
      const { invokeLLM } = await import("./_core/llm");

      vi.mocked(db.getUserRoutes).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{ message: { content: "Continued response" } }],
      } as any);

      const previousMessages: Message[] = [
        { role: "user", content: "What is TSP?" },
        { role: "assistant", content: "TSP is the Traveling Salesman Problem..." },
      ];

      await chatWithLLM(1, "How does it apply to routing?", undefined, previousMessages);

      const callArgs = vi.mocked(invokeLLM).mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(4); // system + 2 previous + 1 new
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[1].content).toBe("What is TSP?");
    });

    it("handles LLM response with array content", async () => {
      const { invokeLLM } = await import("./_core/llm");

      vi.mocked(db.getUserRoutes).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{ message: { content: [{ type: "text", text: "Response" }] } }],
      } as any);

      const result = await chatWithLLM(1, "Test");

      expect(result).toBe("Desculpe, não consegui processar sua mensagem.");
    });

    it("handles missing response content", async () => {
      const { invokeLLM } = await import("./_core/llm");

      vi.mocked(db.getUserRoutes).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{ message: {} }],
      } as any);

      const result = await chatWithLLM(1, "Test");

      expect(result).toBe("Desculpe, não consegui processar sua mensagem.");
    });

    it("handles no choices in response", async () => {
      const { invokeLLM } = await import("./_core/llm");

      vi.mocked(db.getUserRoutes).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(invokeLLM).mockResolvedValue({ choices: [] } as any);

      const result = await chatWithLLM(1, "Test");

      expect(result).toBe("Desculpe, não consegui processar sua mensagem.");
    });
  });
});
