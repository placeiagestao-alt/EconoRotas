import { createApp } from "../server/_core/index";

let app: ReturnType<typeof createApp> | null = null;

function getApp() {
  app ??= createApp({ serveClient: false });
  return app;
}

function normalizeVercelRewriteUrl(req: { url?: string }) {
  const currentUrl = new URL(req.url || "/", "http://vercel.local");
  const route = currentUrl.searchParams.get("__route");

  if (!route) return;

  const path = currentUrl.searchParams.get("path")?.replace(/^\/+/, "") ?? "";
  const prefix = route === "manus-storage" ? "/manus-storage" : "/api";

  currentUrl.searchParams.delete("__route");
  currentUrl.searchParams.delete("path");

  const normalizedPath = path ? `${prefix}/${path}` : prefix;
  const query = currentUrl.searchParams.toString();
  req.url = query ? `${normalizedPath}?${query}` : normalizedPath;
}

export default function handler(req: any, res: any) {
  normalizeVercelRewriteUrl(req);

  try {
    return getApp()(req, res);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Serverless function failed";

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        app: "EconoRotas",
        error: message,
      })
    );
  }
}
