export type AppAnomalySeverity = "info" | "warning" | "error" | "fatal";

export type AppAnomaly = {
  title: string;
  message?: string;
  severity?: AppAnomalySeverity;
  source?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
};

export const APP_ANOMALY_EVENT = "econorotas:app-anomaly";

const WHATSAPP_NUMBER = "5518996531491";
const RECENT_REPORT_KEY = "econorotas:last-anomaly-report";
const MIN_REPORT_INTERVAL_MS = 60_000;

function getRuntimeKind() {
  const platform = window.Capacitor?.getPlatform?.();
  if (platform === "android") return "Aplicativo Android";
  if (platform === "ios") return "PWA iPhone";
  return window.matchMedia("(display-mode: standalone)").matches
    ? "PWA"
    : "Site";
}

function stringifyMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return "";

  try {
    return JSON.stringify(metadata, null, 2).slice(0, 1200);
  } catch {
    return "[metadata indisponivel]";
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === "string" ? error : JSON.stringify(error),
    stack: undefined,
  };
}

export function buildWhatsAppReport(anomaly: AppAnomaly) {
  const lines = [
    "EconoRota - alerta de erro",
    `Severidade: ${anomaly.severity ?? "error"}`,
    `Origem: ${anomaly.source ?? "app"}`,
    `Ambiente: ${getRuntimeKind()}`,
    `URL: ${window.location.href}`,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
    `Titulo: ${anomaly.title}`,
    anomaly.message ? `Mensagem: ${anomaly.message}` : "",
    anomaly.stack ? `Stack: ${anomaly.stack.slice(0, 1200)}` : "",
    stringifyMetadata(anomaly.metadata)
      ? `Dados: ${stringifyMetadata(anomaly.metadata)}`
      : "",
    `User agent: ${window.navigator.userAgent.slice(0, 500)}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export function getWhatsAppReportUrl(anomaly: AppAnomaly) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    buildWhatsAppReport(anomaly)
  )}`;
}

export function openWhatsAppReport(anomaly: AppAnomaly) {
  const url = getWhatsAppReportUrl(anomaly);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
}

export function shouldPromptAnomalyReport() {
  const lastReport = Number(window.localStorage.getItem(RECENT_REPORT_KEY) ?? 0);
  return Date.now() - lastReport > MIN_REPORT_INTERVAL_MS;
}

export function markAnomalyReportPrompted() {
  window.localStorage.setItem(RECENT_REPORT_KEY, String(Date.now()));
}

export function reportAppAnomaly(anomaly: AppAnomaly) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<AppAnomaly>(APP_ANOMALY_EVENT, {
      detail: {
        severity: "error",
        ...anomaly,
      },
    })
  );
}

export function reportUnknownError(
  title: string,
  error: unknown,
  source: string,
  metadata?: Record<string, unknown>
) {
  const normalized = normalizeError(error);

  reportAppAnomaly({
    title,
    message: normalized.message,
    stack: normalized.stack,
    source,
    metadata,
    severity: "error",
  });
}

declare global {
  interface Window {
    Capacitor?: {
      getPlatform?: () => string;
    };
  }
}
