const PRODUCTION_API_BASE_URL = "https://econo-rotas.vercel.app";
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isAndroidWebViewLocalhost() {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  if (!LOCAL_APP_HOSTS.has(hostname)) return false;

  const userAgent = window.navigator.userAgent || "";
  return /Android/i.test(userAgent) && (/\bwv\b/i.test(userAgent) || /Version\/\d/i.test(userAgent));
}

function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return configuredApiBaseUrl;
  }

  const platform = window.Capacitor?.getPlatform?.();
  const isPackagedAndroid =
    platform === "android" && LOCAL_APP_HOSTS.has(window.location.hostname);

  if (isPackagedAndroid || isAndroidWebViewLocalhost()) {
    return PRODUCTION_API_BASE_URL;
  }

  return configuredApiBaseUrl;
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
