export default function handler(_req: any, res: any) {
  const isVercel = Boolean(
    process.env.VERCEL || process.env.VERCEL_URL || process.env.NOW_REGION
  );
  const hasPersistentDb = Boolean(process.env.DATABASE_URL);
  const allowEphemeralDb = process.env.ALLOW_EPHEMERAL_DB === "true" || isVercel;
  const hasJwtSecret = Boolean(process.env.JWT_SECRET || isVercel);

  res.statusCode = hasJwtSecret && (hasPersistentDb || allowEphemeralDb) ? 200 : 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: res.statusCode === 200,
      app: "EconoRotas",
      environment: process.env.NODE_ENV || "unknown",
      config: {
        JWT_SECRET: hasJwtSecret ? "configured" : "missing",
        DATABASE_URL: hasPersistentDb ? "configured" : "missing",
        DATABASE_SSL: process.env.DATABASE_SSL === "true" ? "true" : "false",
        ALLOW_EPHEMERAL_DB: allowEphemeralDb ? "true" : "false",
      },
      timestamp: new Date().toISOString(),
    })
  );
}
