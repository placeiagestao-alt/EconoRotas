import { createOperationalEvent } from "../db";

const MONITOR_DEDUP_WINDOW_MS = 10 * 60 * 1000;

let lastIssueKey = "";
let lastIssueAt = 0;
let pendingOutage: {
  key: string;
  firstSeenAt: string;
  lastSeenAt: string;
  message: string;
  metadata: Record<string, unknown>;
} | null = null;

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
  osrm?: any;
  systemAvailable?: boolean;
}) {
  const databaseState = getDatabaseState(input.database);
  const dbError = input.database?.error || input.database?.schema?.error || "";
  const fallbackError = input.fallbackStore?.error || "";
  const osrmState = input.osrm?.enabled
    ? input.osrm.reachable
      ? "osrm_connected"
      : "osrm_unreachable"
    : "osrm_disabled";
  const osrmError = input.osrm?.error || "";
  return [
    (input.systemAvailable ?? input.storageAvailable) ? "ok" : "down",
    databaseState,
    dbError,
    fallbackError,
    osrmState,
    input.osrm?.status ?? "",
    input.osrm?.providerType ?? "",
    input.osrm?.required ? "required" : "optional",
    osrmError,
  ].join("|");
}

function buildMetadata(input: {
  database: any;
  fallbackStore: any;
  storageAvailable: boolean;
  source: string;
  osrm?: any;
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
    osrm: input.osrm
      ? {
          enabled: Boolean(input.osrm.enabled),
          required: Boolean(input.osrm.required),
          configured: Boolean(input.osrm.configured),
          configurationValid: Boolean(input.osrm.configurationValid),
          reachable: Boolean(input.osrm.reachable),
          usable: Boolean(input.osrm.usable),
          productionReady: Boolean(input.osrm.productionReady),
          providerType: input.osrm.providerType ?? "unconfigured",
          isPublic: Boolean(input.osrm.isPublic),
          baseUrl: input.osrm.baseUrl ?? null,
          profile: input.osrm.profile ?? null,
          status: input.osrm.status ?? null,
          reason: input.osrm.reason ?? null,
          fallbackPolicy: input.osrm.fallbackPolicy ?? null,
          timeoutMs: input.osrm.timeoutMs ?? null,
          requestTimeoutMs: input.osrm.requestTimeoutMs ?? null,
          error: input.osrm.error ?? null,
        }
      : null,
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
  systemAvailable?: boolean;
  mode: string;
  source: string;
  osrm?: any;
}) {
  const now = Date.now();
  const observedAt = new Date(now).toISOString();
  const issueKey = buildIssueKey(input);
  const metadata = {
    ...buildMetadata(input),
    mode: input.mode,
    observedAt,
  };
  const systemAvailable = input.systemAvailable ?? input.storageAvailable;

  if (systemAvailable) {
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
      title: "Sistema recuperado",
      message: `O sistema voltou a responder. Falha anterior: ${outage.message}`,
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
    input.osrm?.error ||
    "Sistema indisponivel.";

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

  console.warn("[Monitor] System unavailable:", {
    mode: input.mode,
    source: input.source,
    message,
  });

  if (
    issueKey === lastIssueKey &&
    now - lastIssueAt < MONITOR_DEDUP_WINDOW_MS
  ) {
    return;
  }

  lastIssueKey = issueKey;
  lastIssueAt = now;

  if (!input.storageAvailable) {
    return;
  }

  await persistMonitorEvent({
    type: "system_health_failed",
    severity: input.storageAvailable
      ? "error"
      : input.database?.reachable
        ? "error"
        : "fatal",
    title: input.storageAvailable
      ? "OSRM indisponivel"
      : "Armazenamento indisponivel",
    message,
    metadata,
  });
}
