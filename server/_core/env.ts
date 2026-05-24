const isVercel = process.env.VERCEL === "1";
const defaultDemoSecret =
  "econorotas_vercel_demo_session_secret_2026_placeia_gestao_64_chars";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? (isVercel ? defaultDemoSecret : ""),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
  isProduction: process.env.NODE_ENV === "production",
  allowEphemeralDb: process.env.ALLOW_EPHEMERAL_DB === "true" || isVercel,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
