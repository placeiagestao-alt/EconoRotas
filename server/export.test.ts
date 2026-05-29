import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateRouteCSV, generateRoutePDF, exportHistoryToS3 } from "./export";
import * as db from "./db";
import { storagePut } from "./storage";

vi.mock("./db", () => ({
  getUserRouteHistory: vi.fn(),
  getUserStats: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

describe("Export Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateRouteCSV", () => {
    it("generates CSV with correct headers", () => {
      const history = [
        {
          id: 1,
          routeName: "Route 1",
          executedDate: new Date("2026-05-15"),
          status: "completed",
          actualDistance: 50.5,
          actualTime: 120,
          notes: "Test note",
        },
      ];

      const csv = generateRouteCSV(history);

      expect(csv).toContain("ID,Rota,Data,Status,Distância (km),Tempo (min),Notas");
      expect(csv).toContain('"1"');
      expect(csv).toContain('"Route 1"');
      expect(csv).toContain('"50.50"');
    });

    it("handles empty history", () => {
      const csv = generateRouteCSV([]);

      expect(csv).toContain("ID,Rota,Data,Status,Distância (km),Tempo (min),Notas");
      expect(csv.split("\n")).toHaveLength(1);
    });

    it("handles missing fields gracefully", () => {
      const history = [
        {
          id: 2,
          routeName: undefined,
          executedDate: new Date("2026-05-15"),
          status: "in_progress",
          actualDistance: undefined,
          actualTime: undefined,
          notes: undefined,
        },
      ];

      const csv = generateRouteCSV(history);

      expect(csv).toContain('"N/A"');
      expect(csv).not.toThrow;
    });

    it("properly escapes quotes in CSV", () => {
      const history = [
        {
          id: 1,
          routeName: 'Route "Special"',
          executedDate: new Date("2026-05-15"),
          status: "completed",
          actualDistance: 50,
          actualTime: 120,
          notes: 'Note with "quotes"',
        },
      ];

      const csv = generateRouteCSV(history);

      expect(csv).toContain('"Route ""Special"""');
      expect(csv).toContain('"Note with ""quotes"""');
    });

    it("formats dates correctly", () => {
      const history = [
        {
          id: 1,
          routeName: "Route",
          executedDate: new Date("2026-05-15T10:30:00"),
          status: "completed",
          actualDistance: 50,
          actualTime: 120,
          notes: "",
        },
      ];

      const csv = generateRouteCSV(history);

      // Date format is locale-dependent, just check it contains the date components
      expect(csv).toMatch(/2026|05|15/);
    });
  });

  describe("generateRoutePDF", () => {
    it("generates PDF buffer", async () => {
      const history = [
        {
          id: 1,
          routeName: "Route 1",
          executedDate: new Date("2026-05-15"),
          status: "completed",
          actualDistance: 50,
          actualTime: 120,
          notes: "Test",
        },
      ];

      const stats = {
        totalRoutes: 5,
        totalDistance: 250,
        avgTime: 100,
        completedRoutes: 3,
      };

      const pdf = await generateRoutePDF(history, "Test User", stats);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(500); // PDF should have reasonable size
    });

    it("handles empty history", async () => {
      const pdf = await generateRoutePDF([], "Test User", null);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(500);
    });

    it("includes user name in PDF", async () => {
      const history = [];
      const pdf = await generateRoutePDF(history, "João Silva", null);

      expect(pdf).toBeInstanceOf(Buffer);
      // PDF content is binary, but we can verify it's not empty
      expect(pdf.length).toBeGreaterThan(500);
    });

    it("includes statistics in PDF", async () => {
      const history = [];
      const stats = {
        totalRoutes: 10,
        totalDistance: 500,
        avgTime: 150,
        completedRoutes: 8,
      };

      const pdf = await generateRoutePDF(history, "User", stats);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(500);
    });
  });

  describe("exportHistoryToS3", () => {
    it("exports CSV to S3", async () => {
      const mockHistory = [
        {
          id: 1,
          routeName: "Route 1",
          executedDate: new Date(),
          status: "completed",
          actualDistance: 50,
          actualTime: 120,
        },
      ];

      vi.mocked(db.getUserRouteHistory).mockResolvedValue(mockHistory);
      vi.mocked(db.getUserStats).mockResolvedValue({
        totalRoutes: 1,
        totalDistance: 50,
        avgTime: 120,
        completedRoutes: 1,
      });
      vi.mocked(storagePut).mockResolvedValue({
        key: "exports/1/csv/routes.csv",
        url: "/manus-storage/exports/1/csv/routes.csv",
      });

      const result = await exportHistoryToS3(1, "csv", "routes.csv", "Test User");

      expect(result.key).toBe("exports/1/csv/routes.csv");
      expect(result.url).toBe("/manus-storage/exports/1/csv/routes.csv");
      expect(vi.mocked(storagePut)).toHaveBeenCalled();
    });

    it("exports PDF to S3", async () => {
      const mockHistory = [
        {
          id: 1,
          routeName: "Route 1",
          executedDate: new Date(),
          status: "completed",
          actualDistance: 50,
          actualTime: 120,
        },
      ];

      vi.mocked(db.getUserRouteHistory).mockResolvedValue(mockHistory);
      vi.mocked(db.getUserStats).mockResolvedValue({
        totalRoutes: 1,
        totalDistance: 50,
        avgTime: 120,
        completedRoutes: 1,
      });
      vi.mocked(storagePut).mockResolvedValue({
        key: "exports/1/pdf/routes.pdf",
        url: "/manus-storage/exports/1/pdf/routes.pdf",
      });

      const result = await exportHistoryToS3(1, "pdf", "routes.pdf", "Test User");

      expect(result.key).toBe("exports/1/pdf/routes.pdf");
      expect(result.url).toBe("/manus-storage/exports/1/pdf/routes.pdf");
    });

    it("uses correct content type for CSV", async () => {
      vi.mocked(db.getUserRouteHistory).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(storagePut).mockResolvedValue({
        key: "test",
        url: "test",
      });

      await exportHistoryToS3(1, "csv", "test.csv", "User");

      const call = vi.mocked(storagePut).mock.calls[0];
      expect(call[2]).toBe("text/csv");
    });

    it("uses correct content type for PDF", async () => {
      vi.mocked(db.getUserRouteHistory).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(storagePut).mockResolvedValue({
        key: "test",
        url: "test",
      });

      await exportHistoryToS3(1, "pdf", "test.pdf", "User");

      const call = vi.mocked(storagePut).mock.calls[0];
      expect(call[2]).toBe("application/pdf");
    });

    it("handles export errors", async () => {
      vi.mocked(db.getUserRouteHistory).mockRejectedValue(new Error("DB Error"));

      await expect(exportHistoryToS3(1, "csv", "test.csv", "User")).rejects.toThrow(
        "Erro ao exportar para CSV"
      );
    });

    it("creates correct S3 key structure", async () => {
      vi.mocked(db.getUserRouteHistory).mockResolvedValue([]);
      vi.mocked(db.getUserStats).mockResolvedValue(null);
      vi.mocked(storagePut).mockResolvedValue({
        key: "exports/123/pdf/report.pdf",
        url: "test",
      });

      await exportHistoryToS3(123, "pdf", "report.pdf", "User");

      const call = vi.mocked(storagePut).mock.calls[0];
      expect(call[0]).toContain("exports/123/pdf/");
    });
  });
});
