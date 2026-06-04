import type { Express, Request } from "express";
import { createHash } from "node:crypto";
import {
  createOperationalEvent,
  getGeocodeCache,
  getPersistentValue,
  setGeocodeCache,
  setPersistentValue,
} from "../db";
import { sdk } from "./sdk";
import {
  getEquivalentAddressCacheKeys,
  normalizeAddressForCache,
} from "../../shared/addressCache";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const databaseCacheTtlDays = Number(process.env.GEOCODING_DATABASE_CACHE_TTL_DAYS);
const DATABASE_CACHE_TTL_MS = Math.max(
  CACHE_TTL_MS,
  (Number.isFinite(databaseCacheTtlDays) && databaseCacheTtlDays > 0
    ? databaseCacheTtlDays
    : 30) *
    24 *
    60 *
    60 *
    1000
);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Math.max(
  1,
  Number(process.env.GEOCODING_RATE_LIMIT_PER_MINUTE || 240)
);
const EXTERNAL_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.GEOCODING_EXTERNAL_MIN_INTERVAL_MS || 350)
);

const cache = new Map<string, { expiresAt: number; data: unknown }>();
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const inFlightSearches = new Map<string, Promise<unknown>>();
let lastExternalSearchAt = 0;

function normalizeSearchQuery(query: string) {
  return query.replace(/\s+/g, " ").trim();
}

function getSearchCacheKey(query: string, limit: number) {
  const normalized = normalizeAddressForCache(query) || query.toLowerCase();
  return `${normalized}|${limit}`;
}

function getRememberCacheKeys(address: string, limit: number) {
  const keys = getEquivalentAddressCacheKeys(address);
  return (keys.length > 0 ? keys : [normalizeAddressForCache(address)]).map(
    (key) => `${key}|${limit}`
  );
}

function readPositiveHeaderNumber(req: Request, name: string) {
  const raw = req.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const number = Math.trunc(Number(value || 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function recordClientCacheMetrics(req: Request) {
  const hits = readPositiveHeaderNumber(
    req,
    "X-EconoRotas-Geocoding-Local-Hits"
  );
  const misses = readPositiveHeaderNumber(
    req,
    "X-EconoRotas-Geocoding-Local-Misses"
  );

  if (hits <= 0 && misses <= 0) return;

  await createOperationalEvent({
    type: "geocoding_cache_client_metrics",
    severity: "info",
    source: "geocoding.cache",
    title: "Metricas de cache local de enderecos",
    message: `${hits} hit(s) local(is), ${misses} miss(es) local(is).`,
    metadata: {
      geocoding_cache_hit_local: hits,
      geocoding_cache_miss_local: misses,
    },
  }).catch((error) => {
    console.warn("[Geocoding] Failed to record local cache metrics:", error);
  });

  if (hits > 0) {
    await recordGeocodingEvent({
      type: "geocoding_cache_hit",
      title: "Cache local reaproveitado",
      message: `${hits} endereco(s) reaproveitado(s) no dispositivo.`,
      metadata: {
        provider_used: "cache_local",
        geocoding_cache_hit_local: hits,
      },
    });
  }

  if (misses > 0) {
    await recordGeocodingEvent({
      type: "geocoding_cache_miss",
      title: "Cache local sem correspondencia",
      message: `${misses} endereco(s) precisaram consultar o backend.`,
      metadata: {
        provider_used: "cache_local",
        geocoding_cache_miss_local: misses,
      },
    });
  }
}

async function recordGeocodingEvent(data: {
  type: "geocoding_cache_hit" | "geocoding_cache_miss" | "geocoding_provider_fallback";
  title: string;
  message: string;
  severity?: "info" | "warning" | "error";
  metadata: Record<string, unknown>;
}) {
  await createOperationalEvent({
    type: data.type,
    severity: data.severity ?? "info",
    source: "geocoding.proxy",
    title: data.title,
    message: data.message,
    metadata: data.metadata,
  }).catch((error) => {
    console.warn("[Geocoding] Failed to record geocoding event:", error);
  });
}

function isCoordinateInBrazil(latitude: number, longitude: number) {
  return latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -34;
}

function getNominatimUserAgent() {
  return (
    process.env.NOMINATIM_USER_AGENT ||
    `routing-pwa/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "local-development"})`
  );
}

function getPersistentCacheKey(cacheKey: string) {
  return `geocoding:${Buffer.from(cacheKey).toString("base64url")}`;
}

function getDatabaseCacheKey(cacheKey: string) {
  return createHash("sha256").update(cacheKey).digest("hex");
}

async function waitForExternalSearchSlot() {
  if (EXTERNAL_MIN_INTERVAL_MS <= 0) return;

  const elapsed = Date.now() - lastExternalSearchAt;
  if (elapsed < EXTERNAL_MIN_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, EXTERNAL_MIN_INTERVAL_MS - elapsed)
    );
  }
  lastExternalSearchAt = Date.now();
}

function setMemoryCache(cacheKey: string, data: unknown) {
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getCached(cacheKey: string) {
  const cached = cache.get(cacheKey);

  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.data;
    }
    cache.delete(cacheKey);
  }

  const databaseCached = await getGeocodeCache(getDatabaseCacheKey(cacheKey)).catch(
    (error) => {
      console.warn("[Geocoding] Failed to read database cache:", error);
      return null;
    }
  );
  if (databaseCached) {
    setMemoryCache(cacheKey, databaseCached.results);
    return databaseCached.results;
  }

  const persistentValue = await getPersistentValue(getPersistentCacheKey(cacheKey));
  if (!persistentValue) return undefined;

  try {
    const payload = JSON.parse(persistentValue);
    if (Number(payload.expiresAt) <= Date.now()) return undefined;

    setMemoryCache(cacheKey, payload.data);
    return payload.data;
  } catch {
    return undefined;
  }
}

async function setCached(cacheKey: string, data: unknown) {
  setMemoryCache(cacheKey, data);

  await setGeocodeCache({
    cacheKey: getDatabaseCacheKey(cacheKey),
    query: cacheKey,
    provider: "nominatim",
    results: Array.isArray(data) ? data : [],
    expiresAt: new Date(Date.now() + DATABASE_CACHE_TTL_MS),
  }).catch((error) => {
    console.warn("[Geocoding] Failed to persist database cache:", error);
  });

  await setPersistentValue(
    getPersistentCacheKey(cacheKey),
    JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
  ).catch((error) => {
    console.warn("[Geocoding] Failed to persist cache:", error);
  });
}

async function fetchExternalSearch(cacheKey: string, url: string) {
  const existing = inFlightSearches.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    await waitForExternalSearchSlot();

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": getNominatimUserAgent(),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(body.slice(0, 200));
      (error as Error & { status?: number; retryAfter?: string }).status =
        response.status;
      (error as Error & { status?: number; retryAfter?: string }).retryAfter =
        response.headers.get("retry-after") || undefined;
      throw error;
    }

    return response.json();
  })().finally(() => {
    inFlightSearches.delete(cacheKey);
  });

  inFlightSearches.set(cacheKey, request);
  return request;
}

function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    candidate?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function checkRateLimit(req: Request) {
  const key = getClientIp(req);
  const now = Date.now();
  const existing = rateLimiter.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimiter.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

async function requireAuthenticatedGeocodeUser(req: Request) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

function buildConfirmedAddressResult(data: {
  address: string;
  latitude: number;
  longitude: number;
  userId: number | string;
}) {
  return {
    place_id: `confirmed:${createHash("sha1")
      .update(`${data.address}|${data.latitude}|${data.longitude}`)
      .digest("hex")}`,
    licence: "EconoRota user-confirmed address memory",
    osm_type: "user_confirmed",
    osm_id: 0,
    lat: String(data.latitude),
    lon: String(data.longitude),
    category: "place",
    type: "user_confirmed",
    importance: 1,
    addresstype: "address",
    display_name: data.address,
    address: {
      road: data.address,
      country: "Brasil",
      country_code: "br",
    },
    econorotas: {
      source: "user_confirmed",
      userId: data.userId,
    },
  };
}

export function registerGeocodingProxy(app: Express) {
  app.get("/api/geocode/search", async (req, res) => {
    const q = normalizeSearchQuery(String(req.query.q || ""));
    const limit = Math.min(Number(req.query.limit || 6) || 6, 10);

    if (q.length < 4) {
      res.json([]);
      return;
    }

    await recordClientCacheMetrics(req);

    const cacheKey = getSearchCacheKey(q, limit);
    const cached = await getCached(cacheKey);

    if (cached) {
      await recordGeocodingEvent({
        type: "geocoding_cache_hit",
        title: "Cache global de endereco reaproveitado",
        message: "Consulta atendida pelo cache compartilhado do backend.",
        metadata: {
          provider_used: "cache_backend",
          geocoding_cache_hit_backend: 1,
          queryLength: q.length,
          resultCount: Array.isArray(cached) ? cached.length : 0,
        },
      });
      res.setHeader("X-EconoRotas-Geocoding-Cache", "hit");
      res.json(cached);
      return;
    }

    const rateLimit = checkRateLimit(req);
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        error: "Limite de consultas excedido. Tente novamente em alguns segundos.",
      });
      return;
    }

    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      limit: String(limit),
      countrycodes: "br",
      "accept-language": "pt-BR,pt,en",
    });

    try {
      const data = await fetchExternalSearch(
        cacheKey,
        `${NOMINATIM_SEARCH_URL}?${params.toString()}`
      );
      await setCached(cacheKey, data);
      await recordGeocodingEvent({
        type: "geocoding_cache_miss",
        title: "Consulta externa de geocoding",
        message: "Endereco consultado no provedor externo apos miss de cache.",
        metadata: {
          provider_used: "nominatim",
          geocoding_cache_miss: 1,
          queryLength: q.length,
          resultCount: Array.isArray(data) ? data.length : 0,
        },
      });
      res.setHeader("X-EconoRotas-Geocoding-Cache", "miss");
      res.json(data);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      await recordGeocodingEvent({
        type: "geocoding_provider_fallback",
        severity: "warning",
        title: "Falha no provedor de geocoding",
        message: "Nominatim falhou e a consulta nao teve provedor alternativo configurado.",
        metadata: {
          provider_used: "nominatim",
          fallbackProvider: null,
          status: status ?? null,
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        },
      });

      if (status === 429) {
        res.setHeader(
          "Retry-After",
          (error as Error & { retryAfter?: string }).retryAfter || "3"
        );
        res.status(429).json({
          error: "Servico de enderecos ocupado. Tente novamente em alguns segundos.",
          details: error instanceof Error ? error.message : undefined,
        });
        return;
      }

      if (status) {
        res.status(status).json({
          error: "Nao foi possivel consultar o servico de enderecos.",
          details: error instanceof Error ? error.message : undefined,
        });
        return;
      }

      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar o servico de enderecos.",
      });
    }
  });

  app.post("/api/geocode/remember", async (req, res) => {
    const user = await requireAuthenticatedGeocodeUser(req);
    if (!user) {
      res.status(401).json({ error: "Entre para salvar a coordenada confirmada." });
      return;
    }

    const rateLimit = checkRateLimit(req);
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        error: "Limite de consultas excedido. Tente novamente em alguns segundos.",
      });
      return;
    }

    const address = normalizeSearchQuery(String(req.body?.address || ""));
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    if (address.length < 6 || address.length > 500) {
      res.status(400).json({ error: "Endereco invalido para memoria central." });
      return;
    }

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !isCoordinateInBrazil(latitude, longitude)
    ) {
      res.status(400).json({ error: "Coordenada invalida para memoria central." });
      return;
    }

    const result = buildConfirmedAddressResult({
      address,
      latitude,
      longitude,
      userId: user.id,
    });

    await Promise.all(
      [1, 6].flatMap((limit) =>
        getRememberCacheKeys(address, limit).map((cacheKey) =>
          setCached(cacheKey, [result])
        )
      )
    );

    res.json({
      ok: true,
      source: "user_confirmed",
    });
  });
}
