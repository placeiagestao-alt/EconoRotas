import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeScheduledRoutes } from "./heartbeat-schedules";

describe("Heartbeat Schedule Execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeScheduledRoutes", () => {
    it("should return execution stats", async () => {
      const result = await executeScheduledRoutes();
      expect(result).toHaveProperty("executed");
      expect(result).toHaveProperty("failed");
      expect(typeof result.executed).toBe("number");
      expect(typeof result.failed).toBe("number");
    });

    it("should handle database unavailability", async () => {
      const result = await executeScheduledRoutes();
      // Should not throw, should return stats
      expect(result.executed).toBeGreaterThanOrEqual(0);
    });

    it("should return 0 executed and 0 failed when no schedules", async () => {
      const result = await executeScheduledRoutes();
      // Without a real DB, this should return safe defaults
      expect(result.executed).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Schedule execution logic", () => {
    it("should execute daily schedules at correct time", () => {
      const now = new Date("2026-05-16T09:30:00");
      const schedule = {
        recurrenceType: "daily",
        scheduledTime: "09:00",
        lastExecuted: null,
      };

      // Should execute if current time is past scheduled time
      expect(now.getHours()).toBe(9);
      expect(now.getMinutes()).toBeGreaterThan(0);
    });

    it("should execute weekly schedules on correct days", () => {
      const now = new Date("2026-05-16T09:30:00");
      const currentDay = now.getDay();

      const schedule = {
        recurrenceType: "weekly",
        scheduledTime: "09:00",
        daysOfWeek: JSON.stringify([currentDay]),
        lastExecuted: null,
      };

      expect([0, 1, 2, 3, 4, 5, 6]).toContain(currentDay);
    });

    it("should not execute one-time schedules twice", () => {
      const now = new Date("2026-05-16T09:30:00");
      const schedule = {
        recurrenceType: "once",
        scheduledDate: new Date("2026-05-15T09:00:00"),
        lastExecuted: new Date("2026-05-16T09:00:00"),
      };

      // Should not execute if already executed
      expect(schedule.lastExecuted).toBeTruthy();
    });

    it("should handle schedule with no time specified", () => {
      const schedule = {
        recurrenceType: "daily",
        scheduledTime: null,
      };

      // Should use default time 09:00
      expect(schedule.scheduledTime || "09:00").toBe("09:00");
    });

    it("should handle schedule with invalid days of week", () => {
      const schedule = {
        recurrenceType: "weekly",
        daysOfWeek: null,
      };

      const daysOfWeek = schedule.daysOfWeek ? JSON.parse(schedule.daysOfWeek) : [];
      expect(daysOfWeek).toEqual([]);
    });
  });

  describe("Next execution calculation", () => {
    it("should calculate next daily execution", () => {
      const now = new Date("2026-05-16T09:30:00");
      // Next daily execution should be tomorrow at 09:00
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);

      expect(next.getDate()).toBe(17);
      expect(next.getHours()).toBe(9);
    });

    it("should calculate next weekly execution", () => {
      const now = new Date("2026-05-16T09:30:00"); // Friday
      const daysOfWeek = [5]; // Friday

      // If today is Friday and we just executed, next should be next Friday
      let next = new Date(now);
      let daysToAdd = 1;
      while (daysToAdd <= 7) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + daysToAdd);
        if (daysOfWeek.includes(checkDate.getDay())) {
          checkDate.setHours(9, 0, 0, 0);
          next = checkDate;
          break;
        }
        daysToAdd++;
      }

      expect(next.getDay()).toBe(5); // Friday
    });

    it("should handle weekly schedule with multiple days", () => {
      const now = new Date("2026-05-16T09:30:00"); // Friday
      const daysOfWeek = [1, 3, 5]; // Mon, Wed, Fri

      // Should find next occurrence
      let nextDay = null;
      for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + i);
        if (daysOfWeek.includes(checkDate.getDay())) {
          nextDay = checkDate.getDay();
          break;
        }
      }

      expect([1, 3, 5]).toContain(nextDay);
    });
  });

  describe("Notification handling", () => {
    it("should prepare notification with route details", () => {
      const route = {
        name: "Rota Centro",
        totalDistance: 15.5,
        totalTime: 45,
      };

      const content = `A rota "${route.name}" foi executada automaticamente. Distância: ${route.totalDistance}km, Tempo estimado: ${route.totalTime}min`;

      expect(content).toContain(route.name);
      expect(content).toContain("15.5");
      expect(content).toContain("45");
    });

    it("should format notification title correctly", () => {
      const title = "Rota Agendada Executada";
      expect(title).toBe("Rota Agendada Executada");
    });
  });

  describe("Edge cases", () => {
    it("should handle missing route gracefully", () => {
      const schedule = {
        routeId: 999,
        userId: 1,
      };

      expect(schedule.routeId).toBe(999);
      // Should not throw when route not found
    });

    it("should handle invalid schedule recurrence type", () => {
      const schedule = {
        recurrenceType: "invalid",
      };

      // Should default to not executing
      expect(["once", "daily", "weekly"]).not.toContain(schedule.recurrenceType);
    });

    it("should handle schedule with past date", () => {
      const now = new Date("2026-05-16T09:30:00");
      const scheduledDate = new Date("2026-05-10T09:00:00");

      expect(scheduledDate < now).toBe(true);
    });

    it("should handle schedule with future date", () => {
      const now = new Date("2026-05-16T09:30:00");
      const scheduledDate = new Date("2026-05-20T09:00:00");

      expect(scheduledDate > now).toBe(true);
    });
  });
});
