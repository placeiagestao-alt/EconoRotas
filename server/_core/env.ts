const hasConfiguredCookieSecret = Boolean(process.env.JWT_SECRET);

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  hasConfiguredCookieSecret,
  usingDemoCookieSecret: false,
  databaseUrl: process.env.DATABASE_URL ?? "",
  databaseSsl: process.env.DATABASE_SSL ?? "",
  databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
  isProduction: process.env.NODE_ENV === "production",
  allowEphemeralDb: process.env.ALLOW_EPHEMERAL_DB === "true",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  androidUpdateLatestVersion: process.env.ANDROID_UPDATE_LATEST_VERSION ?? "",
  androidUpdateApkUrl: process.env.ANDROID_UPDATE_APK_URL ?? "",
  androidUpdateRequired: process.env.ANDROID_UPDATE_REQUIRED === "true",
  androidMinimumSupportedVersion:
    process.env.ANDROID_MINIMUM_SUPPORTED_VERSION ?? "",
  androidUpdateMessage: process.env.ANDROID_UPDATE_MESSAGE ?? "",
  androidUpdatePublishedAt: process.env.ANDROID_UPDATE_PUBLISHED_AT ?? "",
};
