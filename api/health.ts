import { getDatabaseHealth } from "../server/db";

export default async function handler(_req: any, res: any) {
  const isProduction = process.env.NODE_ENV === "production";
  const hasPersistentDb = Boolean(process.env.DATABASE_URL);
  const allowEphemeralDb = process.env.ALLOW_EPHEMERAL_DB === "true";
  const jwtSecretLength = process.env.JWT_SECRET?.length ?? 0;
  const hasJwtSecret = jwtSecretLength > 0;
  const hasValidJwtSecret = !isProduction || jwtSecretLength >= 32;
  const dataMode = hasPersistentDb ? "persistent" : "ephemeral";
  const database = await getDatabaseHealth();
  const databaseAvailable = hasPersistentDb ? database.connected : allowEphemeralDb;

  res.statusCode =
    hasJwtSecret && hasValidJwtSecret && databaseAvailable
      ? 200
      : 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: res.statusCode === 200,
      app: "EconoRotas",
      environment: process.env.NODE_ENV || "unknown",
      mode: dataMode,
      database,
      config: {
        JWT_SECRET: process.env.JWT_SECRET
          ? "configured"
          : "missing",
        DATABASE_URL: hasPersistentDb ? "configured" : "missing",
        DATABASE_SSL: process.env.DATABASE_SSL === "true" ? "true" : "false",
        ALLOW_EPHEMERAL_DB: allowEphemeralDb ? "true" : "false",
      },
      warnings:
        [
          ...(dataMode === "ephemeral"
            ? ["Dados temporarios: configure DATABASE_URL para producao real."]
            : []),
          ...(!hasValidJwtSecret
            ? ["JWT_SECRET invalido: use ao menos 32 caracteres em producao."]
            : []),
        ],
      timestamp: new Date().toISOString(),
    })
  );
}
