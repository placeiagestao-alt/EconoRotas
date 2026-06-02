import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerOAuthRoutes } from "./_core/oauth";
import { ENV } from "./_core/env";

const originalEnv = {
  authLoginProvider: ENV.authLoginProvider,
  googleClientId: ENV.googleClientId,
  googleClientSecret: ENV.googleClientSecret,
  publicAppUrl: ENV.publicAppUrl,
};

function createServer() {
  const app = express();
  registerOAuthRoutes(app);
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

function getCookieValue(setCookie: string | null, name: string) {
  return setCookie
    ?.split(/,\s*/)
    .flatMap((cookie) => cookie.split(";"))
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

describe("Google OAuth", () => {
  beforeEach(() => {
    ENV.authLoginProvider = "google";
    ENV.googleClientId = "google-client-id.test";
    ENV.googleClientSecret = "google-client-secret.test";
    ENV.publicAppUrl = "";
  });

  afterEach(() => {
    ENV.authLoginProvider = originalEnv.authLoginProvider;
    ENV.googleClientId = originalEnv.googleClientId;
    ENV.googleClientSecret = originalEnv.googleClientSecret;
    ENV.publicAppUrl = originalEnv.publicAppUrl;
    vi.restoreAllMocks();
  });

  it("redirects to Google with an OIDC nonce", async () => {
    const server = createServer();
    try {
      const response = await fetch(`${server.url}/api/oauth/login`, {
        redirect: "manual",
      });
      const location = response.headers.get("location");

      expect(response.status).toBe(302);
      expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");

      const params = new URL(location || "").searchParams;
      expect(params.get("client_id")).toBe(ENV.googleClientId);
      expect(params.get("scope")).toContain("openid");
      expect(params.get("nonce")).toMatch(/^[a-f0-9]{48}$/);
      expect(params.get("state")).toBeTruthy();
    } finally {
      await server.close();
    }
  });

  it("rejects Google callback when email_verified is false", async () => {
    const server = createServer();
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const kid = "google-test-key";
    const originalFetch = globalThis.fetch;

    try {
      const login = await fetch(`${server.url}/api/oauth/login`, {
        redirect: "manual",
      });
      const location = new URL(login.headers.get("location") || "");
      const nonce = location.searchParams.get("nonce") || "";
      const state = location.searchParams.get("state") || "";
      const stateCookie = getCookieValue(
        login.headers.get("set-cookie"),
        "oauth_state_nonce"
      );

      const idToken = await new SignJWT({
        sub: "google-user-1",
        email: "unverified@example.com",
        email_verified: false,
        name: "Unverified User",
        nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuer("https://accounts.google.com")
        .setAudience(ENV.googleClientId)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ id_token: idToken }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("www.googleapis.com/oauth2/v3/certs")) {
          return new Response(
            JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return originalFetch(input, init);
      });

      const callback = await fetch(
        `${server.url}/api/oauth/callback?code=test-code&state=${encodeURIComponent(state)}`,
        {
          redirect: "manual",
          headers: {
            Cookie: `oauth_state_nonce=${stateCookie}`,
          },
        }
      );

      expect(callback.status).toBe(500);
      expect(await callback.text()).toContain("OAuth callback failed");
    } finally {
      await server.close();
    }
  });
});
