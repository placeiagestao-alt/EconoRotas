import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import {
  buildPasswordOpenId,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "./passwordAuth";
import { sdk } from "./_core/sdk";
import { optimizeRoute, validateLocations, type Location } from "./optimization";
import { chatWithLLM, formatChatHistory } from "./chat";

function toOptionalLocation(
  address: unknown,
  latitudeValue: unknown,
  longitudeValue: unknown
): Location | undefined {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  return {
    address: typeof address === "string" ? address : undefined,
    latitude,
    longitude,
  };
}

async function requireUserRoute(routeId: number, userId: number) {
  const route = await db.getRouteById(routeId, userId);

  if (!route) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Rota nao encontrada.",
    });
  }

  return route;
}

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

function sanitizeUser<T extends User | null | undefined>(user: T) {
  if (!user) return null;

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function setPasswordSession(
  ctx: any,
  openId: string,
  name: string | null,
  email: string | null
) {
  const sessionToken = await sdk.createSessionToken(openId, {
    name: name || "",
    email,
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS,
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => sanitizeUser(opts.ctx.user)),
    login: publicProcedure.input(credentialsSchema)
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const user = await db.getUserByEmail(email);
        const isValidPassword = await verifyPassword(
          input.password,
          user?.passwordHash
        );

        if (!user || !isValidPassword) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha invalidos.",
          });
        }

        await db.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });
        await setPasswordSession(ctx, user.openId, user.name, user.email);

        return sanitizeUser((await db.getUserByOpenId(user.openId)) ?? user);
      }),
    register: publicProcedure.input(credentialsSchema.extend({
      name: z.string().min(2, "Informe seu nome."),
    }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const existingUser = await db.getUserByEmail(email);

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ja existe uma conta com este e-mail.",
          });
        }

        const usersCount = await db.countUsers();
        const ownerEmail = ENV.ownerEmail.trim().toLowerCase();
        const role = usersCount === 0 || (ownerEmail && ownerEmail === email)
          ? "admin"
          : "user";
        const passwordHash = await hashPassword(input.password);
        const openId = buildPasswordOpenId(email);
        const user = await db.createPasswordUser({
          openId,
          name: input.name.trim(),
          email,
          passwordHash,
          role,
        });

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Nao foi possivel criar a conta.",
          });
        }

        await setPasswordSession(ctx, user.openId, user.name, user.email);
        return sanitizeUser(user);
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  routes: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserRoutes(ctx.user.id)
    ),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(({ ctx, input }) =>
        db.getRouteById(input.id, ctx.user.id)
      ),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      mode: z.enum(["shortest_distance", "shortest_time", "balanced"]),
      startLocation: z.string().optional(),
      startLatitude: z.number().optional(),
      startLongitude: z.number().optional(),
      endLocation: z.string().optional(),
      endLatitude: z.number().optional(),
      endLongitude: z.number().optional(),
    }))
      .mutation(({ ctx, input }) =>
        db.createRoute(ctx.user.id, input)
      ),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      mode: z.enum(["shortest_distance", "shortest_time", "balanced"]).optional(),
      totalDistance: z.number().optional(),
      totalTime: z.number().optional(),
      status: z.enum(["draft", "optimized", "completed", "cancelled"]).optional(),
      startLocation: z.string().nullable().optional(),
      startLatitude: z.number().nullable().optional(),
      startLongitude: z.number().nullable().optional(),
      endLocation: z.string().nullable().optional(),
      endLatitude: z.number().nullable().optional(),
      endLongitude: z.number().nullable().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateRoute(id, ctx.user.id, data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) =>
        db.deleteRoute(input.id, ctx.user.id)
      ),
    optimize: protectedProcedure.input(z.object({
      id: z.number(),
      mode: z.enum(["shortest_distance", "shortest_time", "balanced"]).optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        const route = await db.getRouteById(input.id, ctx.user.id);
        if (!route) throw new Error("Route not found");

        const routeStops = await db.getRouteStops(input.id);
        if (routeStops.length === 0) throw new Error("Route has no stops");

        const locations: Location[] = routeStops.map((stop: any) => ({
          latitude: parseFloat(String(stop.latitude || 0)),
          longitude: parseFloat(String(stop.longitude || 0)),
          address: stop.address,
          notes: stop.notes ?? undefined,
        }));

        const validation = validateLocations(locations);
        if (!validation.valid) throw new Error(validation.error);

        const startLocation = toOptionalLocation(
          route.startLocation,
          route.startLatitude,
          route.startLongitude
        );
        const endLocation = toOptionalLocation(
          route.endLocation,
          route.endLatitude,
          route.endLongitude
        );
        const endpointValidation = validateLocations(
          [startLocation, endLocation].filter(Boolean) as Location[]
        );
        if ((startLocation || endLocation) && !endpointValidation.valid) {
          throw new Error(endpointValidation.error);
        }

        const mode = input.mode || route.mode;
        const optimized = optimizeRoute(locations, mode, 0, {
          startLocation,
          endLocation,
        });

        await db.updateRoute(input.id, ctx.user.id, {
          totalDistance: optimized.totalDistance,
          totalTime: optimized.totalTime,
          status: "optimized",
        });

        await db.deleteRouteStops(input.id);
        const updatedStops = optimized.waypoints.map(wp => ({
          address: wp.address || "",
          latitude: wp.latitude,
          longitude: wp.longitude,
          sequence: wp.sequence,
          notes: wp.notes,
        }));
        await db.createStops(input.id, updatedStops);

        return optimized;
      }),
  }),

  stops: router({
    list: protectedProcedure.input(z.object({ routeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.getRouteStops(input.routeId);
      }),
    create: protectedProcedure.input(z.object({
      routeId: z.number(),
      stops: z.array(z.object({
        address: z.string(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        sequence: z.number(),
        notes: z.string().optional(),
      })),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.createStops(input.routeId, input.stops);
      }),
  }),

  analytics: router({
    stats: protectedProcedure.input(z.object({ days: z.number().default(30) }))
      .query(({ ctx, input }) =>
        db.getUserStats(ctx.user.id, input.days)
      ),
    timeline: protectedProcedure.input(z.object({ days: z.number().default(30) }))
      .query(({ ctx, input }) =>
        db.getRouteStatsOverTime(ctx.user.id, input.days)
      ),
  }),

  chat: router({
    history: protectedProcedure.input(z.object({ routeId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (input.routeId !== undefined) {
          await requireUserRoute(input.routeId, ctx.user.id);
        }

        return db.getUserChatHistory(ctx.user.id, input.routeId);
      }),
    send: protectedProcedure.input(z.object({
      routeId: z.number().optional(),
      content: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        if (input.routeId !== undefined) {
          await requireUserRoute(input.routeId, ctx.user.id);
        }

        return db.addChatMessage(ctx.user.id, {
          routeId: input.routeId,
          role: "user",
          content: input.content,
        });
      }),
    respond: protectedProcedure.input(z.object({
      routeId: z.number().optional(),
      content: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        if (input.routeId !== undefined) {
          await requireUserRoute(input.routeId, ctx.user.id);
        }

        const history = await db.getUserChatHistory(ctx.user.id, input.routeId);
        const previousMessages = formatChatHistory(history);

        const response = await chatWithLLM(
          ctx.user.id,
          input.content,
          input.routeId,
          previousMessages
        );

        await db.addChatMessage(ctx.user.id, {
          routeId: input.routeId,
          role: "user",
          content: input.content,
        });

        await db.addChatMessage(ctx.user.id, {
          routeId: input.routeId,
          role: "assistant",
          content: response,
        });

        return response;
      }),
  }),

  schedules: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserSchedules(ctx.user.id)
    ),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(({ ctx, input }) =>
        db.getScheduleById(input.id, ctx.user.id)
      ),
    create: protectedProcedure.input(z.object({
      routeId: z.number(),
      recurrenceType: z.enum(["once", "daily", "weekly"]),
      scheduledDate: z.date(),
      scheduledTime: z.string().optional(),
      daysOfWeek: z.string().optional(),
      nextExecution: z.date().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.createSchedule(ctx.user.id, input);
      }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      isActive: z.boolean().optional(),
      nextExecution: z.date().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateSchedule(id, ctx.user.id, data);
      }),
  }),

  history: router({
    list: protectedProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
      .query(({ ctx, input }) =>
        db.getUserRouteHistory(ctx.user.id, input.limit, input.offset)
      ),
    getByRoute: protectedProcedure.input(z.object({ routeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.getRouteHistory(input.routeId, ctx.user.id);
      }),
    create: protectedProcedure.input(z.object({
      routeId: z.number(),
      actualDistance: z.number().optional(),
      actualTime: z.number().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        await requireUserRoute(input.routeId, ctx.user.id);
        return db.createHistory(ctx.user.id, input);
      }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
      actualDistance: z.number().optional(),
      actualTime: z.number().optional(),
      storageKey: z.string().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateHistory(id, ctx.user.id, data);
      }),
    export: protectedProcedure.input(z.object({
      format: z.enum(["pdf", "csv"]),
      fileName: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        const { exportHistoryToS3 } = await import("./export");
        return exportHistoryToS3(
          ctx.user.id,
          input.format,
          input.fileName,
          ctx.user.name || "Usuário"
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;
