import { COOKIE_NAME } from "../shared/const";
import { afterEach, describe, expect, it } from "vitest";
import * as db from "./db";
import { createApp } from "./_core";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

const originalEnv = {
  adminEmails: ENV.adminEmails,
  databaseUrl: process.env.DATABASE_URL,
};

const ADMIN_EMAIL = "admin-security@example.com";
const USER_EMAIL = "regular-security@example.com";

function createServer() {
  const app = createApp({ serveClient: false });
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server failed to start");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function createSession(openId: string, email: string, role: "user" | "admin") {
  await db.upsertUser({
    openId,
    email,
    name: email,
    loginMethod: "test",
    role,
    lastSignedIn: new Date(),
  });
  const token = await sdk.createSessionToken(openId, {
    name: email,
    email,
  });
  return `${COOKIE_NAME}=${token}`;
}

describe("Admin REST security", () => {
  afterEach(() => {
    ENV.adminEmails = originalEnv.adminEmails;
    if (originalEnv.databaseUrl == null) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv.databaseUrl;
    }
  });

  it("protects every /api/admin endpoint from unauthenticated and regular users", async () => {
    ENV.adminEmails = ADMIN_EMAIL;
    delete process.env.DATABASE_URL;
    const server = createServer();
    const userCookie = await createSession("admin-security-user", USER_EMAIL, "user");
    const adminCookie = await createSession("admin-security-admin", ADMIN_EMAIL, "admin");
    const endpoints = [
      "/api/admin/dashboard",
      "/api/admin/events",
      "/api/admin/geocoding-impact",
      "/api/admin/geocoding-executive-report",
      "/api/admin/operation-execution-report",
      "/api/admin/workers",
      "/api/admin/queue-integrity",
      "/api/admin/disaster-readiness",
      "/api/admin/performance-benchmarks",
      "/api/admin/multi-vehicle-readiness",
    ];

    try {
      for (const endpoint of endpoints) {
        const anonymous = await fetch(`${server.url}${endpoint}`);
        expect(anonymous.status).toBe(401);

        const regular = await fetch(`${server.url}${endpoint}`, {
          headers: { Cookie: userCookie },
        });
        expect(regular.status).toBe(403);

        const admin = await fetch(`${server.url}${endpoint}`, {
          headers: { Cookie: adminCookie },
        });
        expect(admin.status).toBe(200);
      }
    } finally {
      await server.close();
    }
  });
});
