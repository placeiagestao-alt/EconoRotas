import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import * as db from "../db";
import { isAdminEmail } from "./adminAccess";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const OAUTH_STATE_COOKIE_NAME = "oauth_state_nonce";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

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

function decodeStatePayload(state: string, expectedNonce: string) {
  const padded = state.replace(/-/g, "+").replace(/_/g, "/");
  const missingPadding = padded.length % 4;
  const normalized =
    missingPadding === 0 ? padded : `${padded}${"=".repeat(4 - missingPadding)}`;
  const parsed = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));

  if (
    typeof parsed.redirectUri !== "string" ||
    typeof parsed.nonce !== "string" ||
    parsed.nonce !== expectedNonce ||
    typeof parsed.issuedAt !== "number" ||
    Date.now() - parsed.issuedAt > OAUTH_STATE_MAX_AGE_MS
  ) {
    throw new Error("Invalid OAuth state");
  }

  return parsed.redirectUri as string;
}

function isGoogleOAuthConfigured() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret);
}

function getLoginProvider() {
  const configured = ENV.authLoginProvider.trim().toLowerCase();
  const googleConfigured = isGoogleOAuthConfigured();
  const legacyConfigured = Boolean(getOAuthPortalUrl() && ENV.appId);

  if (configured) {
    if (configured !== "google" && configured !== "legacy") {
      throw new Error("AUTH_LOGIN_PROVIDER deve ser google ou legacy.");
    }
    return configured as "google" | "legacy";
  }

  if (googleConfigured && !legacyConfigured) return "google";
  if (!googleConfigured && legacyConfigured) return "legacy";
  if (!googleConfigured && !legacyConfigured) return null;

  throw new Error(
    "AUTH_LOGIN_PROVIDER e obrigatorio quando Google e OAuth legado estao configurados."
  );
}

function assertConfiguredProvider(provider: "google" | "legacy") {
  if (provider === "google" && !isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth nao esta configurado.");
  }

  if (provider === "legacy" && (!getOAuthPortalUrl() || !ENV.appId)) {
    throw new Error("OAuth legado nao esta configurado.");
  }
}

async function exchangeGoogleCodeForUserInfo(
  code: string,
  state: string,
  expectedNonce: string
) {
  const redirectUri = decodeStatePayload(state, expectedNonce);
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || typeof tokenPayload.id_token !== "string") {
    throw new Error(
      `Google token exchange failed: ${tokenPayload.error_description || tokenPayload.error || tokenResponse.statusText}`
    );
  }

  const { payload } = await jwtVerify(tokenPayload.id_token, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUER,
    audience: ENV.googleClientId,
  });

  if (payload.nonce !== expectedNonce) {
    throw new Error("Google id_token nonce mismatch");
  }

  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Google id_token is missing required claims");
  }

  return {
    openId: `google_${payload.sub}`,
    name:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name
        : "Google User",
    email: payload.email,
    platform: "google",
    loginMethod: "google",
  };
}

async function exchangeLegacyCodeForUserInfo(
  code: string,
  state: string,
  expectedNonce: string
) {
  const tokenResponse = await sdk.exchangeCodeForToken(code, state, expectedNonce);
  return sdk.getUserInfo(tokenResponse.accessToken);
}

async function getOAuthUserInfo(
  provider: "google" | "legacy",
  code: string,
  state: string,
  expectedNonce: string
) {
  if (provider === "google") {
    return exchangeGoogleCodeForUserInfo(code, state, expectedNonce);
  }

  return exchangeLegacyCodeForUserInfo(code, state, expectedNonce);
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
    let provider: "google" | "legacy" | null;
    try {
      provider = getLoginProvider();
      if (!provider) throw new Error("OAuth login is not configured");
      assertConfiguredProvider(provider);
    } catch (error) {
      if (!ENV.isProduction && !isGoogleOAuthConfigured() && !getOAuthPortalUrl()) {
        res.redirect(302, "/api/dev/login");
        return;
      }
      res.status(503).json({
        error:
          error instanceof Error
            ? error.message
            : "OAuth login is not configured",
      });
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

    if (provider === "google") {
      const googleUrl = new URL(GOOGLE_AUTH_URL);
      googleUrl.searchParams.set("client_id", ENV.googleClientId);
      googleUrl.searchParams.set("redirect_uri", redirectUri);
      googleUrl.searchParams.set("response_type", "code");
      googleUrl.searchParams.set("scope", "openid email profile");
      googleUrl.searchParams.set("state", state);
      googleUrl.searchParams.set("nonce", nonce);
      googleUrl.searchParams.set("prompt", "select_account");

      res.redirect(302, googleUrl.toString());
      return;
    }

    const oauthPortalUrl = getOAuthPortalUrl();
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
      const provider = getLoginProvider();
      if (!provider) {
        res.status(503).json({ error: "OAuth login is not configured" });
        return;
      }
      assertConfiguredProvider(provider);
      const userInfo = await getOAuthUserInfo(provider, code, state, expectedNonce);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        role: isAdminEmail(userInfo.email ?? null, ENV.adminEmails) ? "admin" : "user",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        email: userInfo.email ?? null,
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
