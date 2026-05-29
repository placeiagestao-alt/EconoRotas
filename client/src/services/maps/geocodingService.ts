import type { Coordinate } from "./locationService";
import { buildApiUrl } from "@/lib/apiBase";

const GEOCODING_SEARCH_URL = buildApiUrl("/api/geocode/search");
const DEFAULT_LIMIT = 6;

export type AddressSuggestion = Coordinate & {
  id: string;
  label: string;
  shortLabel: string;
  type?: string;
  importance?: number;
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
};

function extractHouseNumber(query: string) {
  const commaNumberMatch = query.match(
    /,\s*(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)(?=,|\s|$)/
  );

  if (commaNumberMatch?.[1]) {
    return commaNumberMatch[1];
  }

  const explicitNumberMatch = query.match(
    /\b(?:n(?:umero|úmero|º|o)?\.?|nº|no\.?)\s*(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)\b/i
  );

  if (explicitNumberMatch?.[1]) {
    return explicitNumberMatch[1];
  }

  const numericTokens = Array.from(
    query.matchAll(/\b\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?\b/g)
  ).map((match) => match[0]);

  if (numericTokens.length === 0) {
    return undefined;
  }

  const lastNumber = numericTokens[numericTokens.length - 1];
  const numericPart = Number.parseInt(lastNumber, 10);

  if (numericTokens.length > 1 || numericPart >= 10) {
    return lastNumber;
  }

  return undefined;
}

function hasHouseNumber(label: string, houseNumber: string) {
  return new RegExp(`(^|\\D)${houseNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\D|$)`).test(
    label
  );
}

function formatAddressLabel(result: NominatimResult, queryHouseNumber?: string) {
  const address = result.address;

  if (!address) {
    return result.display_name;
  }

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
  return query.replace(/\s+/g, " ").trim();
}

export async function searchAddress(
  query: string,
  options: SearchAddressOptions = {}
): Promise<AddressSuggestion[]> {
  const normalizedQuery = normalizeAddressQuery(query);
  const queryHouseNumber = extractHouseNumber(normalizedQuery);

  if (normalizedQuery.length < 4) {
    return [];
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
    limit: String(options.limit ?? DEFAULT_LIMIT),
  });

  const response = await fetch(`${GEOCODING_SEARCH_URL}?${params.toString()}`, {
    signal: options.signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new Error(payload?.error || "Não foi possível buscar o endereço agora.");
  }

  const results = (await response.json()) as NominatimResult[];

  return results
    .map((result) => ({
      id: String(result.place_id),
      label: formatAddressLabel(result, queryHouseNumber),
      shortLabel: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      type: result.type,
      importance: result.importance,
    }))
    .filter(
      (suggestion) =>
        Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
    );
}
