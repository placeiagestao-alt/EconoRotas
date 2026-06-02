import { createOperationalEvent } from "../db";

const MONITOR_DEDUP_WINDOW_MS = 10 * 60 * 1000;

let lastIssueKey = "";
let lastIssueAt = 0;
let pendingOutage:
  | {
      key: string;
      firstSeenAt: string;
      lastSeenAt: string;
      message: string;
      metadata: Record<string, unknown>;
    }
  | null = null;

function getDatabaseState(database: any) {
  if (!database?.configured) return "unconfigured";
  if (database.connected) return "connected";
  if (database.reachable) return "schema_failed";
  return "unreachable";
}

function buildIssueKey(input: {
  database: any;
  fallbackStore: any;
  storageAvailable: boolean;
}) {
  const databaseState = getDatabaseState(input.database);
  const dbError = input.database?.error || input.database?.schema?.error || "";
  const fallbackError = input.fallbackStore?.error || "";
  return [
    input.storageAvailable ? "ok" : "down",
    databaseState,
    dbError,
    fallbackError,
  ].join("|");
}

function buildMetadata(input: {
  database: any;
  fallbackStore: any;
  storageAvailable: boolean;
  source: string;
}) {
  return {
    source: input.source,
    storageAvailable: input.storageAvailable,
    database: {
      configured: Boolean(input.database?.configured),
      reachable: Boolean(input.database?.reachable),
      connected: Boolean(input.database?.connected),
      ssl: Boolean(input.database?.ssl),
      error: input.database?.error ?? null,
      schema: input.database?.schema ?? null,
      pool: input.database?.pool ?? null,
    },
    fallbackStore: {
      configured: Boolean(input.fallbackStore?.configured),
      loaded: Boolean(input.fallbackStore?.loaded),
      error: input.fallbackStore?.error ?? null,
    },
  };
}

async function persistMonitorEvent(input: {
  type: string;
  severity: "info" | "warning" | "error" | "fatal";
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  try {
    await createOperationalEvent({
      userId: null,
      type: input.type,
      severity: input.severity,
      source: "system.monitor",
      title: input.title,
      message: input.message,
      runtime: "server",
      metadata: input.metadata,
    });
    return true;
  } catch (error) {
    console.warn("[Monitor] Failed to persist monitor event:", error);
    return false;
  }
}

export async function recordHealthObservation(input: {
  database: any;
  fallbackStore: any;
  storageAvailable: boolean;
  mode: string;
  source: string;
}) {
  const now = Date.now();
  const observedAt = new Date(now).toISOString();
  const issueKey = buildIssueKey(input);
  const metadata = {
    ...buildMetadata(input),
    mode: input.mode,
    observedAt,
  };

  if (input.storageAvailable) {
    if (!pendingOutage) {
      lastIssueKey = "";
      return;
    }

    const outage = pendingOutage;
    pendingOutage = null;
    lastIssueKey = "";

    await persistMonitorEvent({
      type: "system_health_recovered",
      severity: "info",
      title: "Armazenamento recuperado",
      message: `O armazenamento voltou a responder. Falha anterior: ${outage.message}`,
      metadata: {
        ...metadata,
        previousOutage: outage,
        recoveredAt: observedAt,
      },
    });
    return;
  }

  const message =
    input.database?.error ||
    input.database?.schema?.error ||
    input.fallbackStore?.error ||
    "Armazenamento indisponivel.";

  pendingOutage = pendingOutage
    ? {
        ...pendingOutage,
        lastSeenAt: observedAt,
        message,
        metadata,
      }
    : {
        key: issueKey,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        message,
        metadata,
      };

  console.warn("[Monitor] Storage unavailable:", {
    mode: input.mode,
    source: input.source,
    message,
  });

  if (issueKey === lastIssueKey && now - lastIssueAt < MONITOR_DEDUP_WINDOW_MS) {
    return;
  }

  lastIssueKey = issueKey;
  lastIssueAt = now;

  await persistMonitorEvent({
    type: "system_health_failed",
    severity: input.database?.reachable ? "error" : "fatal",
    title: "Armazenamento indisponivel",
    message,
    metadata,
  });
}
