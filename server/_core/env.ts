const hasConfiguredCookieSecret = Boolean(process.env.JWT_SECRET);

function isDockerOrLocalDatabaseUrl(value: string) {
  if (!value) return false;

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return [
      "mysql",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "host.docker.internal",
    ].includes(hostname);
  } catch {
    return true;
  }
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  hasConfiguredCookieSecret,
  usingDemoCookieSecret: false,
  databaseUrl: process.env.DATABASE_URL ?? "",
  databaseSsl: process.env.DATABASE_SSL ?? "",
  databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  authLoginProvider: process.env.AUTH_LOGIN_PROVIDER ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  adminEmails: [process.env.ADMIN_EMAILS, process.env.OWNER_EMAIL]
    .filter(Boolean)
    .join(","),
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
  isProduction: process.env.NODE_ENV === "production",
  hasInvalidProductionDatabaseUrl:
    process.env.NODE_ENV === "production" &&
    isDockerOrLocalDatabaseUrl(process.env.DATABASE_URL ?? ""),
  allowEphemeralDb: process.env.ALLOW_EPHEMERAL_DB === "true",
  requireManagedDatabase: process.env.REQUIRE_MANAGED_DATABASE === "true",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  androidUpdateLatestVersion: process.env.ANDROID_UPDATE_LATEST_VERSION ?? "",
  androidUpdateApkUrl: process.env.ANDROID_UPDATE_APK_URL ?? "",
  androidUpdateRequired: process.env.ANDROID_UPDATE_REQUIRED === "true",
  androidMinimumSupportedVersion:
    process.env.ANDROID_MINIMUM_SUPPORTED_VERSION ?? "",
  androidUpdateMessage: process.env.ANDROID_UPDATE_MESSAGE ?? "",
  androidUpdatePublishedAt: process.env.ANDROID_UPDATE_PUBLISHED_AT ?? "",
  imileApiBaseUrl: process.env.IMILE_API_BASE_URL ?? "",
  imileDeliveriesPath: process.env.IMILE_DELIVERIES_PATH ?? "",
  imileCustomerId: process.env.IMILE_CUSTOMER_ID ?? "",
  imileSign: process.env.IMILE_SIGN ?? "",
  imileAuthHeader: process.env.IMILE_AUTH_HEADER ?? "",
  imileAuthToken: process.env.IMILE_AUTH_TOKEN ?? "",
  imileCountry: process.env.IMILE_COUNTRY ?? "",
  imileLang: process.env.IMILE_LANG ?? "",
  imileResourceCode: process.env.IMILE_RESOURCE_CODE ?? "",
  imileTimezone: process.env.IMILE_TIMEZONE ?? "",
  imileHubCode: process.env.IMILE_HUB_CODE ?? "",
  imileAppVersion: process.env.IMILE_APP_VERSION ?? "",
  imileSourceName: process.env.IMILE_SOURCE_NAME ?? "",
  imileFallbackBaseUrls: process.env.IMILE_FALLBACK_BASE_URLS ?? "",
  imileCaptureUploadToken: process.env.IMILE_CAPTURE_UPLOAD_TOKEN ?? "",
  osrmEnabled:
    process.env.VITEST === "true" ? false : process.env.OSRM_ENABLED !== "false",
  osrmBaseUrl: process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org",
  osrmRequestTimeoutMs: Number(process.env.OSRM_REQUEST_TIMEOUT_MS || 8000),
  integrationCredentialsSecret:
    process.env.INTEGRATION_CREDENTIALS_SECRET ?? process.env.JWT_SECRET ?? "",
};
