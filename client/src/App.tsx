import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const Routes = lazy(() => import("./pages/Routes"));
const RouteDetail = lazy(() => import("./pages/RouteDetail"));
const CreateRoute = lazy(() => import("./pages/CreateRoute"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Chat = lazy(() => import("./pages/Chat"));
const Schedules = lazy(() => import("./pages/Schedules"));
const History = lazy(() => import("./pages/History"));
const Profile = lazy(() => import("./pages/Profile"));

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || isAuthenticated) return;
    setLocation("/", { replace: true });
  }, [loading, isAuthenticated, setLocation]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!isAuthenticated) return <DashboardLayoutSkeleton />;

  return <Component />;
}

function Router() {
  return (
    <Suspense fallback={<DashboardLayoutSkeleton />}>
      <Switch>
        <Route path={"/"} component={Home} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
