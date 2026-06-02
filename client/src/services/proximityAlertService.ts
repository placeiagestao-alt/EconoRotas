import { calculateDistanceKm, type Coordinate } from "@/services/maps/locationService";

export type ProximityAlertCandidate = {
  stopIndex: number;
  distanceMeters: number;
  alertedAt: number;
};

export type ProximityStop = {
  latitude: number;
  longitude: number;
};

export type FindNearbyPendingStopInput<TStop extends ProximityStop> = {
  origin: Coordinate;
  stops: TStop[];
  currentIndex: number;
  deliveredIndexes: number[];
  failedIndexes: number[];
  lastAlertedAtByIndex: Record<number, number>;
  now: number;
  radiusMeters: number;
  repeatIntervalMs: number;
};

function hasUsableCoordinates(stop: ProximityStop) {
  return (
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude) &&
    !(stop.latitude === 0 && stop.longitude === 0)
  );
}

export function findNearbyPendingStop<TStop extends ProximityStop>({
  origin,
  stops,
  currentIndex,
  deliveredIndexes,
  failedIndexes,
  lastAlertedAtByIndex,
  now,
  radiusMeters,
  repeatIntervalMs,
}: FindNearbyPendingStopInput<TStop>): ProximityAlertCandidate | null {
  const handledIndexes = new Set([...deliveredIndexes, ...failedIndexes]);
  let nearby: ProximityAlertCandidate | null = null;

  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    if (!stop) continue;
    if (index === currentIndex) continue;
    if (handledIndexes.has(index)) continue;
    if (!hasUsableCoordinates(stop)) continue;

    const lastAlertedAt = lastAlertedAtByIndex[index] ?? 0;
    if (now - lastAlertedAt < repeatIntervalMs) continue;

    const distanceMeters = calculateDistanceKm(origin, {
      latitude: stop.latitude,
      longitude: stop.longitude,
    }) * 1000;

    if (distanceMeters > radiusMeters) continue;
    if (!nearby || distanceMeters < nearby.distanceMeters) {
      nearby = { stopIndex: index, distanceMeters, alertedAt: now };
    }
  }

  return nearby;
}
