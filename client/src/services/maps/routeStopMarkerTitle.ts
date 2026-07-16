import { getStopPackageNumbers, type StopMetadata } from "@shared/stopMetadata";

export type RouteStopMarkerIdentity = {
  packageNumber?: string;
  sourceProvider?: string;
  originalStop?: number | null;
  isUnsequencedStop?: boolean;
  metadata?: StopMetadata;
};

export function buildRouteStopMarkerTitle(
  stop: RouteStopMarkerIdentity,
  index: number
) {
  const parts = [`Parada ${index + 1}`];
  const originalStop = Number(stop.originalStop);

  if (stop.sourceProvider === "shopee") {
    if (Number.isFinite(originalStop) && originalStop > 0) {
      parts.push(`STOP ${originalStop}`);
    } else if (stop.isUnsequencedStop) {
      parts.push("Sem STOP");
    }
  }

  const packageNumbers = getStopPackageNumbers(
    stop.metadata,
    stop.packageNumber
  );
  if (packageNumbers.length === 1) {
    parts.push(`Pacote ${packageNumbers[0]}`);
  } else if (packageNumbers.length > 1) {
    parts.push(`Pacotes ${packageNumbers.slice(0, 3).join(", ")}`);
  }

  return parts.join(" | ");
}
