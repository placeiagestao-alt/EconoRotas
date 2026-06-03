import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  getNavigationProvider,
  NAVIGATION_PROVIDER_CHANGED,
  NAVIGATION_PROVIDERS,
  setNavigationProvider,
  type NavigationProvider,
} from "@/lib/navigationPreference";
import AndroidUpdateBanner from "@/components/AndroidUpdateBanner";
import { BrandLogo } from "@/components/BrandLogo";
import {
  BarChart3,
  CalendarClock,
  History,
  LayoutDashboard,
  LogOut,
  MapPinned,
  MessageSquare,
  Navigation,
  PanelLeft,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const APP_NAME = "EconoRota";

const menuItems = [
  { icon: LayoutDashboard, label: "Painel", path: "/" },
  { icon: MapPinned, label: "Rotas", path: "/routes" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: MessageSquare, label: "Chat", path: "/chat" },
  { icon: CalendarClock, label: "Agendamentos", path: "/schedules" },
  { icon: History, label: "Histórico", path: "/history" },
  { icon: UserCircle, label: "Perfil", path: "/profile" },
];

const adminMenuItems = [
  { icon: ShieldCheck, label: "Operação", path: "/operations" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

function isMenuItemActive(path: string, location: string) {
  if (path === "/") return location === "/";
  return location === path || location.startsWith(`${path}/`);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-8 rounded-3xl border border-border/80 bg-white p-8 shadow-[0_20px_40px_rgb(15_23_42_/_10%)]">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              Entre para continuar
            </h1>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              O acesso ao painel exige autenticação. Entre para acessar suas rotas.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full"
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [navigationProvider, updateNavigationProvider] =
    useState<NavigationProvider>(() => getNavigationProvider());
  const sidebarRef = useRef<HTMLDivElement>(null);
  const canSeeAdminMenu = user?.role === "admin";
  const visibleMenuItems =
    canSeeAdminMenu ? [...menuItems, ...adminMenuItems] : menuItems;
  const activeMenuItem = visibleMenuItems.find(item =>
    isMenuItemActive(item.path, location)
  );
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleProviderChange = (event: Event) => {
      const nextProvider = (event as CustomEvent<NavigationProvider>).detail;
      updateNavigationProvider(nextProvider);
    };

    window.addEventListener(NAVIGATION_PROVIDER_CHANGED, handleProviderChange);
    return () => {
      window.removeEventListener(NAVIGATION_PROVIDER_CHANGED, handleProviderChange);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          variant="floating"
          collapsible="icon"
          className="border-r-0 p-2"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/60">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-sidebar-border/80 bg-white hover:bg-sidebar-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Alternar navegação"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex min-w-0 items-center gap-2">
                  <BrandLogo variant="mark" className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <span className="block truncate text-base font-semibold tracking-tight">
                      Econo<span className="text-primary">Rota</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      Roteirização Inteligente
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-3">
              {visibleMenuItems.map(item => {
                const isActive = isMenuItemActive(item.path, location);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            <div className="mx-2 mt-2 rounded-xl border border-sidebar-border/70 bg-white/80 p-2 group-data-[collapsible=icon]:hidden">
              <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                <Navigation className="h-3.5 w-3.5" />
                <span>Navegador de rota</span>
              </div>
              <Select
                value={navigationProvider}
                onValueChange={(value) => {
                  if (value === "google_maps" || value === "waze") {
                    setNavigationProvider(value);
                  }
                }}
              >
                <SelectTrigger size="sm" className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {NAVIGATION_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border/60">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/50 px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border/80 shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/75 bg-white/95 px-2 shadow-[0_8px_18px_rgb(15_23_42_/_8%)]">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-xl" />
              <BrandLogo variant="mark" className="h-8 w-8 shrink-0" />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {APP_NAME}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeMenuItem?.label ?? "Menu"}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1320px] space-y-4 md:space-y-5">
            <AndroidUpdateBanner />
            {children}
          </div>
        </main>
      </SidebarInset>
    </>
  );
}
