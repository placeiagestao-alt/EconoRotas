import { buildApiUrl } from "./lib/apiBase";
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const DEFAULT_TERMLY_GENERATOR_URL =
  "https://termly.io/products/privacy-policy-generator/";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL?.trim();
  const appId = import.meta.env.VITE_APP_ID?.trim();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const enableDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

  if (enableDevLogin) {
    return "/";
  }

  if ((!oauthPortalUrl || !appId) && !googleClientId) {
    return import.meta.env.DEV ? buildApiUrl("/api/dev/login") : "/";
  }

  return buildApiUrl("/api/oauth/login");
};

const ensureAbsoluteUrl = (rawUrl: string) => {
  if (!rawUrl) return rawUrl;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }

  return `https://${rawUrl}`;
};

export const getPrivacyPolicyUrl = () => {
  const configuredUrl = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() ?? "";
  return ensureAbsoluteUrl(configuredUrl || DEFAULT_TERMLY_GENERATOR_URL);
};

export const getTermlyPolicyGeneratorUrl = () =>
  DEFAULT_TERMLY_GENERATOR_URL;
