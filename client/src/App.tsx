import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Routes from "./pages/Routes";
import RouteDetail from "./pages/RouteDetail";
import CreateRoute from "./pages/CreateRoute";
import Analytics from "./pages/Analytics";
import Chat from "./pages/Chat";
import Schedules from "./pages/Schedules";
import History from "./pages/History";
import Profile from "./pages/Profile";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/routes"} component={Routes} />
      <Route path={"/routes/new"} component={CreateRoute} />
      <Route path={"/routes/:id"} component={RouteDetail} />
      <Route path={"/analytics"} component={Analytics} />
      <Route path={"/chat"} component={Chat} />
      <Route path={"/schedules"} component={Schedules} />
      <Route path={"/history"} component={History} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
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
