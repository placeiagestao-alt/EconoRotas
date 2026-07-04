import fs from "node:fs";
import dotenv from "dotenv";
import IORedis from "ioredis";

function isLocalDatabaseUrl(value: string | undefined) {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "mysql", "host.docker.internal"].includes(
      hostname
    );
  } catch {
    return true;
  }
}

function loadEnvironment() {
  const configuredPath = process.env.DOTENV_CONFIG_PATH;
  if (configuredPath) {
    dotenv.config({ path: configuredPath, quiet: true });
    return configuredPath;
  }

  dotenv.config({ path: ".env", quiet: true });
  if (isLocalDatabaseUrl(process.env.DATABASE_URL) && fs.existsSync(".env.worker.production")) {
    dotenv.config({ path: ".env.worker.production", override: true, quiet: true });
    return ".env.worker.production";
  }

  return ".env";
}

function readRedisUrl() {
  return (
    process.env.BULLMQ_REDIS_URL?.trim() ||
    process.env.ECONOROTAS_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    ""
  );
}

function connectionOptions(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function sanitizeRedisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/rediss?:\/\/[^@\s]+@/gi, "redis://[redacted]@")
    .replace(/(password|token|auth)["':=\s]+[^,\s}\]]+/gi, "$1=[redacted]");
}

async function readPolicy(redis: IORedis) {
  const info = await redis.info("memory");
  const line = info
    .split(/\r?\n/)
    .find((entry) => entry.toLowerCase().startsWith("maxmemory_policy:"));
  return line?.split(":")[1]?.trim() || null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const loadedFrom = loadEnvironment();
  const redisUrl = readRedisUrl();
  if (!redisUrl) {
    throw new Error("BULLMQ_REDIS_URL, ECONOROTAS_REDIS_URL ou REDIS_URL nao configurado.");
  }

  const redis = new IORedis(connectionOptions(redisUrl));
  try {
    const before = await readPolicy(redis);
    let changed = false;
    let after = before;
    let error: string | null = null;

    if (before !== "noeviction" && apply) {
      try {
        await redis.config("SET", "maxmemory-policy", "noeviction");
        changed = true;
        after = await readPolicy(redis);
      } catch (configError) {
        error = sanitizeRedisError(configError);
      }
    }

    const ok = after === "noeviction";
    console.log(
      JSON.stringify(
        {
          ok,
          env: { loadedFrom },
          apply,
          changed,
          before,
          after,
          target: "noeviction",
          error,
          manualAction:
            !ok && error
              ? "Altere maxmemory-policy para noeviction no painel/API do Redis gerenciado."
              : null,
        },
        null,
        2
      )
    );

    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(`[Redis] ${sanitizeRedisError(error)}`);
    process.exit(1);
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

main().catch((error) => {
  console.error("[Redis]", sanitizeRedisError(error));
  process.exit(1);
});
