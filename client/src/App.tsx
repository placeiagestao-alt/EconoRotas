import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorReportMonitor from "./components/ErrorReportMonitor";
import ErrorBoundary from "./components/ErrorBoundary";
import PwaStatusMonitor from "./components/PwaStatusMonitor";
import { ThemeProvider } from "./contexts/ThemeContext";

const CHUNK_REFRESH_KEY = "econorotas:chunk-refresh";

function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /dynamically imported module|Failed to fetch|Importing a module script failed|error loading dynamically imported module/i.test(
    error.message
  );
}

function reloadOnceForChunkError() {
  if (typeof window === "undefined") return false;

  const now = Date.now();
  const lastReload = Number(window.sessionStorage.getItem(CHUNK_REFRESH_KEY) || 0);
  if (lastReload && now - lastReload < 30_000) return false;

  window.sessionStorage.setItem(CHUNK_REFRESH_KEY, String(now));
  window.dispatchEvent(new CustomEvent("econorotas:pwa-update"));
  setTimeout(() => window.location.reload(), 50);
  return true;
}

function lazyPage<T extends { default: ComponentType<any> }>(
  importer: () => Promise<T>
) {
  return lazy(() =>
    importer().catch((error) => {
      if (isChunkLoadError(error) && reloadOnceForChunkError()) {
        return {
          default: () => <DashboardLayoutSkeleton />,
        } as unknown as T;
      }
      throw error;
    })
  );
}

const Home = lazyPage(() => import("./pages/Home"));
const Routes = lazyPage(() => import("./pages/Routes"));
const RouteDetail = lazyPage(() => import("./pages/RouteDetail"));
const CreateRoute = lazyPage(() => import("./pages/CreateRoute"));
const Analytics = lazyPage(() => import("./pages/Analytics"));
const Chat = lazyPage(() => import("./pages/Chat"));
const Schedules = lazyPage(() => import("./pages/Schedules"));
const History = lazyPage(() => import("./pages/History"));
const Profile = lazyPage(() => import("./pages/Profile"));
const DownloadApk = lazyPage(() => import("./pages/DownloadApk"));
const Operations = lazyPage(() => import("./pages/Operations"));

function ProtectedRoute({
  component: Component,
  adminOnly = false,
}: {
  component: ComponentType;
  adminOnly?: boolean;
}) {
  const { loading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      setLocation("/", { replace: true });
      return;
    }
    if (adminOnly && user?.role !== "admin") {
      setLocation("/routes", { replace: true });
    }
  }, [adminOnly, loading, isAuthenticated, setLocation, user?.role]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!isAuthenticated) return <DashboardLayoutSkeleton />;
  if (adminOnly && user?.role !== "admin") return <DashboardLayoutSkeleton />;

  return <Component />;
}

function Router() {
  return (
    <Suspense fallback={<DashboardLayoutSkeleton />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/baixar-apk"} component={DownloadApk} />
        <Route path={"/baixar-aplicativo"} component={DownloadApk} />
        <Route path={"/apk"} component={DownloadApk} />
        <Route path={"/aplicativo"} component={DownloadApk} />
        <Route path={"/routes"}>
          <ProtectedRoute component={Routes} />
        </Route>
        <Route path={"/routes/new"}>
          <ProtectedRoute component={CreateRoute} />
        </Route>
        <Route path={"/routes/:id"}>
          <ProtectedRoute component={RouteDetail} />
        </Route>
        <Route path={"/routes/:id/share"}>
          <ProtectedRoute component={RouteDetail} />
        </Route>
        <Route path={"/analytics"}>
          <ProtectedRoute component={Analytics} />
        </Route>
        <Route path={"/chat"}>
          <ProtectedRoute component={Chat} />
        </Route>
        <Route path={"/schedules"}>
          <ProtectedRoute component={Schedules} />
        </Route>
        <Route path={"/history"}>
          <ProtectedRoute component={History} />
        </Route>
        <Route path={"/profile"}>
          <ProtectedRoute component={Profile} />
        </Route>
        <Route path={"/operations"}>
          <ProtectedRoute component={Operations} adminOnly />
        </Route>
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <ErrorReportMonitor />
          <PwaStatusMonitor />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
