const PRODUCTION_API_BASE_URL = "https://econo-rotas.vercel.app";
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";

function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return configuredApiBaseUrl;
  }

  const platform = window.Capacitor?.getPlatform?.();
  const isPackagedAndroid =
    platform === "android" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (isPackagedAndroid) {
    return PRODUCTION_API_BASE_URL;
  }

  return configuredApiBaseUrl;
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
