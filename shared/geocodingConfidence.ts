export const GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD = 60;

export const GEOCODING_METHODS = [
  "exact_address",
  "street_match",
  "neighborhood_match",
  "city_match",
  "approximate_route_cluster",
  "manual_coordinate",
] as const;

export type GeocodingMethod = (typeof GEOCODING_METHODS)[number];

export type GeocodingConfidenceInput = {
  method?: GeocodingMethod | string | null;
  score?: number | null;
  hasHouseNumber?: boolean;
  isSaved?: boolean;
  isManual?: boolean;
  isApproximate?: boolean;
  hasRoad?: boolean;
  hasDistrict?: boolean;
  hasCity?: boolean;
};

function clampScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeGeocodingMethod(
  method?: GeocodingMethod | string | null
): GeocodingMethod {
  return GEOCODING_METHODS.includes(method as GeocodingMethod)
    ? (method as GeocodingMethod)
    : "city_match";
}

export function defaultConfidenceForMethod(method?: GeocodingMethod | string | null) {
  switch (normalizeGeocodingMethod(method)) {
    case "manual_coordinate":
      return 100;
    case "exact_address":
      return 95;
    case "street_match":
      return 72;
    case "neighborhood_match":
      return 55;
    case "city_match":
      return 35;
    case "approximate_route_cluster":
      return 25;
    default:
      return 0;
  }
}

export function calculateGeocodingConfidence(input: GeocodingConfidenceInput) {
  if (input.score != null && Number.isFinite(Number(input.score))) {
    const score = clampScore(Number(input.score));
    const method = normalizeGeocodingMethod(input.method);
    return {
      score,
      method,
      suspect: score < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD,
    };
  }

  let method = normalizeGeocodingMethod(input.method);

  if (input.isManual) method = "manual_coordinate";
  else if (input.isSaved || input.hasHouseNumber) method = "exact_address";
  else if (input.hasRoad) method = "street_match";
  else if (input.hasDistrict) method = "neighborhood_match";
  else if (input.hasCity) method = "city_match";
  else if (input.isApproximate) method = "approximate_route_cluster";

  const score = defaultConfidenceForMethod(method);
  return {
    score,
    method,
    suspect: score < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD,
  };
}

export function summarizeGeocodingConfidence(
  stops: Array<{
    geocodingConfidenceScore?: number | string | null;
    geocodingMethod?: string | null;
    geocodingSuspect?: boolean | number | null;
  }>
) {
  const scores = stops
    .map((stop) => Number(stop.geocodingConfidenceScore))
    .filter((score) => Number.isFinite(score));
  const methodCounts = stops.reduce<Record<string, number>>((acc, stop) => {
    const method = normalizeGeocodingMethod(stop.geocodingMethod);
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});
  const suspectCount = stops.filter((stop) => {
    const score = Number(stop.geocodingConfidenceScore);
    if (Number.isFinite(score)) {
      return score < GEOCODING_CONFIDENCE_SUSPECT_THRESHOLD;
    }
    return Boolean(stop.geocodingSuspect);
  }).length;

  return {
    averageScore: scores.length
      ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
      : 0,
    minScore: scores.length ? Math.min(...scores) : 0,
    suspectCount,
    methodCounts,
  };
}
