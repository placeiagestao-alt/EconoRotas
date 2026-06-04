import { buildApiUrl } from "@/lib/apiBase";
import type { Coordinate } from "./locationService";

const GEOCODING_SEARCH_URL = buildApiUrl("/api/geocode/search");
const GEOCODING_REMEMBER_URL = buildApiUrl("/api/geocode/remember");
const DEFAULT_LIMIT = 6;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const ADDRESS_MEMORY_KEY = "econorotas:address-coordinate-memory:v1";
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
};

type RememberedAddress = Coordinate & {
  address: string;
  savedAt: number;
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
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  longitude: number
) {
  const normalizedAddress = normalizeAddressQuery(address);
  const key = normalizeAddressKey(normalizedAddress);

  if (!key || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (latitude === 0 && longitude === 0) return;

  const memory = readAddressMemory();
  memory[key] = {
    address: normalizedAddress,
    latitude,
    longitude,
    savedAt: Date.now(),
  };
  writeAddressMemory(memory);

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
  const remembered = readAddressMemory()[normalizeAddressKey(query)];
  if (!remembered) return undefined;

  return {
    id: `memory:${normalizeAddressKey(query)}`,
    label: remembered.address,
    shortLabel: "Coordenada usada anteriormente neste aparelho",
    latitude: remembered.latitude,
    longitude: remembered.longitude,
    type: "saved",
    importance: 1,
    accuracy: "saved",
    score: 1_000,
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
  return query
    .replace(/\bR\.\s+/gi, "Rua ")
    .replace(/\bAv\.\s+/gi, "Avenida ")
    .replace(/\bPres\.\s+Prudente\b/gi, "Presidente Prudente")
    .replace(/\bPte\.\s+Prudente\b/gi, "Presidente Prudente")
    .replace(/\s+/g, " ")
    .trim();
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
  const remembered = getRememberedAddressSuggestion(normalizedQuery);
  const queries =
    options.useFallbackQueries === false
      ? [normalizedQuery]
      : buildFallbackQueries(normalizedQuery).slice(0, 5);
  const suggestions: AddressSuggestion[] = remembered ? [remembered] : [];
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
    response = await fetch(`${GEOCODING_SEARCH_URL}?${params.toString()}`, {
      signal: options.signal,
      headers: { Accept: "application/json" },
    });

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
      };
    })
    .filter(
      (suggestion) =>
        Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
    )
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}
