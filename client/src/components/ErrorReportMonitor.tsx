import {
  APP_ANOMALY_EVENT,
  markAnomalyReportPrompted,
  openWhatsAppReport,
  reportAppAnomaly,
  shouldPromptAnomalyReport,
  type AppAnomaly,
} from "@/lib/errorReporter";
import { trpc } from "@/lib/trpc";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";
import { useEffect } from "react";
import { toast } from "sonner";

function getRuntimeKind() {
  const platform = window.Capacitor?.getPlatform?.();
  if (platform === "android") return "Aplicativo Android";
  if (platform === "ios") return "PWA iPhone";
  return window.matchMedia("(display-mode: standalone)").matches
    ? "PWA"
    : "Site";
}

function isOpaqueSafariScriptError(event: ErrorEvent) {
  return (
    event.message === "Script error." &&
    !event.filename &&
    event.lineno === 0 &&
    event.colno === 0 &&
    !event.error
  );
}

function getFrontendDiagnostics() {
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  return {
    online: navigator.onLine,
    visibilityState: document.visibilityState,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    navigationType: navigation?.type,
    pageLoadedMs: Math.round(performance.now()),
  };
}

function isExpectedPermissionAnomaly(anomaly: AppAnomaly) {
  if (anomaly.message?.includes(NOT_ADMIN_ERR_MSG)) return true;
  if (anomaly.stack?.includes(NOT_ADMIN_ERR_MSG)) return true;

  const queryHash = anomaly.metadata?.queryHash;
  return (
    anomaly.source === "react-query.query" &&
    typeof queryHash === "string" &&
    queryHash.includes('"admin"') &&
    anomaly.message?.includes("required permission")
  );
}

export default function ErrorReportMonitor() {
  const reportEventMutation = trpc.events.report.useMutation();

  useEffect(() => {
    const handleAnomaly = (event: Event) => {
      const anomaly = (event as CustomEvent<AppAnomaly>).detail;

      if (isExpectedPermissionAnomaly(anomaly)) {
        return;
      }

      reportEventMutation.mutate({
        type: "frontend_error",
        severity: anomaly.severity ?? "error",
        source: anomaly.source ?? "app",
        title: anomaly.title,
        message: anomaly.message,
        runtime: getRuntimeKind(),
        url: window.location.href,
        userAgent: window.navigator.userAgent,
        appVersion: import.meta.env.VITE_ANDROID_APP_VERSION || "web",
        metadata: {
          ...(anomaly.metadata ?? {}),
          stack: anomaly.stack,
        },
      });

      if (anomaly.severity === "warning" || anomaly.severity === "info") {
        return;
      }

      if (!shouldPromptAnomalyReport()) return;
      markAnomalyReportPrompted();

      toast.error("Erro detectado no EconoRota.", {
        description:
          "Envie o relatorio para o suporte analisar a falha pelo WhatsApp.",
        action: {
          label: "Enviar",
          onClick: () => openWhatsAppReport(anomaly),
        },
        duration: 20000,
      });
    };

    const handleWindowError = (event: ErrorEvent) => {
      const opaqueSafariScriptError = isOpaqueSafariScriptError(event);

      reportAppAnomaly({
        title: opaqueSafariScriptError
          ? "Erro de script sem detalhes no Safari"
          : "Erro inesperado na interface",
        message: event.message || "Erro sem mensagem informado pelo navegador.",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: opaqueSafariScriptError ? "window.error.opaque-script" : "window.error",
        metadata: {
          file: event.filename,
          line: event.lineno,
          column: event.colno,
          ...getFrontendDiagnostics(),
        },
        severity: opaqueSafariScriptError ? "warning" : "fatal",
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportAppAnomaly({
        title: "Falha inesperada em tarefa assíncrona",
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Promise rejeitada sem mensagem clara.",
        stack: reason instanceof Error ? reason.stack : undefined,
        source: "window.unhandledrejection",
        metadata: getFrontendDiagnostics(),
        severity: "error",
      });
    };

    window.addEventListener(APP_ANOMALY_EVENT, handleAnomaly);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener(APP_ANOMALY_EVENT, handleAnomaly);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
    };
  }, [reportEventMutation]);

  return null;
}
