import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { buildApiUrl } from "./lib/apiBase";
import { reportUnknownError } from "./lib/errorReporter";

const isRetryableRequestError = (error: unknown) => {
  if (error instanceof TRPCClientError) {
    if (error.message === UNAUTHED_ERR_MSG) return false;
    const httpStatus = error.data?.httpStatus;
    return typeof httpStatus === "number" && httpStatus >= 500;
  }

  if (error instanceof TypeError) return true;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("failed to fetch") || message.includes("network");
  }

  return false;
};

const isExpectedClientError = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return false;

  if (error.message === UNAUTHED_ERR_MSG) return true;

  const httpStatus = error.data?.httpStatus;
  if (typeof httpStatus === "number" && httpStatus >= 400 && httpStatus < 500) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("ja existe uma conta") ||
    message.includes("já existe uma conta") ||
    message.includes("e-mail ou senha incorretos") ||
    message.includes("informe seu") ||
    message.includes("senha")
  );
};

const isTransientFetchFailure = (error: unknown) => {
  if (error instanceof TRPCClientError) {
    const message = error.message.toLowerCase();
    return (
      !error.data?.httpStatus &&
      (message.includes("failed to fetch") ||
        message.includes("networkerror") ||
        message.includes("load failed"))
    );
  }

  if (error instanceof TypeError) {
    return error.message.toLowerCase().includes("fetch");
  }

  return false;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        isRetryableRequestError(error) && failureCount < 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
const enableDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

const setupAnalytics = () => {
  if (typeof window === "undefined") return;

  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;

  if (!endpoint || !websiteId) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = `${endpoint.replace(/\/$/, "")}/umami`;
  script.dataset.websiteId = websiteId;
  document.body.appendChild(script);
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return false;
  if (typeof window === "undefined") return false;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return false;

  window.location.href = getLoginUrl();
  return true;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    if (redirectToLoginIfUnauthorized(error)) return;
    if (isTransientFetchFailure(error)) {
      console.warn("[API Query Transport Warning]", error);
      return;
    }
    console.error("[API Query Error]", error);
    reportUnknownError("Falha ao consultar dados da API", error, "react-query.query", {
      queryHash: event.query.queryHash,
    });
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (isExpectedClientError(error)) {
      console.warn("[API Mutation Validation]", error);
      return;
    }
    console.error("[API Mutation Error]", error);
    reportUnknownError("Falha ao salvar ou executar acao na API", error, "react-query.mutation");
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: buildApiUrl("/api/trpc"),
      transformer: superjson,
      headers() {
        return {
          ...(enableDevLogin ? { "x-dev-login": "true" } : {}),
        };
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

setupAnalytics();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              window.dispatchEvent(new CustomEvent("econorotas:pwa-update"));
            }
          });
        });
      })
      .catch((error) => {
        console.error("[PWA] Service worker registration failed", error);
        reportUnknownError(
          "Falha ao preparar funcionamento offline/PWA",
          error,
          "pwa.service-worker"
        );
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
