import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { isAdminEmail } from "./adminAccess";
import { isApprovedAccountStatus } from "../../shared/accountAccess";
import * as db from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const isAdmin =
    ctx.user.role === "admin" && isAdminEmail(ctx.user.email, ENV.adminEmails);

  if (!isAdmin) {
    const settings = await db.getBetaAccessSettings();
    if (settings.maintenanceMode) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "O EconoRota esta em manutencao no momento.",
      });
    }

    if (!isApprovedAccountStatus((ctx.user as any).accountStatus)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seu cadastro ainda nao foi aprovado para acessar o app.",
      });
    }
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin' || !isAdminEmail(ctx.user.email, ENV.adminEmails)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
