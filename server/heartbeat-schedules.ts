/**
 * Heartbeat Integration for Route Schedules
 * Handles automatic execution of scheduled routes and notifications
 */

import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import { routeSchedules, routeHistory, routes } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

/**
 * Execute scheduled routes that are due
 * Called by Heartbeat job
 */
export async function executeScheduledRoutes() {
  const db = await getDb();
  if (!db) {
    console.error("[Heartbeat] Database not available");
    return { executed: 0, failed: 0 };
  }

  try {
    const now = new Date();
    
    // Find all active schedules
    const activeSchedules = await db.select()
      .from(routeSchedules)
      .where(eq(routeSchedules.isActive, true));

    let executed = 0;
    let failed = 0;

    for (const schedule of activeSchedules) {
      try {
        // Check if schedule should execute
        const shouldExecute = checkScheduleExecution(schedule, now);
        
        if (!shouldExecute) continue;

        // Get the route
        const route = await db.select()
          .from(routes)
          .where(eq(routes.id, schedule.routeId))
          .limit(1);

        if (!route.length) {
          console.warn(`[Heartbeat] Route ${schedule.routeId} not found`);
          failed++;
          continue;
        }

        // Create history entry
        const historyResult = await db.insert(routeHistory)
          .values({
            routeId: schedule.routeId,
            userId: schedule.userId,
            executedDate: now,
            status: "in_progress" as const,
            actualDistance: route[0]?.totalDistance ? String(route[0].totalDistance) : "0",
            actualTime: route[0]?.totalTime || 0,
          });

        // Update schedule's next execution
        const nextExecution = calculateNextExecution(schedule, now);
        await db.update(routeSchedules)
          .set({
            lastExecuted: now,
            nextExecution,
          })
          .where(eq(routeSchedules.id, schedule.id));

        // Send notification
        await notifyOwner({
          title: "Rota Agendada Executada",
          content: `A rota "${route[0]?.name}" foi executada automaticamente. Distância: ${route[0]?.totalDistance}km, Tempo estimado: ${route[0]?.totalTime}min`,
        });

        executed++;
      } catch (error) {
        console.error(`[Heartbeat] Failed to execute schedule ${schedule.id}:`, error);
        failed++;
      }
    }

    return { executed, failed };
  } catch (error) {
    console.error("[Heartbeat] Error executing scheduled routes:", error);
    return { executed: 0, failed: -1 };
  }
}

/**
 * Check if a schedule should execute at the given time
 */
function checkScheduleExecution(schedule: any, now: Date): boolean {
  const scheduledDate = new Date(schedule.scheduledDate);
  const lastExecuted = schedule.lastExecuted ? new Date(schedule.lastExecuted) : null;

  switch (schedule.recurrenceType) {
    case "once":
      // Execute once if scheduled date has passed and not yet executed
      return scheduledDate <= now && !lastExecuted;

    case "daily":
      // Execute daily at scheduled time
      const [hours, minutes] = (schedule.scheduledTime || "09:00").split(":").map(Number);
      const scheduledTime = new Date(now);
      scheduledTime.setHours(hours, minutes, 0, 0);

      // Check if we should execute (daily and not executed today)
      if (now >= scheduledTime) {
        if (!lastExecuted) return true;
        const lastExecutedDate = new Date(lastExecuted);
        return lastExecutedDate.toDateString() !== now.toDateString();
      }
      return false;

    case "weekly":
      // Execute on specified days of week
      const daysOfWeek = schedule.daysOfWeek ? JSON.parse(schedule.daysOfWeek) : [];
      const currentDay = now.getDay();

      if (!daysOfWeek.includes(currentDay)) return false;

      // Check time
      const [h, m] = (schedule.scheduledTime || "09:00").split(":").map(Number);
      const weeklyTime = new Date(now);
      weeklyTime.setHours(h, m, 0, 0);

      if (now >= weeklyTime) {
        if (!lastExecuted) return true;
        const lastExecutedDate = new Date(lastExecuted);
        return lastExecutedDate.toDateString() !== now.toDateString();
      }
      return false;

    default:
      return false;
  }
}

/**
 * Calculate next execution time for a schedule
 */
function calculateNextExecution(schedule: any, now: Date): Date {
  const next = new Date(now);

  switch (schedule.recurrenceType) {
    case "once":
      // No next execution for one-time schedules
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year ahead

    case "daily":
      // Next execution is tomorrow at scheduled time
      next.setDate(next.getDate() + 1);
      const [hours, minutes] = (schedule.scheduledTime || "09:00").split(":").map(Number);
      next.setHours(hours, minutes, 0, 0);
      return next;

    case "weekly":
      // Next execution is on next occurrence of scheduled day
      const daysOfWeek = schedule.daysOfWeek ? JSON.parse(schedule.daysOfWeek) : [];
      const [h, m] = (schedule.scheduledTime || "09:00").split(":").map(Number);

      let daysToAdd = 1;
      while (daysToAdd <= 7) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + daysToAdd);
        if (daysOfWeek.includes(checkDate.getDay())) {
          checkDate.setHours(h, m, 0, 0);
          return checkDate;
        }
        daysToAdd++;
      }

      // Fallback: next week same day
      next.setDate(next.getDate() + 7);
      next.setHours(h, m, 0, 0);
      return next;

    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

/**
 * Setup Heartbeat job for schedule execution
 * This should be called during server initialization
 */
export async function setupHeartbeatSchedules() {
  try {
    // This would integrate with Manus Heartbeat API
    // For now, we'll log that it's ready
    console.log("[Heartbeat] Schedule execution ready");
    return true;
  } catch (error) {
    console.error("[Heartbeat] Failed to setup schedules:", error);
    return false;
  }
}
