import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { sdk } from "./_core/sdk";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(user?: AuthenticatedUser | null): { ctx: TrpcContext; clearedCookies: Array<{ name: string; options: Record<string, unknown> }> } {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];

  const defaultUser: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user: user === undefined ? defaultUser : user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("Authentication", () => {
  describe("local development user", () => {
    it("syncs dev-user before returning the authenticated user", async () => {
      const sessionToken = await sdk.createSessionToken("dev-user", {
        name: "Usuario Local",
      });
      const user = await sdk.authenticateRequest({
        headers: {
          cookie: `${COOKIE_NAME}=${sessionToken}`,
        },
      } as any);

      expect(user.openId).toBe("dev-user");
      expect(user.id).toBeGreaterThan(0);
      expect(user.role).toBe("admin");
    });
  });

  describe("auth.me", () => {
    it("returns current authenticated user", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.me();

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
      expect(result?.openId).toBe("sample-user");
      expect(result?.email).toBe("sample@example.com");
      expect(result?.name).toBe("Sample User");
      expect(result?.role).toBe("user");
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("returns null for unauthenticated user", async () => {
      const { ctx } = createAuthContext(null);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.me();

      expect(result).toBeNull();
    });
  });

  describe("auth.logout", () => {
    it("clears the session cookie and reports success", async () => {
      const { ctx, clearedCookies } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.logout();

      expect(result).toEqual({ success: true });
      expect(clearedCookies).toHaveLength(1);
      expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
      expect(clearedCookies[0]?.options).toMatchObject({
        maxAge: -1,
        secure: true,
        sameSite: "none",
        httpOnly: true,
        path: "/",
      });
    });

    it("works for authenticated user", async () => {
      const { ctx, clearedCookies } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.logout();

      expect(result.success).toBe(true);
      expect(clearedCookies).toHaveLength(1);
    });
  });

  describe("Protected Procedures", () => {
    it("routes.list requires authentication", async () => {
      const { ctx } = createAuthContext(null);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.routes.list();
        expect.fail("Should throw unauthorized error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("analytics.stats requires authentication", async () => {
      const { ctx } = createAuthContext(null);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.analytics.stats();
        expect.fail("Should throw unauthorized error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("chat.history requires authentication", async () => {
      const { ctx } = createAuthContext(null);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.chat.history({});
        expect.fail("Should throw unauthorized error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("schedules.list requires authentication", async () => {
      const { ctx } = createAuthContext(null);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.schedules.list();
        expect.fail("Should throw unauthorized error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("history.list requires authentication", async () => {
      const { ctx } = createAuthContext(null);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.history.list({});
        expect.fail("Should throw unauthorized error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("Admin Role", () => {
    it("identifies admin user correctly", async () => {
      const adminUser: AuthenticatedUser = {
        id: 2,
        openId: "admin-user",
        email: "admin@example.com",
        name: "Admin User",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      const { ctx } = createAuthContext(adminUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.me();

      expect(result?.role).toBe("admin");
    });

    it("regular user has user role", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.me();

      expect(result?.role).toBe("user");
    });
  });
});
