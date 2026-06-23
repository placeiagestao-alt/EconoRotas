import { buildApiUrl } from "@/lib/apiBase";
import type { Coordinate } from "./locationService";
import {
  calculateGeocodingConfidence,
  type GeocodingMethod,
} from "@shared/geocodingConfidence";
import {
  getEquivalentAddressCacheKeys,
  normalizeAddressForCache,
  normalizeAddressText,
} from "@shared/addressCache";

const GEOCODING_SEARCH_URL = buildApiUrl("/api/geocode/search");
const GEOCODING_REMEMBER_URL = buildApiUrl("/api/geocode/remember");
const DEFAULT_LIMIT = 6;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const ADDRESS_MEMORY_KEY = "econorotas:address-coordinate-memory:v1";
const LOCAL_CACHE_METRICS_KEY = "econorotas:geocoding-local-cache-metrics:v1";
const MAX_MEMORY_ENTRIES = 1500;
const requestCache = new Map<string, Promise<AddressSuggestion[]>>();

export type AddressSuggestion = Coordinate & {
  id: string;
  label: string;
  shortLabel: string;
  type?: string;
  importance?: number;
  accuracy?: "saved" | "exact" | "approximate";
  score?: number;
  geocodingConfidenceScore?: number;
  geocodingMethod?: GeocodingMethod;
  geocodingSuspect?: boolean;
};

type RememberedAddress = Coordinate & {
  address: string;
  savedAt: number;
  geocodingConfidenceScore?: number;
  geocodingMethod?: GeocodingMethod;
  geocodingSuspect?: boolean;
};

type NominatimAddress = {
  building?: string;
  road?: string;
  house_number?: string;
  quarter?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
  postcode?: string;
};

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  importance?: number;
  address?: NominatimAddress;
};

export type SearchAddressOptions = {
  signal?: AbortSignal;
  limit?: number;
  useFallbackQueries?: boolean;
};

function normalizeAddressKey(query: string) {
  return normalizeAddressForCache(query);
}

function getEquivalentAddressKeys(query: string) {
  return getEquivalentAddressCacheKeys(query);
}

function readLocalCacheMetrics() {
  if (typeof window === "undefined") return { hits: 0, misses: 0 };

  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_METRICS_KEY);
    if (!raw) return { hits: 0, misses: 0 };
    const parsed = JSON.parse(raw);
    return {
      hits: Math.max(0, Math.trunc(Number(parsed?.hits || 0))),
      misses: Math.max(0, Math.trunc(Number(parsed?.misses || 0))),
    };
  } catch {
    return { hits: 0, misses: 0 };
  }
}

function writeLocalCacheMetrics(metrics: { hits: number; misses: number }) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCAL_CACHE_METRICS_KEY, JSON.stringify(metrics));
  } catch {
    // Metrics are best-effort and must never block geocoding.
  }
}

function recordLocalCacheMetric(type: "hit" | "miss") {
  const metrics = readLocalCacheMetrics();
  if (type === "hit") metrics.hits += 1;
  else metrics.misses += 1;
  writeLocalCacheMetrics(metrics);
}

function takeLocalCacheMetricHeaders() {
  const metrics = readLocalCacheMetrics();
  if (metrics.hits <= 0 && metrics.misses <= 0) return {};

  writeLocalCacheMetrics({ hits: 0, misses: 0 });
  const headers: Record<string, string> = {};
  headers["X-EconoRotas-Geocoding-Local-Hits"] = String(metrics.hits);
  headers["X-EconoRotas-Geocoding-Local-Misses"] = String(metrics.misses);
  return headers;
}

function readAddressMemory(): Record<string, RememberedAddress> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(ADDRESS_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAddressMemory(memory: Record<string, RememberedAddress>) {
  if (typeof window === "undefined") return;

  const entries = Object.entries(memory)
    .sort(([, a], [, b]) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
    .slice(0, MAX_MEMORY_ENTRIES);

  try {
    window.localStorage.setItem(ADDRESS_MEMORY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage can be unavailable on restricted browsers. Keep the app usable.
  }
}

export function rememberAddressCoordinates(
  address: string,
  latitude: number,
  longitude: number,
  confidence?: {
    geocodingConfidenceScore?: number;
    geocodingMethod?: GeocodingMethod;
    geocodingSuspect?: boolean;
  }
) {
  const normalizedAddress = normalizeAddressQuery(address);
  const keys = getEquivalentAddressKeys(normalizedAddress);

  if (keys.length === 0 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (latitude === 0 && longitude === 0) return;

  const confidenceResult = calculateGeocodingConfidence({
    score: confidence?.geocodingConfidenceScore,
    method: confidence?.geocodingMethod,
  });
  const memory = readAddressMemory();
  for (const key of keys) {
    memory[key] = {
      address: normalizedAddress,
      latitude,
      longitude,
      savedAt: Date.now(),
      geocodingConfidenceScore: confidenceResult.score,
      geocodingMethod: confidenceResult.method,
      geocodingSuspect: confidence?.geocodingSuspect ?? confidenceResult.suspect,
    };
  }
  writeAddressMemory(memory);
  requestCache.clear();

  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    void fetch(GEOCODING_REMEMBER_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: normalizedAddress,
        latitude,
        longitude,
      }),
    }).catch(() => {
      // Local memory already saved the coordinate. Central learning is best-effort.
    });
  }, 0);
}

function getRememberedAddressSuggestion(query: string): AddressSuggestion | undefined {
  const memory = readAddressMemory();
  const remembered = getEquivalentAddressKeys(query)
    .map((key) => memory[key])
    .find(Boolean);
  if (!remembered) return undefined;
  const confidence = calculateGeocodingConfidence({
    score: remembered.geocodingConfidenceScore,
    method: remembered.geocodingMethod,
  });

  return {
    id: `memory:${getEquivalentAddressKeys(query)[0] ?? normalizeAddressKey(query)}`,
    label: remembered.address,
    shortLabel: "Coordenada usada anteriormente neste aparelho",
    latitude: remembered.latitude,
    longitude: remembered.longitude,
    type: "saved",
    importance: 1,
    accuracy: "saved",
    score: 1_000,
    geocodingConfidenceScore: confidence.score,
    geocodingMethod: confidence.method,
    geocodingSuspect: remembered.geocodingSuspect ?? confidence.suspect,
  };
}

function extractHouseNumber(query: string) {
  const commaNumberMatch = query.match(
    /,\s*(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)(?=,|\s|$)/
  );

  if (commaNumberMatch?.[1]) return commaNumberMatch[1];

  const explicitNumberMatch = query.match(
    /\b(?:n(?:umero|úmero|º|o)?\.?|nº|no\.?)\s*(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)\b/i
  );

  if (explicitNumberMatch?.[1]) return explicitNumberMatch[1];

  const numericTokens = Array.from(
    query.matchAll(/\b\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?\b/g)
  ).map((match) => match[0]);

  if (numericTokens.length === 0) return undefined;

  const lastNumber = numericTokens[numericTokens.length - 1];
  const numericPart = Number.parseInt(lastNumber, 10);

  if (numericTokens.length > 1 || numericPart >= 10) return lastNumber;

  return undefined;
}

function hasHouseNumber(label: string, houseNumber: string) {
  return new RegExp(
    `(^|\\D)${houseNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\D|$)`
  ).test(label);
}

function resultHasHouseNumber(result: NominatimResult, queryHouseNumber?: string) {
  if (!queryHouseNumber) return true;
  if (result.type === "user_confirmed") return true;
  if (result.address?.house_number && result.address.house_number === queryHouseNumber) {
    return true;
  }
  return hasHouseNumber(result.display_name || "", queryHouseNumber);
}

function getResultAccuracy(result: NominatimResult, queryHouseNumber?: string) {
  if (result.type === "user_confirmed") return "saved" as const;
  if (resultHasHouseNumber(result, queryHouseNumber)) return "exact" as const;
  return "approximate" as const;
}

function getResultGeocodingMethod(
  result: NominatimResult,
  queryHouseNumber?: string
): GeocodingMethod {
  if (result.type === "user_confirmed") return "exact_address";
  if (resultHasHouseNumber(result, queryHouseNumber)) return "exact_address";
  if (result.address?.road) return "street_match";
  if (result.address?.suburb || result.address?.neighbourhood || result.address?.quarter) {
    return "neighborhood_match";
  }
  if (result.address?.city || result.address?.town || result.address?.village || result.address?.municipality) {
    return "city_match";
  }
  return "city_match";
}

function scoreAddressResult(
  result: NominatimResult,
  queryHouseNumber?: string,
  query?: string
) {
  const accuracy = getResultAccuracy(result, queryHouseNumber);
  const address = result.address;
  const normalizedQuery = normalizeAddressKey(query || "");
  let score = Number(result.importance || 0) * 100;

  if (accuracy === "saved") score += 1_000;
  if (accuracy === "exact") score += 350;
  if (accuracy === "approximate") score -= queryHouseNumber ? 120 : 20;
  if (address?.road) score += 50;
  if (address?.city || address?.town || address?.village || address?.municipality) {
    score += 40;
  }
  if (address?.state && /sao paulo|sp/.test(normalizeAddressKey(address.state))) {
    score += 30;
  }
  if (normalizedQuery.includes("presidente prudente")) {
    const city = normalizeAddressKey(
      address?.city || address?.town || address?.village || address?.municipality || ""
    );
    if (city.includes("presidente prudente")) score += 60;
  }

  return score;
}

function formatAddressLabel(result: NominatimResult, queryHouseNumber?: string) {
  const address = result.address;

  if (!address) return result.display_name;

  const houseNumber = queryHouseNumber || address.house_number;
  const street = [address.road, houseNumber].filter(Boolean).join(", ");
  const district = address.suburb || address.neighbourhood || address.quarter;
  const city = address.city || address.town || address.village || address.municipality;
  const region = [city, address.state].filter(Boolean).join(" - ");
  const parts = [street || address.building, district, region].filter(Boolean);
  const label = parts.length > 0 ? parts.join(", ") : result.display_name;

  if (queryHouseNumber && !hasHouseNumber(label, queryHouseNumber) && address.road) {
    return [address.road, queryHouseNumber, district, region]
      .filter(Boolean)
      .join(", ");
  }

  return label;
}

export function normalizeAddressQuery(query: string) {
  return normalizeAddressText(query);
}

function stripAddressComplement(query: string) {
  return (
    query
      .replace(
        /\s*,?\s*\b(?:apto?|apartamento|ap|bloco|torre|casa|fundos|sala|loja|quadra|lote|andar|condominio|condomínio)\b.*$/i,
        ""
      )
      .trim() || query
  );
}

function hasBrazilContext(query: string) {
  const normalized = normalizeAddressKey(query);
  return (
    /\bbrasil\b/.test(normalized) ||
    /\bsp\b/.test(normalized) ||
    /\bsao paulo\b/.test(normalized)
  );
}

function moveLeadingHouseNumber(query: string) {
  const parts = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return query;
  if (!/^\d+[a-zA-Z]?$/.test(parts[0]) || !/[a-zA-ZÀ-ÿ]/.test(parts[1])) {
    return query;
  }

  return [parts[1], parts[0], ...parts.slice(2)].join(", ");
}

function buildFallbackQueries(query: string) {
  const normalized = normalizeAddressQuery(moveLeadingHouseNumber(query));
  const withoutComplement = stripAddressComplement(normalized);
  const parts = withoutComplement
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = [
    normalized,
    withoutComplement,
    hasBrazilContext(withoutComplement) ? withoutComplement : `${withoutComplement}, Brasil`,
  ];

  if (parts.length >= 4) {
    const [street, number, ...rest] = parts;
    const restWithoutCep = rest.filter((part) => !/\b\d{5}-?\d{3}\b/.test(part));
    const state =
      restWithoutCep.find((part) => /^(sp|s[aã]o paulo)$/i.test(part)) || "SP";
    const city =
      restWithoutCep.find((part) => /presidente prudente/i.test(part)) ||
      restWithoutCep.at(-2) ||
      restWithoutCep.at(-1);
    const district = restWithoutCep.find((part) => part !== city && part !== state);

    candidates.push(
      [street, number, city, state, "Brasil"].filter(Boolean).join(", "),
      [street, number, district, city, state, "Brasil"].filter(Boolean).join(", "),
      [street, district, city, state, "Brasil"].filter(Boolean).join(", "),
      [street, city, state, "Brasil"].filter(Boolean).join(", ")
    );
  }

  return Array.from(
    new Set(candidates.map(normalizeAddressQuery).filter((item) => item.length >= 4))
  );
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function searchAddress(
  query: string,
  options: SearchAddressOptions = {}
): Promise<AddressSuggestion[]> {
  const normalizedQuery = normalizeAddressQuery(query);

  if (normalizedQuery.length < 4) return [];

  const remembered = getRememberedAddressSuggestion(normalizedQuery);
  if (remembered) {
    recordLocalCacheMetric("hit");
    return [remembered];
  }

  recordLocalCacheMetric("miss");

  const cacheKey = `${normalizedQuery.toLowerCase()}|${options.limit ?? DEFAULT_LIMIT}|${options.useFallbackQueries !== false ? "fallback" : "single"}`;
  if (!options.signal) {
    const cachedRequest = requestCache.get(cacheKey);
    if (cachedRequest) return cachedRequest;
  }

  const request = searchAddressUncached(normalizedQuery, options);
  if (!options.signal) {
    requestCache.set(cacheKey, request);
    request.catch(() => requestCache.delete(cacheKey));
  }

  return request;
}

async function searchAddressUncached(
  normalizedQuery: string,
  options: SearchAddressOptions
): Promise<AddressSuggestion[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const queries =
    options.useFallbackQueries === false
      ? [normalizedQuery]
      : buildFallbackQueries(normalizedQuery).slice(0, 5);
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set(suggestions.map((suggestion) => suggestion.id));

  for (const query of queries) {
    const results = await fetchAddressQuery(query, { ...options, limit });

    for (const suggestion of results) {
      const coordinateKey = `${suggestion.latitude.toFixed(6)},${suggestion.longitude.toFixed(6)}`;
      const labelKey = normalizeAddressKey(suggestion.label);
      const key = `${coordinateKey}|${labelKey}`;

      if (seen.has(suggestion.id) || seen.has(key)) continue;
      seen.add(suggestion.id);
      seen.add(key);
      suggestions.push(suggestion);

      if (suggestions.length >= limit) return suggestions;
    }
  }

  return suggestions;
}

async function fetchAddressQuery(
  normalizedQuery: string,
  options: SearchAddressOptions
): Promise<AddressSuggestion[]> {
  const queryHouseNumber = extractHouseNumber(normalizedQuery);
  const params = new URLSearchParams({
    q: normalizedQuery,
    limit: String(options.limit ?? DEFAULT_LIMIT),
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...takeLocalCacheMetricHeaders(),
    };
    try {
      response = await fetch(`${GEOCODING_SEARCH_URL}?${params.toString()}`, {
        signal: options.signal,
        headers,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      throw new Error(
        "Nao foi possivel consultar o servico de endereco. Confira sua conexao e tente novamente."
      );
    }

    if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === 2) break;

    const retryAfter = Number(response.headers.get("Retry-After"));
    await wait(
      Number.isFinite(retryAfter) ? retryAfter * 1000 : 1200 * (attempt + 1),
      options.signal
    );
  }

  if (!response?.ok) {
    const payload = await response?.json().catch(() => undefined);
    throw new Error(payload?.error || "Nao foi possivel buscar o endereco agora.");
  }

  const results = (await response.json()) as NominatimResult[];

  return results
    .map((result) => {
      const accuracy = getResultAccuracy(result, queryHouseNumber);
      const score = scoreAddressResult(result, queryHouseNumber, normalizedQuery);
      const method = getResultGeocodingMethod(result, queryHouseNumber);
      const confidence = calculateGeocodingConfidence({
        method,
        isSaved: result.type === "user_confirmed",
        hasHouseNumber: resultHasHouseNumber(result, queryHouseNumber),
        hasRoad: Boolean(result.address?.road),
        hasDistrict: Boolean(
          result.address?.suburb ||
            result.address?.neighbourhood ||
            result.address?.quarter
        ),
        hasCity: Boolean(
          result.address?.city ||
            result.address?.town ||
            result.address?.village ||
            result.address?.municipality
        ),
      });
      const shortLabel =
        accuracy === "approximate" && queryHouseNumber
          ? `Aproximado pela rua. Confirme o ponto antes de iniciar. ${result.display_name}`
          : result.display_name;

      return {
        id: String(result.place_id),
        label: formatAddressLabel(result, queryHouseNumber),
        shortLabel,
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        type: result.type,
        importance: result.importance,
        accuracy,
        score,
        geocodingConfidenceScore: confidence.score,
        geocodingMethod: confidence.method,
        geocodingSuspect: confidence.suspect,
      };
    })
    .filter(
      (suggestion) =>
        Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
    )
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}
