import fs from "node:fs";
import dotenv from "dotenv";
import mysql, { type RowDataPacket } from "mysql2/promise";

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

function readPositiveIntegerArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getMysqlDriverUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("ssl")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function shouldUseSsl(databaseUrl: string) {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  return /ssl-mode=required|tidbcloud|aivencloud|planetscale|railway/i.test(
    databaseUrl
  );
}

function parseMetadata(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeMode(value: unknown) {
  return ["shortest_distance", "shortest_time", "balanced"].includes(String(value))
    ? (String(value) as "shortest_distance" | "shortest_time" | "balanced")
    : "balanced";
}

function normalizeLocalityMode(value: unknown) {
  return ["balanced", "local", "strict"].includes(String(value))
    ? (String(value) as "balanced" | "local" | "strict")
    : undefined;
}

function normalizeExcludeStopIds(value: unknown) {
  return Array.isArray(value)
    ? value.map(Number).filter(item => Number.isFinite(item) && item > 0)
    : [];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const staleMinutes = readPositiveIntegerArg("stale-minutes", 15);
  const expireDays = readPositiveIntegerArg("expire-days", 7);
  const loadedFrom = loadEnvironment();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL nao configurado.");

  const pool = mysql.createPool({
    uri: getMysqlDriverUrl(databaseUrl),
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
    ssl: shouldUseSsl(databaseUrl)
      ? {
          minVersion: "TLSv1.2",
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
        }
      : undefined,
  });

  const {
    enqueueOptimizationJob,
    getOptimizationQueue,
    closeOptimizationQueueConnections,
  } = await import("../server/optimizationQueue");
  const { createOperationalEvent, updateOptimizationJob } = await import("../server/db");

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          id,
          route_id AS routeId,
          user_id AS userId,
          provider_job_id AS providerJobId,
          metadata,
          created_at AS createdAt,
          TIMESTAMPDIFF(SECOND, created_at, NOW()) AS queuedSeconds
        FROM optimization_jobs
        WHERE status = 'queued'
          AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
        ORDER BY created_at ASC
        LIMIT 500
      `,
      [staleMinutes]
    );

    const queue = getOptimizationQueue();
    const actions: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const id = Number(row.id);
      const routeId = Number(row.routeId);
      const userId = Number(row.userId);
      const providerJobId = row.providerJobId ? String(row.providerJobId) : "";
      const queuedSeconds = Number(row.queuedSeconds || 0);
      const metadata = parseMetadata(row.metadata);
      const ageDays = queuedSeconds / 86_400;

      if (ageDays >= expireDays) {
        actions.push({
          action: "expire",
          optimizationJobId: id,
          routeId,
          userId,
          queuedSeconds,
          reason: `queued ha ${Math.round(ageDays)} dias`,
        });

        if (apply) {
          await updateOptimizationJob(id, {
            status: "failed",
            finishedAt: new Date(),
            errorMessage:
              "Job expirado pela reconciliacao: estava em queued sem execucao e sem job ativo na fila.",
            metadata: {
              ...metadata,
              reconciledAt: new Date().toISOString(),
              reconciliationAction: "expired_stale_queued_job",
              queuedSeconds,
            },
          });
          await createOperationalEvent({
            userId: Number.isFinite(userId) ? userId : null,
            routeId: Number.isFinite(routeId) ? routeId : null,
            stopId: null,
            type: "optimization_job_expired",
            severity: "warning",
            source: "optimization.queue.reconcile",
            title: "Job antigo expirado da fila",
            message: `Job ${id} estava em queued ha ${Math.round(ageDays)} dias e foi marcado como falha operacional.`,
            metadata: {
              optimizationJobId: id,
              routeId,
              queuedSeconds,
              providerJobId: providerJobId || null,
            },
          });
        }
        continue;
      }

      const existingProviderJob = providerJobId && queue
        ? await queue.getJob(providerJobId).catch(() => null)
        : null;
      if (existingProviderJob) {
        actions.push({
          action: "keep",
          optimizationJobId: id,
          routeId,
          providerJobId,
          queuedSeconds,
          reason: "provider job ainda existe",
        });
        continue;
      }

      actions.push({
        action: "requeue",
        optimizationJobId: id,
        routeId,
        userId,
        providerJobId: providerJobId || null,
        queuedSeconds,
      });

      if (apply) {
        const providerJob = await enqueueOptimizationJob({
          optimizationJobId: id,
          routeId,
          userId,
          mode: normalizeMode(metadata.routeMode),
          localityMode: normalizeLocalityMode(metadata.localityMode),
          respectInputSequence: Boolean(metadata.respectInputSequence),
          excludeStopIds: normalizeExcludeStopIds(metadata.excludeStopIds),
        });
        const nextProviderJobId = providerJob?.id ? String(providerJob.id) : null;
        await updateOptimizationJob(id, {
          providerJobId: nextProviderJobId,
          metadata: {
            ...metadata,
            reconciledAt: new Date().toISOString(),
            reconciliationAction: "requeued_missing_provider_job",
            previousProviderJobId: providerJobId || null,
            providerJobId: nextProviderJobId,
            queuedSeconds,
          },
        });
        await createOperationalEvent({
          userId: Number.isFinite(userId) ? userId : null,
          routeId: Number.isFinite(routeId) ? routeId : null,
          stopId: null,
          type: "optimization_job_requeued",
          severity: "warning",
          source: "optimization.queue.reconcile",
          title: "Job reenfileirado",
          message: `Job ${id} estava em queued sem job BullMQ ativo e foi reenfileirado.`,
          metadata: {
            optimizationJobId: id,
            routeId,
            queuedSeconds,
            previousProviderJobId: providerJobId || null,
            providerJobId: nextProviderJobId,
          },
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          apply,
          env: { loadedFrom },
          staleMinutes,
          expireDays,
          scanned: rows.length,
          actions,
        },
        null,
        2
      )
    );
  } finally {
    await Promise.allSettled([pool.end(), closeOptimizationQueueConnections()]);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[QueueReconcile]", error instanceof Error ? error.message : error);
    process.exit(1);
  });
