import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const OAUTH_STATE_COOKIE_NAME = "oauth_state_nonce";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getCookie(req: Request, key: string) {
  const parsed = parseCookieHeader(req.headers.cookie ?? "");
  return parsed[key];
}

function buildRequestOrigin(req: Request): string | null {
  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedHostRaw = req.headers["x-forwarded-host"];

  const forwardedProto = Array.isArray(forwardedProtoRaw)
    ? forwardedProtoRaw[0]
    : forwardedProtoRaw?.split(",")[0];
  const forwardedHost = Array.isArray(forwardedHostRaw)
    ? forwardedHostRaw[0]
    : forwardedHostRaw?.split(",")[0];

  const protocol = (forwardedProto || req.protocol || "https").trim();
  const host = (forwardedHost || req.get("host") || "").trim();

  if (!host) return null;
  return `${protocol}://${host}`;
}

function buildOAuthRedirectUri(req: Request): string | null {
  if (ENV.publicAppUrl) {
    try {
      return new URL("/api/oauth/callback", ENV.publicAppUrl).toString();
    } catch {
      // fallback to request origin
    }
  }

  const origin = buildRequestOrigin(req);
  if (!origin) return null;
  return `${origin}/api/oauth/callback`;
}

function getOAuthPortalUrl() {
  const raw =
    process.env.OAUTH_PORTAL_URL?.trim() ||
    process.env.VITE_OAUTH_PORTAL_URL?.trim() ||
    "";

  if (!raw) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function createStatePayload(redirectUri: string, nonce: string) {
  return Buffer.from(
    JSON.stringify({
      redirectUri,
      nonce,
      issuedAt: Date.now(),
    })
  ).toString("base64url");
}

export function registerOAuthRoutes(app: Express) {
  if (!ENV.isProduction) {
    app.get("/api/dev/login", async (req: Request, res: Response) => {
      const sessionToken = await sdk.createSessionToken("dev-user", {
        name: "Usuário Local",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    });

    app.get("/api/dev/me", async (req: Request, res: Response) => {
      try {
        const user = await sdk.authenticateRequest(req);
        res.json({ user });
      } catch (error) {
        res.status(401).json({ error: String(error) });
      }
    });
  }

  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const oauthPortalUrl = getOAuthPortalUrl();

    if (!oauthPortalUrl || !ENV.appId) {
      if (!ENV.isProduction) {
        res.redirect(302, "/api/dev/login");
        return;
      }
      res.status(503).json({ error: "OAuth login is not configured" });
      return;
    }

    const redirectUri = buildOAuthRedirectUri(req);
    if (!redirectUri) {
      res.status(500).json({ error: "Unable to resolve OAuth redirect URI" });
      return;
    }

    const nonce = randomBytes(24).toString("hex");
    const state = createStatePayload(redirectUri, nonce);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(OAUTH_STATE_COOKIE_NAME, nonce, {
      ...cookieOptions,
      maxAge: OAUTH_STATE_MAX_AGE_MS,
    });

    const oauthUrl = new URL("/app-auth", oauthPortalUrl);
    oauthUrl.searchParams.set("appId", ENV.appId);
    oauthUrl.searchParams.set("redirectUri", redirectUri);
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("type", "signIn");

    res.redirect(302, oauthUrl.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const expectedNonce = getCookie(req, OAUTH_STATE_COOKIE_NAME);
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
      ...cookieOptions,
      path: "/",
    });

    if (!expectedNonce) {
      res.status(400).json({ error: "Invalid OAuth state (missing nonce)" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state, expectedNonce);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      if (error instanceof Error && error.message.includes("Invalid OAuth state")) {
        res.status(400).json({ error: "Invalid OAuth state" });
        return;
      }
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
