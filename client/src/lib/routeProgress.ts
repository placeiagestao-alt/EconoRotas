export type DeliveryProgressSnapshot = {
  started: boolean;
  currentIndex: number;
  delivered: number[];
  failed: number[];
};

export type DeliveryProgressLastAction = {
  stopIndex: number;
  result: "delivered" | "failed";
  previousState: DeliveryProgressSnapshot;
  createdAt: string;
};

export type DeliveryProgressState = {
  started: boolean;
  currentIndex: number;
  delivered: number[];
  failed: number[];
  lastAction?: DeliveryProgressLastAction | null;
};

export type LastRouteProgress = {
  routeId: number;
  routeName?: string;
  updatedAt: string;
};

export const LAST_ROUTE_PROGRESS_KEY = "econorotas:last-route-progress";

const BLOCKING_COHERENCE_ISSUE_TYPES = new Set([
  "nearby_stop_skipped",
  "region_revisited",
  "premature_region_exit",
]);

export function isRouteExecutionCoherenceBlocked(input: {
  routingStrategy?: string | null;
  operationalStatus?: string | null;
  sequenceCoherenceVerified?: boolean | null;
  auditIssues?: ReadonlyArray<{ type?: string; severity?: string }>;
}) {
  if (input.routingStrategy === "shopee_stop_sequence") return false;
  if (
    input.operationalStatus === "blocked" ||
    input.sequenceCoherenceVerified === false ||
    (input.operationalStatus === "attention_strong" &&
      input.sequenceCoherenceVerified !== true)
  ) {
    return true;
  }

  return Boolean(
    input.auditIssues?.some(
      issue =>
        BLOCKING_COHERENCE_ISSUE_TYPES.has(String(issue.type)) &&
        (issue.type !== "nearby_stop_skipped" ||
          issue.severity === "high" ||
          issue.severity === "critical")
    )
  );
}

export function getFirstPendingStopIndex(
  stopCount: number,
  delivered: readonly number[],
  failed: readonly number[]
) {
  const handled = new Set([...delivered, ...failed]);

  for (let index = 0; index < stopCount; index += 1) {
    if (!handled.has(index)) return index;
  }

  return -1;
}

export function getDeliveryStorageKey(routeId: number) {
  return `routing-pwa:route-delivery:${routeId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readDeliveryProgress(
  routeId: number
): DeliveryProgressState | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(getDeliveryStorageKey(routeId));
    return raw ? (JSON.parse(raw) as DeliveryProgressState) : null;
  } catch {
    return null;
  }
}

export function saveDeliveryProgress(
  routeId: number,
  state: DeliveryProgressState
) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(
    getDeliveryStorageKey(routeId),
    JSON.stringify(state)
  );
}

export function saveLastRouteProgress(routeId: number, routeName?: string) {
  if (!canUseStorage()) return;

  const payload: LastRouteProgress = {
    routeId,
    routeName,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(LAST_ROUTE_PROGRESS_KEY, JSON.stringify(payload));
}

export function readLastRouteProgress(): LastRouteProgress | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(LAST_ROUTE_PROGRESS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LastRouteProgress;
    return Number.isFinite(parsed.routeId) ? parsed : null;
  } catch {
    return null;
  }
}
