import { calculateDistance, estimateTravelTime } from "./optimization";
import * as db from "./db";

export type CommercialDetectionStatus = "unknown" | "suspected" | "confirmed";

export type CommercialDetectionResult = {
  commercialDetectionStatus: CommercialDetectionStatus;
  commercialConfidence: number;
  commercialPlaceName: string | null;
  commercialCategory: string | null;
  commercialOpeningHours: string | null;
  commercialSource: "osm" | "manual" | "historical" | null;
  commercialLastCheckedAt: Date;
};

export type CommercialEtaAlert = {
  status: "unknown" | "compatible" | "risk";
  severity: "neutral" | "success" | "warning" | "danger";
  title: string;
  message: string;
  etaIso: string | null;
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CACHE_TTL_DAYS = 30;
const PRIMARY_RADIUS_METERS = 20;
const SECONDARY_RADIUS_METERS = 30;

const COMMERCIAL_AMENITIES = [
  "pharmacy",
  "bank",
  "school",
  "hospital",
  "clinic",
  "restaurant",
  "cafe",
  "fast_food",
  "marketplace",
];

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string>;
};

function hasValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  );
}

function buildOverpassQuery(latitude: number, longitude: number, radius: number) {
  const amenityRegex = COMMERCIAL_AMENITIES.join("|");
  return `
[out:json][timeout:8];
(
  node(around:${radius},${latitude},${longitude})["shop"];
  way(around:${radius},${latitude},${longitude})["shop"];
  relation(around:${radius},${latitude},${longitude})["shop"];
  node(around:${radius},${latitude},${longitude})["office"];
  way(around:${radius},${latitude},${longitude})["office"];
  relation(around:${radius},${latitude},${longitude})["office"];
  node(around:${radius},${latitude},${longitude})["amenity"~"^(${amenityRegex})$"];
  way(around:${radius},${latitude},${longitude})["amenity"~"^(${amenityRegex})$"];
  relation(around:${radius},${latitude},${longitude})["amenity"~"^(${amenityRegex})$"];
);
out center tags;
`;
}

function getElementCoordinate(element: OverpassElement) {
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  if (!hasValidCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}

function getCommercialCategory(tags: Record<string, string>) {
  if (tags.shop) return `shop:${tags.shop}`;
  if (tags.office) return `office:${tags.office}`;
  if (tags.amenity && COMMERCIAL_AMENITIES.includes(tags.amenity)) {
    return `amenity:${tags.amenity}`;
  }
  return null;
}

function chooseBestCommercialElement(
  elements: OverpassElement[],
  latitude: number,
  longitude: number
) {
  return elements
    .map((element) => {
      const tags = element.tags ?? {};
      const category = getCommercialCategory(tags);
      const coordinate = getElementCoordinate(element);
      if (!category || !coordinate) return null;
      return {
        element,
        tags,
        category,
        distanceKm: calculateDistance(
          { latitude, longitude },
          { latitude: coordinate.latitude, longitude: coordinate.longitude }
        ),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const namedDiff = Number(Boolean(b!.tags.name)) - Number(Boolean(a!.tags.name));
      if (namedDiff !== 0) return namedDiff;
      const hoursDiff =
        Number(Boolean(b!.tags.opening_hours)) - Number(Boolean(a!.tags.opening_hours));
      if (hoursDiff !== 0) return hoursDiff;
      return a!.distanceKm - b!.distanceKm;
    })[0] ?? null;
}

export function classifyCommercialEvidence(
  response: unknown,
  latitude: number,
  longitude: number
): CommercialDetectionResult {
  const elements = Array.isArray((response as any)?.elements)
    ? ((response as any).elements as OverpassElement[])
    : [];
  const best = chooseBestCommercialElement(elements, latitude, longitude);
  const checkedAt = new Date();

  if (!best) {
    return {
      commercialDetectionStatus: "unknown",
      commercialConfidence: 0,
      commercialPlaceName: null,
      commercialCategory: null,
      commercialOpeningHours: null,
      commercialSource: "osm",
      commercialLastCheckedAt: checkedAt,
    };
  }

  const hasCompleteEvidence = Boolean(best.tags.name && best.tags.opening_hours);

  return {
    commercialDetectionStatus: hasCompleteEvidence ? "confirmed" : "suspected",
    commercialConfidence: hasCompleteEvidence ? 95 : 70,
    commercialPlaceName: best.tags.name ?? null,
    commercialCategory: best.category,
    commercialOpeningHours: best.tags.opening_hours ?? null,
    commercialSource: "osm",
    commercialLastCheckedAt: checkedAt,
  };
}

async function fetchOverpass(latitude: number, longitude: number, radius: number) {
  const cached = await db.getLocationCommercialCache({
    latitude,
    longitude,
    radius,
    ttlDays: CACHE_TTL_DAYS,
  });
  if (cached) return cached.response;

  const body = buildOverpassQuery(latitude, longitude, radius);
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "EconoRota/1.0 commercial-detection",
    },
    body: new URLSearchParams({ data: body }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Overpass retornou HTTP ${response.status}`);
  }

  const payload = await response.json();
  await db.setLocationCommercialCache({
    latitude,
    longitude,
    radius,
    response: payload,
  });
  return payload;
}

export async function detectCommercialAtLocation(latitude: number, longitude: number) {
  if (!hasValidCoordinate(latitude, longitude)) {
    return classifyCommercialEvidence({ elements: [] }, latitude, longitude);
  }

  const primary = await fetchOverpass(latitude, longitude, PRIMARY_RADIUS_METERS);
  const primaryDetection = classifyCommercialEvidence(primary, latitude, longitude);
  if (primaryDetection.commercialDetectionStatus !== "unknown") {
    return primaryDetection;
  }

  const secondary = await fetchOverpass(latitude, longitude, SECONDARY_RADIUS_METERS);
  return classifyCommercialEvidence(secondary, latitude, longitude);
}

const WEEKDAY_KEYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function weekdayMatches(token: string, date: Date) {
  const today = WEEKDAY_KEYS[date.getDay()];
  const parts = token.split("-");
  if (parts.length === 1) return parts[0] === today;

  const start = WEEKDAY_KEYS.indexOf(parts[0]);
  const end = WEEKDAY_KEYS.indexOf(parts[1]);
  const current = WEEKDAY_KEYS.indexOf(today);
  if (start < 0 || end < 0 || current < 0) return false;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

export function evaluateOpeningHours(
  openingHours: string | null | undefined,
  eta: Date
): "unknown" | "open" | "closed" {
  if (!openingHours?.trim()) return "unknown";
  const rules = openingHours.split(";").map((part) => part.trim()).filter(Boolean);
  const etaMinutes = eta.getHours() * 60 + eta.getMinutes();

  for (const rule of rules) {
    const match = rule.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!match) continue;
    if (!weekdayMatches(match[1], eta)) continue;
    const start = parseTimeToMinutes(match[2]);
    const end = parseTimeToMinutes(match[3]);
    if (start === null || end === null) continue;
    if (start <= end && etaMinutes >= start && etaMinutes <= end) return "open";
    if (start > end && (etaMinutes >= start || etaMinutes <= end)) return "open";
    return "closed";
  }

  return "unknown";
}

export function estimateStopEta(stops: Array<{ latitude: number; longitude: number }>, stopId: number | undefined, ids: number[]) {
  const index = ids.findIndex((id) => id === stopId);
  if (index < 0) return null;
  let minutes = 0;
  for (let i = 0; i < index; i += 1) {
    const distanceKm = calculateDistance(stops[i], stops[i + 1]);
    minutes += estimateTravelTime(distanceKm);
  }
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function buildCommercialEtaAlert(
  detection: Pick<
    CommercialDetectionResult,
    "commercialDetectionStatus" | "commercialOpeningHours" | "commercialPlaceName"
  >,
  eta: Date | null
): CommercialEtaAlert {
  if (detection.commercialDetectionStatus === "unknown") {
    return {
      status: "unknown",
      severity: "neutral",
      title: "Sem evidência comercial",
      message: "Nenhum estabelecimento comercial cadastrado foi encontrado neste local.",
      etaIso: eta?.toISOString() ?? null,
    };
  }

  if (!detection.commercialOpeningHours || !eta) {
    return {
      status: "unknown",
      severity: "warning",
      title: "Estabelecimento identificado",
      message: "Foi encontrada evidência comercial neste local, mas o horário não está disponível.",
      etaIso: eta?.toISOString() ?? null,
    };
  }

  const state = evaluateOpeningHours(detection.commercialOpeningHours, eta);
  if (state === "open") {
    return {
      status: "compatible",
      severity: "success",
      title: "Horário compatível",
      message: "A chegada prevista está dentro do horário cadastrado.",
      etaIso: eta.toISOString(),
    };
  }
  if (state === "closed") {
    return {
      status: "risk",
      severity: "danger",
      title: "Risco alto",
      message: "Estabelecimento cadastrado fecha antes do horário previsto de chegada.",
      etaIso: eta.toISOString(),
    };
  }

  return {
    status: "unknown",
    severity: "warning",
    title: "Horário não interpretado",
    message: "Foi encontrada evidência comercial, mas o formato do horário não pôde ser validado.",
    etaIso: eta.toISOString(),
  };
}
