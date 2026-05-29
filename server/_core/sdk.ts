import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  email?: string | null;
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

type OAuthStatePayload = {
  redirectUri: string;
  nonce: string;
  issuedAt?: number;
};

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    if (!ENV.oAuthServerUrl) {
      console.info("[OAuth] Disabled: OAUTH_SERVER_URL is not configured.");
      return;
    }

    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
  }

  private decodeState(state: string): OAuthStatePayload {
    const decodeBase64Url = () => {
      const padded = state.replace(/-/g, "+").replace(/_/g, "/");
      const missingPadding = padded.length % 4;
      const normalized =
        missingPadding === 0 ? padded : `${padded}${"=".repeat(4 - missingPadding)}`;
      return Buffer.from(normalized, "base64").toString("utf8");
    };

    const validateUrl = (urlString: string) => {
      try {
        const parsed = new URL(urlString);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    };

    try {
      const parsed = JSON.parse(decodeBase64Url()) as Partial<OAuthStatePayload>;
      if (
        typeof parsed.redirectUri !== "string" ||
        !validateUrl(parsed.redirectUri) ||
        typeof parsed.nonce !== "string" ||
        parsed.nonce.length < 16
      ) {
        throw new Error("Invalid OAuth state payload");
      }

      return {
        redirectUri: parsed.redirectUri,
        nonce: parsed.nonce,
        issuedAt: typeof parsed.issuedAt === "number" ? parsed.issuedAt : undefined,
      };
    } catch {
      // Legacy state format (base64 redirectUri) is kept for a smoother transition.
      const legacyRedirectUri = decodeBase64Url();
      if (!validateUrl(legacyRedirectUri)) {
        throw new Error("Invalid OAuth state payload");
      }
      return {
        redirectUri: legacyRedirectUri,
        nonce: "",
      };
    }
  }

  async getTokenByCode(
    code: string,
    state: string,
    expectedNonce: string
  ): Promise<ExchangeTokenResponse> {
    const decodedState = this.decodeState(state);
    if (!decodedState.nonce || decodedState.nonce !== expectedNonce) {
      throw new Error("Invalid OAuth state nonce");
    }

    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: decodedState.redirectUri,
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state, expectedNonce);
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    expectedNonce: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state, expectedNonce);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret =
      ENV.cookieSecret || (!ENV.isProduction ? "local-development-secret" : "");
    if (!secret) {
      throw new Error("JWT_SECRET is required for session signing");
    }
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; email?: string | null } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "econorotas",
        name: options.name || "",
        email: options.email ?? null,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      email: payload.email ?? null,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; email: string | null } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, email } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId,
        name,
        email: typeof email === "string" && email.length > 0 ? email : null,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    if (!ENV.isProduction && req.headers["x-dev-login"] === "true") {
      const devUser = buildDevUser();
      await db.upsertUser({
        openId: devUser.openId,
        name: devUser.name,
        email: devUser.email,
        loginMethod: devUser.loginMethod,
        role: devUser.role,
        lastSignedIn: new Date(),
      });
      return (await db.getUserByOpenId(devUser.openId)) ?? devUser;
    }

    // Regular authentication flow
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    if (!ENV.isProduction && session.openId === "dev-user") {
      const devUser = buildDevUser();
      await db.upsertUser({
        openId: devUser.openId,
        name: devUser.name,
        email: devUser.email,
        loginMethod: devUser.loginMethod,
        role: devUser.role,
        lastSignedIn: new Date(),
      });
      return (await db.getUserByOpenId(devUser.openId)) ?? devUser;
    }

    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    if (!user && session.openId.startsWith("pwd_") && ENV.allowEphemeralDb) {
      const ownerEmail = ENV.ownerEmail.trim().toLowerCase();
      const email = session.email?.trim().toLowerCase() || null;
      const usersCount = await db.countUsers();
      await db.upsertUser({
        openId: session.openId,
        name: session.name || null,
        email,
        loginMethod: "password",
        role: usersCount === 0 || (email && ownerEmail === email) ? "admin" : "user",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(session.openId);
    }

    // If user not in DB, sync from OAuth server automatically
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

const CRON_OPEN_ID_PREFIX = "cron_";

/** Result of `sdk.authenticateRequest`. Cron callbacks set `isCron=true` and `taskUid`; see `references/periodic-updates.md`. */
export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

function buildCronUser(
  userInfo: GetUserInfoWithJwtResponse
): AuthenticatedUser {
  const now = new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? undefined,
    isCron: true,
  } as AuthenticatedUser;
}

function buildDevUser(): AuthenticatedUser {
  const now = new Date();
  return {
    id: 1,
    openId: "dev-user",
    name: "Usuário Local",
    email: "dev@local.test",
    loginMethod: "local",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as AuthenticatedUser;
}

export const sdk = new SDKServer();
