import type { Express, Request } from "express";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Math.max(
  1,
  Number(process.env.GEOCODING_RATE_LIMIT_PER_MINUTE || 30)
);
const cache = new Map<string, { expiresAt: number; data: unknown }>();
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function getNominatimUserAgent() {
  return (
    process.env.NOMINATIM_USER_AGENT ||
    `routing-pwa/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "local-development"})`
  );
}

function getCached(cacheKey: string) {
  const cached = cache.get(cacheKey);

  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return undefined;
  }

  return cached.data;
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

export function registerGeocodingProxy(app: Express) {
  app.get("/api/geocode/search", async (req, res) => {
    const q = String(req.query.q || "").replace(/\s+/g, " ").trim();
    const limit = Math.min(Number(req.query.limit || 6) || 6, 10);

    if (q.length < 4) {
      res.json([]);
      return;
    }

    const rateLimit = checkRateLimit(req);
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        error: "Limite de consultas excedido. Tente novamente em instantes.",
      });
      return;
    }

    const cacheKey = `${q.toLowerCase()}|${limit}`;
    const cached = getCached(cacheKey);

    if (cached) {
      res.json(cached);
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
      const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": getNominatimUserAgent(),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        res.status(response.status).json({
          error: "Nao foi possivel consultar o servico de enderecos.",
          details: body.slice(0, 200),
        });
        return;
      }

      const data = await response.json();
      cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar o servico de enderecos.",
      });
    }
  });
}
