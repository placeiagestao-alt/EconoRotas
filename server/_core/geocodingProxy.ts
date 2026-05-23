import type { Express } from "express";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; data: unknown }>();

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

export function registerGeocodingProxy(app: Express) {
  app.get("/api/geocode/search", async (req, res) => {
    const q = String(req.query.q || "").replace(/\s+/g, " ").trim();
    const limit = Math.min(Number(req.query.limit || 6) || 6, 10);

    if (q.length < 4) {
      res.json([]);
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
