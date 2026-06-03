import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { lazy, Suspense } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Flag,
  MapPin,
  Navigation,
  PackageCheck,
  Pencil,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";
import AddressInputSimple from "@/components/AddressInputSimple";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { buildNavigationUrl } from "@/lib/navigationPreference";
import {
  readDeliveryProgress,
  saveDeliveryProgress,
  saveLastRouteProgress,
  type DeliveryProgressState,
} from "@/lib/routeProgress";
import { trpc } from "@/lib/trpc";
import { searchAddress } from "@/services/maps/geocodingService";
import {
  calculateDistanceKm,
  getCurrentPosition,
  type Coordinate,
} from "@/services/maps/locationService";
import {
  findNearbyPendingStop,
  type ProximityAlertCandidate,
} from "@/services/proximityAlertService";
import { toast } from "sonner";

const RouteMap = lazy(() => import("@/components/RouteMap"));

type DeliveryState = DeliveryProgressState;

type Stop = {
  id?: number;
  address: string;
  latitude: number;
  longitude: number;
  sequence: number;
  packageNumber?: string;
  notes?: string;
  isSequentialImile?: boolean;
};

type RoutePoint = {
  address: string;
  latitude: number;
  longitude: number;
};

type StopDraft = RoutePoint & {
  packageNumber: string;
  notes: string;
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const DEFAULT_DELIVERY_STATE: DeliveryState = {
  started: false,
  currentIndex: 0,
  delivered: [],
  failed: [],
};

const BLOCKING_AUDIT_ISSUE_TYPES = new Set([
  "missing_coordinates",
  "invalid_coordinates",
  "empty_address",
  "generic_address",
  "duplicate_sequence",
  "region_revisited",
]);
const STRUCTURAL_AUDIT_ISSUE_TYPES = new Set([
  "missing_coordinates",
  "invalid_coordinates",
  "empty_address",
  "generic_address",
]);
const EMPTY_ROUTE_POINT: RoutePoint = { address: "", latitude: 0, longitude: 0 };
const FAR_FROM_STOP_ALERT_KM = 0.5;
const SEQUENCE_INCOHERENCE_ALERT_KM = 0.45;
const AUTO_SELECT_NEARBY_STOP_RADIUS_KM = 0.12;
const AUTO_SELECT_NEARBY_STOP_EXTRA_KM = 0.05;
const PROXIMITY_ALERT_RADIUS_METERS = 20;
const PROXIMITY_ALERT_REPEAT_INTERVAL_MS = 2 * 60 * 1000;
const PROXIMITY_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 15_000,
};

function isBlockingAuditIssue(issue: any) {
  if (!issue?.type) return false;
  if (BLOCKING_AUDIT_ISSUE_TYPES.has(issue.type)) return true;

  return (
    issue.type === "nearby_stop_skipped" &&
    (issue.severity === "critical" || issue.severity === "high")
  );
}

function isStructuralAuditIssue(issue: any) {
  return STRUCTURAL_AUDIT_ISSUE_TYPES.has(issue?.type);
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStopNotes(notes?: string | null) {
  const raw = notes?.trim();
  if (!raw) return { packageNumber: undefined as string | undefined, notes: undefined as string | undefined };

  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  let packageNumber: string | undefined;
  const remaining: string[] = [];

  for (const part of parts) {
    const match = part.match(/^(Pacote|STOP)\s*:\s*(.+)$/i);
    if (match?.[2] && !packageNumber) {
      packageNumber = match[2].trim();
      continue;
    }
    remaining.push(part);
  }

  return {
    packageNumber,
    notes: remaining.length ? remaining.join(" | ") : undefined,
  };
}

function isLegacyImileTrackingPackage(packageNumber?: string, notes?: string) {
  const trimmedPackage = packageNumber?.trim();
  if (!trimmedPackage || !/^\d{10,16}$/.test(trimmedPackage)) return false;

  return /\bRastreio\s*:/i.test(notes || "");
}

function isImileStopNotes(notes?: string) {
  return /\b(Status iMile|Distancia app|Entregas agrupadas|Destinatario|Telefone)\s*:/i.test(
    notes || ""
  );
}

function isImileRouteText(value?: string | null) {
  return /\b(iMile|Rider Delivery|captura iMile)\b/i.test(value || "");
}

function getSequentialStopPackageNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function buildStopNotes(packageNumber: string, notes: string) {
  const parts = [
    packageNumber.trim() ? `Pacote: ${packageNumber.trim()}` : "",
    notes.trim(),
  ].filter(Boolean);

  return parts.length ? parts.join(" | ") : null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "optimized":
      return "Otimizada";
    case "completed":
      return "Concluída";
    case "cancelled":
      return "Cancelada";
    default:
      return "Rascunho";
  }
}

function buildStopNavigationUrl(stop?: Stop) {
  if (!stop) return "#";

  return buildNavigationUrl({
    address: stop.address,
    latitude: stop.latitude,
    longitude: stop.longitude,
  });
}

function openStopInMap(stop?: Stop) {
  const navigationUrl = buildStopNavigationUrl(stop);
  if (navigationUrl === "#") return;

  const opened = window.open(navigationUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = navigationUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.message("Se o mapa não abrir, permita pop-ups ou copie o endereço da parada.");
  }
}

function getStopDisplayLabel(_stop: Stop, fallbackIndex: number) {
  return String(fallbackIndex + 1);
}

function getStopNumberTextClass(label: string) {
  if (label.length >= 6) return "text-sm";
  if (label.length >= 4) return "text-base";
  return "text-xl";
}

function parseRoutePoint(
  address?: string | null,
  latitudeValue?: unknown,
  longitudeValue?: unknown
): RoutePoint | undefined {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  if (latitude === 0 && longitude === 0) {
    return undefined;
  }

  return { address, latitude, longitude };
}

function getEditableRoutePoint(
  address?: string | null,
  latitudeValue?: unknown,
  longitudeValue?: unknown
): RoutePoint {
  return {
    address: address ?? "",
    latitude: toNumber(latitudeValue),
    longitude: toNumber(longitudeValue),
  };
}

function hasValidCoordinates(point: RoutePoint) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    !(point.latitude === 0 && point.longitude === 0) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function getRuntimeKind() {
  const url = window.location.href;
  const userAgent = navigator.userAgent;

  if (url.startsWith("https://localhost") || url.startsWith("http://localhost")) {
    if (/Android/i.test(userAgent)) return "Aplicativo Android";
    return "Aplicativo";
  }

  if (window.matchMedia?.("(display-mode: standalone)").matches) {
    return /iPhone|iPad|iPod/i.test(userAgent) ? "PWA iOS" : "PWA";
  }

  return "Site Vercel";
}

function roundCoordinate(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined;
  return Number(value!.toFixed(6));
}

function formatDistanceMeters(distanceMeters: number) {
  if (distanceMeters < 100) return `${Math.max(1, Math.round(distanceMeters))} m`;
  return `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`;
}

export default function RouteDetail() {
  const params = useParams<{ id: string }>();
  const routeId = Number(params.id);
  const utils = trpc.useUtils();
  const authQuery = trpc.auth.me.useQuery();
  const routeQuery = trpc.routes.get.useQuery(
    { id: routeId },
    { enabled: Number.isFinite(routeId) }
  );
  const stopsQuery = trpc.stops.list.useQuery(
    { routeId },
    { enabled: Number.isFinite(routeId) }
  );
  const auditQuery = trpc.routes.audit.useQuery(
    { id: routeId },
    { enabled: Number.isFinite(routeId) && Boolean(routeQuery.data) }
  );
  const updateRouteMutation = trpc.routes.update.useMutation({
    onSuccess: () => {
      void utils.routes.get.invalidate({ id: routeId });
      void utils.routes.audit.invalidate({ id: routeId });
      void utils.routes.list.invalidate();
    },
  });
  const updateStopMutation = trpc.stops.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.stops.list.invalidate({ routeId }),
        utils.routes.get.invalidate({ id: routeId }),
        utils.routes.audit.invalidate({ id: routeId }),
        utils.routes.list.invalidate(),
      ]);
    },
  });
  const deleteStopMutation = trpc.stops.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.stops.list.invalidate({ routeId }),
        utils.routes.get.invalidate({ id: routeId }),
        utils.routes.audit.invalidate({ id: routeId }),
        utils.routes.list.invalidate(),
      ]);
    },
  });
  const optimizeRemainingMutation = trpc.routes.optimizeRemaining.useMutation({
    onSuccess: async () => {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
      setSelectedStopIndex(null);
      setEditingStopIndex(null);
      await Promise.all([
        utils.routes.get.invalidate({ id: routeId }),
        utils.routes.list.invalidate(),
        utils.stops.list.invalidate({ routeId }),
        utils.routes.audit.invalidate({ id: routeId }),
      ]);
      toast.success("Rota restante reotimizada.");
    },
    onError: async (error) => {
      await utils.routes.audit.invalidate({ id: routeId });
      toast.error(error.message || "Não foi possível reotimizar as paradas restantes.");
    },
  });
  const optimizeRouteMutation = trpc.routes.optimize.useMutation({
    onSuccess: async () => {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
      await Promise.all([
        utils.routes.get.invalidate({ id: routeId }),
        utils.routes.list.invalidate(),
        utils.stops.list.invalidate({ routeId }),
        utils.routes.audit.invalidate({ id: routeId }),
      ]);
      toast.success("Rota otimizada.");
    },
    onError: async (error) => {
      await utils.routes.audit.invalidate({ id: routeId });
      toast.error(error.message || "Não foi possível otimizar a rota.");
    },
  });
  const reportOperationalEventMutation = trpc.events.report.useMutation();
  const [proximityAlertsEnabled, setProximityAlertsEnabled] = useState(false);
  const [proximitySoundEnabled, setProximitySoundEnabled] = useState(true);
  const [proximityVibrationEnabled, setProximityVibrationEnabled] = useState(true);
  const [proximityAudioReady, setProximityAudioReady] = useState(false);
  const [activeProximityAlert, setActiveProximityAlert] =
    useState<ProximityAlertCandidate | null>(null);
  const proximityAlertedAtRef = useRef<Record<number, number>>({});
  const proximityAudioRef = useRef<AudioContext | null>(null);
  const proximityGpsErrorNotifiedRef = useRef(false);

  const stops = useMemo<Stop[]>(
    () => {
      const rawStops = stopsQuery.data ?? [];
      const routeLooksLikeImile =
        isImileRouteText(routeQuery.data?.name) ||
        isImileRouteText(routeQuery.data?.description) ||
        rawStops.some((stop: any) => isImileStopNotes(String(stop.notes || "")));

      return rawStops
        .map((stop: any) => ({
          ...parseStopNotes(stop.notes),
          id: stop.id,
          address: stop.address,
          latitude: toNumber(stop.latitude),
          longitude: toNumber(stop.longitude),
          sequence: stop.sequence,
        }))
        .sort((a: Stop, b: Stop) => a.sequence - b.sequence)
        .map((stop: Stop, index: number) => {
          const isSequentialImile =
            routeLooksLikeImile ||
            isImileStopNotes(stop.notes) ||
            isLegacyImileTrackingPackage(stop.packageNumber, stop.notes);
          const packageNumber =
            isSequentialImile
            ? getSequentialStopPackageNumber(index)
            : stop.packageNumber;

          return {
            ...stop,
            packageNumber,
            isSequentialImile,
          };
        });
    },
    [routeQuery.data?.description, routeQuery.data?.name, stopsQuery.data]
  );
  const routeStartPoint = useMemo(
    () =>
      parseRoutePoint(
        routeQuery.data?.startLocation,
        routeQuery.data?.startLatitude,
        routeQuery.data?.startLongitude
      ),
    [routeQuery.data]
  );
  const routeEndPoint = useMemo(
    () =>
      parseRoutePoint(
        routeQuery.data?.endLocation,
        routeQuery.data?.endLatitude,
        routeQuery.data?.endLongitude
      ),
    [routeQuery.data]
  );

  const [deliveryState, setDeliveryState] = useState<DeliveryState>(
    DEFAULT_DELIVERY_STATE
  );
  const [startPoint, setStartPoint] = useState<RoutePoint>(EMPTY_ROUTE_POINT);
  const [endPoint, setEndPoint] = useState<RoutePoint>(EMPTY_ROUTE_POINT);
  const [isSavingEndpoints, setIsSavingEndpoints] = useState(false);
  const [stopSearch, setStopSearch] = useState("");
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [editingStopIndex, setEditingStopIndex] = useState<number | null>(null);
  const [stopDraft, setStopDraft] = useState<StopDraft>({
    address: "",
    latitude: 0,
    longitude: 0,
    packageNumber: "",
    notes: "",
  });
  const [isLocatingForReoptimization, setIsLocatingForReoptimization] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [loadedDeliveryRouteId, setLoadedDeliveryRouteId] = useState<number | null>(
    null
  );

  useEffect(() => {
    const route = routeQuery.data;
    if (!route) {
      setStartPoint(EMPTY_ROUTE_POINT);
      setEndPoint(EMPTY_ROUTE_POINT);
      return;
    }

    setStartPoint(
      getEditableRoutePoint(
        route.startLocation,
        route.startLatitude,
        route.startLongitude
      )
    );
    setEndPoint(
      getEditableRoutePoint(route.endLocation, route.endLatitude, route.endLongitude)
    );
  }, [
    routeQuery.data?.id,
    routeQuery.data?.startLocation,
    routeQuery.data?.startLatitude,
    routeQuery.data?.startLongitude,
    routeQuery.data?.endLocation,
    routeQuery.data?.endLatitude,
    routeQuery.data?.endLongitude,
  ]);

  useEffect(() => {
    if (!Number.isFinite(routeId)) return;
    const routeName = routeQuery.data?.name;
    if (routeName) {
      saveLastRouteProgress(routeId, routeName);
    }
  }, [routeId, routeQuery.data?.name]);

  useEffect(() => {
    if (!Number.isFinite(routeId)) return;

    setLoadedDeliveryRouteId(null);
    const savedState = readDeliveryProgress(routeId);
    if (!savedState) {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
      setLoadedDeliveryRouteId(routeId);
      return;
    }

    try {
      setDeliveryState({
        started: Boolean(savedState.started),
        currentIndex: Number.isFinite(savedState.currentIndex)
          ? savedState.currentIndex
          : 0,
        delivered: Array.isArray(savedState.delivered) ? savedState.delivered : [],
        failed: Array.isArray(savedState.failed) ? savedState.failed : [],
      });
    } catch {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
    }

    setLoadedDeliveryRouteId(routeId);
  }, [routeId]);

  useEffect(() => {
    if (!Number.isFinite(routeId)) return;
    if (loadedDeliveryRouteId !== routeId) return;

    saveDeliveryProgress(routeId, deliveryState);
    saveLastRouteProgress(routeId, routeQuery.data?.name);
  }, [deliveryState, loadedDeliveryRouteId, routeId, routeQuery.data?.name]);

  useEffect(() => {
    if (!Number.isFinite(routeId)) return;

    const persistCurrentProgress = () => {
      saveDeliveryProgress(routeId, deliveryState);
      saveLastRouteProgress(routeId, routeQuery.data?.name);
    };

    window.addEventListener("pagehide", persistCurrentProgress);
    document.addEventListener("visibilitychange", persistCurrentProgress);

    return () => {
      window.removeEventListener("pagehide", persistCurrentProgress);
      document.removeEventListener("visibilitychange", persistCurrentProgress);
    };
  }, [deliveryState, routeId, routeQuery.data?.name]);

  useEffect(() => {
    if (stops.length === 0) return;

    setDeliveryState((current) => ({
      ...current,
      currentIndex: Math.min(current.currentIndex, stops.length - 1),
      delivered: current.delivered.filter((index) => index < stops.length),
      failed: current.failed.filter((index) => index < stops.length),
    }));
  }, [stops.length]);

  const deliveredSet = useMemo(
    () => new Set(deliveryState.delivered),
    [deliveryState.delivered]
  );
  const failedSet = useMemo(
    () => new Set(deliveryState.failed),
    [deliveryState.failed]
  );
  const deliveredCount = deliveredSet.size;
  const failedCount = failedSet.size;
  const handledCount = new Set([
    ...deliveryState.delivered,
    ...deliveryState.failed,
  ]).size;
  const isComplete = stops.length > 0 && handledCount >= stops.length;
  const currentStop = stops[deliveryState.currentIndex];
  const activeProximityStop =
    activeProximityAlert?.stopIndex !== undefined
      ? stops[activeProximityAlert.stopIndex]
      : undefined;
  const nextStop = stops.find(
    (_, index) => !deliveredSet.has(index) && !failedSet.has(index)
  );
  const progressValue = stops.length > 0 ? (handledCount / stops.length) * 100 : 0;
  const handledStopIds = useMemo(
    () =>
      Array.from(new Set([...deliveryState.delivered, ...deliveryState.failed]))
        .map((index) => stops[index]?.id)
        .filter((id): id is number => typeof id === "number"),
    [deliveryState.delivered, deliveryState.failed, stops]
  );
  const remainingStopsCount = Math.max(0, stops.length - handledStopIds.length);
  const reportRouteExecutionEvent = (input: {
    type: string;
    severity?: "info" | "warning" | "error";
    title: string;
    message?: string;
    stopId?: number;
    metadata?: Record<string, unknown>;
  }) => {
    reportOperationalEventMutation.mutate({
      type: input.type,
      severity: input.severity ?? "info",
      source: "route.execution",
      title: input.title,
      message: input.message,
      routeId,
      stopId: input.stopId,
      runtime: getRuntimeKind(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      metadata: {
        routeName: routeQuery.data?.name,
        stopsTotal: stops.length,
        deliveredCount,
        failedCount,
        handledCount,
        ...input.metadata,
      },
    });
  };

  const ensureProximityAudioReady = async () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        setProximityAudioReady(false);
        toast.warning("Som de alerta não suportado neste navegador.");
        return false;
      }

      const context = proximityAudioRef.current ?? new AudioContextClass();
      proximityAudioRef.current = context;

      if (context.state === "suspended") {
        await context.resume();
      }

      setProximityAudioReady(true);
      setProximityAlertsEnabled(true);
      toast.success("Alertas de proximidade ativados.");
      return true;
    } catch {
      setProximityAudioReady(false);
      toast.warning("Não foi possível ativar o som. O alerta visual continuará funcionando.");
      setProximityAlertsEnabled(true);
      return false;
    }
  };

  const playProximityAlert = () => {
    if (proximitySoundEnabled && proximityAudioReady && proximityAudioRef.current) {
      const context = proximityAudioRef.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.48);
    }

    if (proximityVibrationEnabled && "vibrate" in navigator) {
      navigator.vibrate([180, 80, 180]);
    }
  };

  useEffect(() => {
    if (!deliveryState.started || isComplete || !proximityAlertsEnabled) return;
    if (!navigator.geolocation) {
      toast.warning("GPS indisponível para alertas de proximidade.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nearby = findNearbyPendingStop({
          origin: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          stops,
          currentIndex: deliveryState.currentIndex,
          deliveredIndexes: deliveryState.delivered,
          failedIndexes: deliveryState.failed,
          lastAlertedAtByIndex: proximityAlertedAtRef.current,
          now: Date.now(),
          radiusMeters: PROXIMITY_ALERT_RADIUS_METERS,
          repeatIntervalMs: PROXIMITY_ALERT_REPEAT_INTERVAL_MS,
        });

        if (!nearby) return;

        proximityAlertedAtRef.current[nearby.stopIndex] = nearby.alertedAt;
        setActiveProximityAlert(nearby);
        playProximityAlert();

        const stop = stops[nearby.stopIndex];
        const stopLabel = getStopDisplayLabel(stop, nearby.stopIndex);
        toast.warning(`Entrega próxima: parada ${stopLabel} a ${formatDistanceMeters(nearby.distanceMeters)}.`, {
          duration: 12000,
        });

        reportRouteExecutionEvent({
          type: "route_nearby_stop_detected",
          severity: "warning",
          title: "Entrega próxima detectada",
          message: `Parada ${stopLabel} a ${formatDistanceMeters(nearby.distanceMeters)}.`,
          stopId: stop.id,
          metadata: {
            nearbyStopIndex: nearby.stopIndex,
            nearbyStopPackage: stopLabel,
            nearbyStopAddress: stop.address,
            distanceMeters: Math.round(nearby.distanceMeters),
            currentStopIndex: deliveryState.currentIndex,
            currentStopPackage: currentStop
              ? getStopDisplayLabel(currentStop, deliveryState.currentIndex)
              : undefined,
            driverLatitude: roundCoordinate(position.coords.latitude),
            driverLongitude: roundCoordinate(position.coords.longitude),
          },
        });
      },
      () => {
        if (proximityGpsErrorNotifiedRef.current) return;
        proximityGpsErrorNotifiedRef.current = true;
        toast.warning("Não foi possível monitorar GPS para alertas de proximidade.");
      },
      PROXIMITY_WATCH_OPTIONS
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [
    currentStop,
    deliveryState.currentIndex,
    deliveryState.delivered,
    deliveryState.failed,
    deliveryState.started,
    isComplete,
    proximityAlertsEnabled,
    proximityAudioReady,
    proximitySoundEnabled,
    proximityVibrationEnabled,
    stops,
  ]);

  useEffect(() => {
    if (!activeProximityAlert) return;
    if (
      activeProximityAlert.stopIndex === deliveryState.currentIndex ||
      deliveredSet.has(activeProximityAlert.stopIndex) ||
      failedSet.has(activeProximityAlert.stopIndex)
    ) {
      setActiveProximityAlert(null);
    }
  }, [activeProximityAlert, deliveredSet, deliveryState.currentIndex, failedSet]);

  const findNearestPendingStopIndex = (
    origin: Coordinate,
    handledIndexes: Set<number>
  ) => {
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    stops.forEach((stop, index) => {
      if (handledIndexes.has(index)) return;
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return;
      if (stop.latitude === 0 && stop.longitude === 0) return;

      const distance = calculateDistanceKm(origin, {
        latitude: stop.latitude,
        longitude: stop.longitude,
      });

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  };
  const filteredStops = useMemo(() => {
    const query = normalizeText(stopSearch);
    return stops
      .map((stop, index) => ({ stop, index }))
      .filter(({ stop }) => {
        if (!query) return true;
        return normalizeText(stop.address).includes(query);
      });
  }, [stopSearch, stops]);
  const blockingAuditIssues = useMemo(
    () =>
      (auditQuery.data?.issues || []).filter((issue: any) => isBlockingAuditIssue(issue)),
    [auditQuery.data?.issues]
  );
  const structuralAuditIssues = useMemo(
    () =>
      (auditQuery.data?.issues || []).filter((issue: any) =>
        isStructuralAuditIssue(issue)
      ),
    [auditQuery.data?.issues]
  );
  const hasBlockingAuditIssues = blockingAuditIssues.length > 0;
  const hasStructuralAuditIssues = structuralAuditIssues.length > 0;
  const hasReoptimizableAuditIssues =
    hasBlockingAuditIssues && !hasStructuralAuditIssues;
  const canSeeRouteAuditPanel = authQuery.data?.role === "admin";

  const completeRoute = async () => {
    await updateRouteMutation.mutateAsync({
      id: routeId,
      status: "completed",
    });
    toast.success("Rota concluida.");
  };

  const reoptimizeAfterAuditBlock = async () => {
    if (remainingStopsCount < 2) {
      toast.error("A rota precisa ter pelo menos 2 paradas pendentes para refazer a sequência.");
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message("Fiscal encontrou incoerência. Recalculando a rota para novo julgamento...");
      const currentPosition = await getCurrentPosition();
      const payload = {
        id: routeId,
        mode: routeQuery.data?.mode ?? "balanced",
        localityMode: "strict" as const,
        startLatitude: currentPosition.latitude,
        startLongitude: currentPosition.longitude,
      };

      if (deliveryState.started || handledStopIds.length > 0) {
        optimizeRemainingMutation.mutate({
          ...payload,
          excludeStopIds: handledStopIds,
        });
      } else {
        optimizeRouteMutation.mutate(payload);
      }
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Não foi possível obter sua localização para refazer a rota pelo fiscal."
      );
    } finally {
      setIsLocatingForReoptimization(false);
    }
  };

  const handleStartRoute = async () => {
    if (hasStructuralAuditIssues) {
      const firstIssue = structuralAuditIssues[0];
      toast.error(
        `${firstIssue.title}: corrija as paradas com problema antes de iniciar.`
      );
      return;
    }

    if (hasReoptimizableAuditIssues) {
      await reoptimizeAfterAuditBlock();
      return;
    }

    const firstPendingIndex = stops.findIndex(
      (_, index) => !deliveredSet.has(index) && !failedSet.has(index)
    );
    let currentIndex = firstPendingIndex >= 0 ? firstPendingIndex : 0;
    const locationStrategy: "saved_sequence" = "saved_sequence";

    setDeliveryState((current) => ({
      ...current,
      started: true,
      currentIndex,
    }));

    const selectedStop = stops[currentIndex];
    reportRouteExecutionEvent({
      type: "route_execution_started",
      title: "Execução de rota iniciada",
      stopId: selectedStop?.id,
      metadata: {
        selectedStopIndex: currentIndex,
        selectedStopAddress: selectedStop?.address,
        selectedStopPackage: selectedStop
          ? getStopDisplayLabel(selectedStop, currentIndex)
          : undefined,
        handledStopsExcluded: handledStopIds.length,
        locationStrategy,
      },
    });
  };

  const handleStopResultAtIndex = async (
    stopIndex: number,
    result: "delivered" | "failed"
  ) => {
    const targetStop = stops[stopIndex];
    if (!targetStop) return;

    const delivered = Array.from(
      new Set([
        ...deliveryState.delivered.filter((index) => index !== stopIndex),
        ...(result === "delivered" ? [stopIndex] : []),
      ])
    ).sort((a, b) => a - b);
    const failed = Array.from(
      new Set([
        ...deliveryState.failed.filter((index) => index !== stopIndex),
        ...(result === "failed" ? [stopIndex] : []),
      ])
    ).sort((a, b) => a - b);
    const handled = new Set([...delivered, ...failed]);
    const firstPendingIndex = stops.findIndex((_, index) => !handled.has(index));
    const finished = firstPendingIndex === -1;
    let nextIndex = firstPendingIndex;
    let currentPosition: Coordinate | null = null;
    let nearestPendingIndex = -1;
    let distanceFromExpectedStopKm: number | undefined;
    let sequenceGapKm: number | undefined;
    let sequenceDistanceKm: number | undefined;
    let nearestDistanceKm: number | undefined;
    let autoSelectedNearbyStop = false;

    if (!finished) {
      try {
        currentPosition = await getCurrentPosition();
        nearestPendingIndex = findNearestPendingStopIndex(currentPosition, handled);

        if (
          Number.isFinite(targetStop.latitude) &&
          Number.isFinite(targetStop.longitude) &&
          !(targetStop.latitude === 0 && targetStop.longitude === 0)
        ) {
          distanceFromExpectedStopKm = calculateDistanceKm(currentPosition, {
            latitude: targetStop.latitude,
            longitude: targetStop.longitude,
          });
        }

        const sequenceStop = firstPendingIndex >= 0 ? stops[firstPendingIndex] : null;
        const nearestStop = nearestPendingIndex >= 0 ? stops[nearestPendingIndex] : null;
        if (
          sequenceStop &&
          nearestStop &&
          nearestPendingIndex !== firstPendingIndex &&
          Number.isFinite(sequenceStop.latitude) &&
          Number.isFinite(sequenceStop.longitude) &&
          Number.isFinite(nearestStop.latitude) &&
          Number.isFinite(nearestStop.longitude)
        ) {
          sequenceDistanceKm = calculateDistanceKm(currentPosition, {
            latitude: sequenceStop.latitude,
            longitude: sequenceStop.longitude,
          });
          nearestDistanceKm = calculateDistanceKm(currentPosition, {
            latitude: nearestStop.latitude,
            longitude: nearestStop.longitude,
          });
          sequenceGapKm = sequenceDistanceKm - nearestDistanceKm;

          if (
            nearestDistanceKm <= AUTO_SELECT_NEARBY_STOP_RADIUS_KM &&
            sequenceGapKm >= AUTO_SELECT_NEARBY_STOP_EXTRA_KM
          ) {
            nextIndex = nearestPendingIndex;
            autoSelectedNearbyStop = true;
          }
        }
      } catch {
        nextIndex = firstPendingIndex;
      }
    }

    const nextStop = nextIndex >= 0 ? stops[nextIndex] : null;
    const remainingCount = Math.max(0, stops.length - handled.size);
    const distanceRounded =
      typeof distanceFromExpectedStopKm === "number"
        ? Number(distanceFromExpectedStopKm.toFixed(3))
        : undefined;
    const sequenceGapRounded =
      typeof sequenceGapKm === "number" ? Number(sequenceGapKm.toFixed(3)) : undefined;

    reportRouteExecutionEvent({
      type: result === "delivered" ? "route_stop_delivered" : "route_stop_failed",
      severity: result === "delivered" ? "info" : "warning",
      title:
        result === "delivered"
          ? "Parada marcada como entregue"
          : "Parada marcada como não entregue",
      message: targetStop.address,
      stopId: targetStop.id,
      metadata: {
        result,
        stopIndex,
        stopPackage: getStopDisplayLabel(targetStop, stopIndex),
        stopAddress: targetStop.address,
        stopLatitude: roundCoordinate(targetStop.latitude),
        stopLongitude: roundCoordinate(targetStop.longitude),
        distanceFromExpectedStopKm: distanceRounded,
        firstPendingIndex,
        nearestPendingIndex,
        nextIndex,
        nextStopId: nextStop?.id,
        nextStopAddress: nextStop?.address,
        nextStopPackage: nextStop
          ? getStopDisplayLabel(nextStop, nextIndex)
          : undefined,
        autoSelectedNearbyStop,
        sequenceDistanceKm:
          typeof sequenceDistanceKm === "number"
            ? Number(sequenceDistanceKm.toFixed(3))
            : undefined,
        nearestDistanceKm:
          typeof nearestDistanceKm === "number"
            ? Number(nearestDistanceKm.toFixed(3))
            : undefined,
        remainingCount,
        driverLatitude: roundCoordinate(currentPosition?.latitude),
        driverLongitude: roundCoordinate(currentPosition?.longitude),
      },
    });

    if (
      typeof distanceFromExpectedStopKm === "number" &&
      distanceFromExpectedStopKm > FAR_FROM_STOP_ALERT_KM
    ) {
      reportRouteExecutionEvent({
        type: "route_stop_far_from_driver",
        severity: "warning",
        title: "Motorista longe da parada marcada",
        message: `Parada ${getStopDisplayLabel(targetStop, stopIndex)} marcada a ${distanceRounded} km do GPS.`,
        stopId: targetStop.id,
        metadata: {
          stopIndex,
          stopPackage: getStopDisplayLabel(targetStop, stopIndex),
          stopAddress: targetStop.address,
          distanceFromExpectedStopKm: distanceRounded,
          driverLatitude: roundCoordinate(currentPosition?.latitude),
          driverLongitude: roundCoordinate(currentPosition?.longitude),
        },
      });
    }

    if (
      typeof sequenceGapKm === "number" &&
      (sequenceGapKm > SEQUENCE_INCOHERENCE_ALERT_KM || autoSelectedNearbyStop) &&
      nearestPendingIndex >= 0 &&
      nearestPendingIndex !== firstPendingIndex
    ) {
      const sequenceStop = stops[firstPendingIndex];
      const nearestStop = stops[nearestPendingIndex];
      reportRouteExecutionEvent({
        type: "route_sequence_incoherent_detected",
        severity: "warning",
        title: "Sequência de rota possivelmente incoerente",
        message: autoSelectedNearbyStop
          ? `O app selecionou a parada pendente mais próxima, ${sequenceGapRounded} km melhor que a sequência salva.`
          : `A parada mais próxima estava ${sequenceGapRounded} km melhor que a sequência salva.`,
        stopId: nearestStop?.id,
        metadata: {
          firstPendingIndex,
          firstPendingStopId: sequenceStop?.id,
          firstPendingAddress: sequenceStop?.address,
          nearestPendingIndex,
          nearestPendingStopId: nearestStop?.id,
          nearestPendingAddress: nearestStop?.address,
          autoSelectedNearbyStop,
          sequenceGapKm: sequenceGapRounded,
          driverLatitude: roundCoordinate(currentPosition?.latitude),
          driverLongitude: roundCoordinate(currentPosition?.longitude),
        },
      });
    }

    setDeliveryState({
      started: finished ? false : deliveryState.started,
      currentIndex: finished ? stops.length - 1 : nextIndex >= 0 ? nextIndex : 0,
      delivered,
      failed,
    });

    if (finished) {
      await completeRoute();
      return;
    }

    if (result === "delivered") {
      if (autoSelectedNearbyStop && nextStop) {
        toast.warning(
          `Próxima parada ajustada para ${getStopDisplayLabel(nextStop, nextIndex)} por proximidade.`
        );
      }
      toast.success(
        `Entrega registrada para parada ${getStopDisplayLabel(targetStop, stopIndex)}.`
      );
      return;
    }

    if (autoSelectedNearbyStop && nextStop) {
      toast.warning(
        `Próxima parada ajustada para ${getStopDisplayLabel(nextStop, nextIndex)} por proximidade.`
      );
    }

    toast.warning(
      `Falha registrada para parada ${getStopDisplayLabel(targetStop, stopIndex)}.`
    );
  };

  const handleDelivered = async () => {
    if (!currentStop) return;
    await handleStopResultAtIndex(deliveryState.currentIndex, "delivered");
  };

  const handleNotDelivered = async () => {
    if (!currentStop) return;
    await handleStopResultAtIndex(deliveryState.currentIndex, "failed");
  };

  const handleReset = () => {
    setDeliveryState(DEFAULT_DELIVERY_STATE);
    toast.message("Execução da rota reiniciada.");
  };

  const handleOptimizeRoute = async () => {
    if (hasStructuralAuditIssues) {
      const firstIssue = structuralAuditIssues[0];
      toast.error(
        `${firstIssue.title}: corrija os problemas apontados pelo fiscal antes de otimizar.`
      );
      return;
    }

    if (stops.length < 2) {
      toast.error("Adicione pelo menos 2 paradas para otimizar.");
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message("Obtendo sua posição atual para otimizar a rota a partir de onde você está...");
      const currentPosition = await getCurrentPosition();

      optimizeRouteMutation.mutate({
        id: routeId,
        mode: routeQuery.data?.mode ?? "balanced",
        startLatitude: currentPosition.latitude,
        startLongitude: currentPosition.longitude,
      });
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Não foi possível obter sua localização. Permita o GPS para otimizar sem jogar você para longe."
      );
    } finally {
      setIsLocatingForReoptimization(false);
    }
  };

  const handleOptimizeRemainingRoute = async () => {
    if (hasStructuralAuditIssues) {
      const firstIssue = structuralAuditIssues[0];
      toast.error(
        `${firstIssue.title}: corrija os problemas apontados pelo fiscal antes de reotimizar.`
      );
      return;
    }

    if (remainingStopsCount < 2) {
      toast.error("A rota precisa ter pelo menos 2 paradas pendentes para reotimizar.");
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message("Obtendo sua posição atual para reotimizar as próximas entregas...");
      const currentPosition = await getCurrentPosition();

      optimizeRemainingMutation.mutate({
        id: routeId,
        mode: routeQuery.data?.mode ?? "balanced",
        excludeStopIds: handledStopIds,
        startLatitude: currentPosition.latitude,
        startLongitude: currentPosition.longitude,
      });
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Não foi possível obter sua localização. Permita o GPS para reotimizar a partir de onde você está."
      );
    } finally {
      setIsLocatingForReoptimization(false);
    }
  };

  const handleImproveRoutePreference = async () => {
    if (hasStructuralAuditIssues) {
      const firstIssue = structuralAuditIssues[0];
      toast.error(
        `${firstIssue.title}: corrija os problemas apontados pelo fiscal antes de ajustar a sequência.`
      );
      return;
    }

    if (remainingStopsCount < 2) {
      toast.error("A rota precisa ter pelo menos 2 paradas pendentes para ajustar a sequência.");
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message("Obtendo sua posição para melhorar a sequência com prioridade nas paradas próximas...");
      const currentPosition = await getCurrentPosition();

      optimizeRemainingMutation.mutate({
        id: routeId,
        mode: routeQuery.data?.mode ?? "balanced",
        excludeStopIds: handledStopIds,
        localityMode: "strict",
        startLatitude: currentPosition.latitude,
        startLongitude: currentPosition.longitude,
      });
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Não foi possível obter sua localização. Permita o GPS para ajustar a sequência pela sua posição real."
      );
    } finally {
      setIsLocatingForReoptimization(false);
    }
  };

  const handleStartEditStop = (stop: Stop, index: number) => {
    setSelectedStopIndex(index);
    setEditingStopIndex(index);
    setStopDraft({
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      packageNumber: stop.packageNumber ?? "",
      notes: stop.notes ?? "",
    });
  };

  const handleCancelEditStop = () => {
    setEditingStopIndex(null);
    setStopDraft({
      address: "",
      latitude: 0,
      longitude: 0,
      packageNumber: "",
      notes: "",
    });
  };

  const resolveRoutePoint = async (point: RoutePoint, label: string) => {
    const address = point.address.trim();

    if (!address) {
      return {
        location: null,
        latitude: null,
        longitude: null,
      };
    }

    if (hasValidCoordinates(point)) {
      return {
        location: address,
        latitude: point.latitude,
        longitude: point.longitude,
      };
    }

    const suggestion = (await searchAddress(address, { limit: 1 }))[0];

    if (!suggestion) {
      throw new Error(`Confira o endereço e as coordenadas de ${label}.`);
    }

    return {
      location: address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    };
  };

  const handleSaveStop = async (stop: Stop, index: number) => {
    if (!stop.id) {
      toast.error("Não foi possível identificar a parada para edição.");
      return;
    }

    const address = stopDraft.address.trim();
    if (!address) {
      toast.error("Informe o endereço da parada.");
      return;
    }

    try {
      const resolved = await resolveRoutePoint(stopDraft, `parada ${index + 1}`);

      await updateStopMutation.mutateAsync({
        routeId,
        stopId: stop.id,
        address,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        sequence: stop.sequence,
        notes: buildStopNotes(stopDraft.packageNumber, stopDraft.notes),
      });

      handleCancelEditStop();
      toast.success("Parada salva. Reotimize a rota para recalcular a melhor sequência.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a parada."
      );
    }
  };

  const handleDeleteStop = async (stop: Stop, index: number) => {
    if (!stop.id) {
      toast.error("Não foi possível identificar a parada para exclusão.");
      return;
    }

    if (stops.length <= 2) {
      toast.error("A rota precisa manter pelo menos 2 paradas.");
      return;
    }

    const confirmed = window.confirm(
      `Excluir a parada ${getStopDisplayLabel(stop, index)}? Depois reotimize a rota.`
    );
    if (!confirmed) return;

    try {
      await deleteStopMutation.mutateAsync({
        routeId,
        stopId: stop.id,
      });

      if (editingStopIndex === index) {
        handleCancelEditStop();
      }
      setSelectedStopIndex(null);
      toast.success("Parada excluída. Reotimize a rota para recalcular a melhor sequência.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a parada."
      );
    }
  };

  const handleSaveEndpoints = async () => {
    if (!routeQuery.data) return;

    setIsSavingEndpoints(true);

    try {
      const [resolvedStart, resolvedEnd] = await Promise.all([
        resolveRoutePoint(startPoint, "início"),
        resolveRoutePoint(endPoint, "fim"),
      ]);

      await updateRouteMutation.mutateAsync({
        id: routeId,
        startLocation: resolvedStart.location,
        startLatitude: resolvedStart.latitude,
        startLongitude: resolvedStart.longitude,
        endLocation: resolvedEnd.location,
        endLatitude: resolvedEnd.latitude,
        endLongitude: resolvedEnd.longitude,
      });

      setStartPoint({
        address: resolvedStart.location ?? "",
        latitude: resolvedStart.latitude ?? 0,
        longitude: resolvedStart.longitude ?? 0,
      });
      setEndPoint({
        address: resolvedEnd.location ?? "",
        latitude: resolvedEnd.latitude ?? 0,
        longitude: resolvedEnd.longitude ?? 0,
      });
      toast.success("Início e fim da rota salvos.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar início e fim."
      );
    } finally {
      setIsSavingEndpoints(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link href="/routes">
              <Button variant="ghost" size="sm" className="gap-2 px-0">
                <ArrowLeft className="h-4 w-4" />
                Voltar para rotas
              </Button>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight">
                {routeQuery.data?.name || "Rota"}
              </h1>
              <Badge variant={routeQuery.data?.status === "completed" ? "default" : "outline"}>
                {getStatusLabel(routeQuery.data?.status)}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/routes/new">
              <Button type="button" variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Importar tabela
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={handleOptimizeRoute}
              disabled={
                stops.length < 2 ||
                optimizeRouteMutation.isPending ||
                optimizeRemainingMutation.isPending ||
                isLocatingForReoptimization ||
                auditQuery.isLoading ||
                hasStructuralAuditIssues
              }
            >
              <Zap className="mr-2 h-4 w-4" />
              {optimizeRouteMutation.isPending ? "Otimizando..." : "Otimizar rota"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleOptimizeRemainingRoute}
              disabled={
                remainingStopsCount < 2 ||
                optimizeRouteMutation.isPending ||
                optimizeRemainingMutation.isPending ||
                isLocatingForReoptimization ||
                auditQuery.isLoading ||
                hasStructuralAuditIssues
              }
            >
              <Zap className="mr-2 h-4 w-4" />
              {isLocatingForReoptimization
                ? "Localizando..."
                : optimizeRemainingMutation.isPending
                ? "Reotimizando..."
                : "Reotimizar restantes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleImproveRoutePreference}
              disabled={
                remainingStopsCount < 2 ||
                optimizeRouteMutation.isPending ||
                optimizeRemainingMutation.isPending ||
                isLocatingForReoptimization ||
                auditQuery.isLoading ||
                hasStructuralAuditIssues
              }
            >
              <Navigation className="mr-2 h-4 w-4" />
              {isLocatingForReoptimization || optimizeRemainingMutation.isPending
                ? "Ajustando..."
                : "Não gostei da sequência"}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reiniciar
            </Button>
            <Button
              type="button"
              onClick={handleStartRoute}
              disabled={
                stops.length === 0 ||
                isComplete ||
                isLocatingForReoptimization ||
                auditQuery.isLoading ||
                hasStructuralAuditIssues
              }
            >
              <Play className="mr-2 h-4 w-4" />
              Iniciar rota
            </Button>
          </div>
        </div>

        {canSeeRouteAuditPanel && auditQuery.data ? (
          <Alert
            className={
              auditQuery.data.status === "approved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : auditQuery.data.status === "critical"
                ? "border-red-200 bg-red-50 text-red-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    Auditor da rota:{" "}
                    {auditQuery.data.status === "approved"
                      ? "aprovada"
                      : auditQuery.data.status === "critical"
                      ? "crítica"
                      : "atenção"}
                  </span>
                  <Badge variant="outline">Score {auditQuery.data.score}</Badge>
                  <Badge variant="outline">
                    {auditQuery.data.issueCount} alerta(s)
                  </Badge>
                  <Badge variant="outline">
                    maior salto {auditQuery.data.maxLegKm.toFixed(2)} km
                  </Badge>
                </div>
                {hasBlockingAuditIssues ? (
                  <p className="text-sm font-semibold">
                    {hasStructuralAuditIssues
                      ? "Corrija os problemas de endereço ou coordenada antes de otimizar ou iniciar a rota."
                      : "O fiscal encontrou incoerência de sequência. Ao iniciar, o sistema vai refazer a rota para novo julgamento; você também pode usar Reotimizar restantes ou Não gostei da sequência."}
                  </p>
                ) : null}
                {auditQuery.data.issues.length ? (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
                    {auditQuery.data.issues.map((issue: any, index: number) => (
                      <div key={`${issue.type}-${index}`} className="flex gap-2">
                        <Badge variant="outline" className="h-6 shrink-0">
                          {issue.severity === "critical"
                            ? "crítico"
                            : issue.severity === "high"
                            ? "alto"
                            : issue.severity === "medium"
                            ? "médio"
                            : "baixo"}
                        </Badge>
                        <p>
                          <span className="font-medium">{issue.title}:</span>{" "}
                          {issue.message}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm">
                    Nenhuma parada próxima pulada, salto longo ou coordenada repetida
                    foi detectada.
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {routeQuery.isLoading || stopsQuery.isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">
            Carregando rota...
          </Card>
        ) : routeQuery.error || stopsQuery.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar essa rota.
            </AlertDescription>
          </Alert>
        ) : !routeQuery.data ? (
          <Alert>
            <AlertDescription>Rota não encontrada.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-[1fr_340px]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Flag className="h-5 w-5" />
                      Início e fim da rota
                    </CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSaveEndpoints}
                      disabled={isSavingEndpoints || updateRouteMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingEndpoints ? "Salvando..." : "Salvar in\u00edcio/fim"}
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-white p-4">
                      <AddressInputSimple
                        id="route-detail-start-address"
                        label="Início da rota"
                        placeholder="Rua, número, bairro, cidade - UF"
                        value={startPoint.address}
                        latitude={startPoint.latitude}
                        longitude={startPoint.longitude}
                        onAddressChange={(address) =>
                          setStartPoint((current) => ({ ...current, address }))
                        }
                        onCoordinatesChange={(latitude, longitude) =>
                          setStartPoint((current) => ({
                            ...current,
                            latitude,
                            longitude,
                          }))
                        }
                      />
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-white p-4">
                      <AddressInputSimple
                        id="route-detail-end-address"
                        label="Fim da rota"
                        placeholder="Rua, número, bairro, cidade - UF"
                        value={endPoint.address}
                        latitude={endPoint.latitude}
                        longitude={endPoint.longitude}
                        onAddressChange={(address) =>
                          setEndPoint((current) => ({ ...current, address }))
                        }
                        onCoordinatesChange={(latitude, longitude) =>
                          setEndPoint((current) => ({
                            ...current,
                            latitude,
                            longitude,
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Navigation className="h-5 w-5" />
                      Execução da rota
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium">
                        {handledCount}/{stops.length} paradas tratadas
                      </span>
                    </div>
                    <Progress value={progressValue} />
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{deliveredCount} entregue(s)</span>
                      <span>{failedCount} não entregue(s)</span>
                    </div>
                  </div>

                  {!isComplete && (
                    <div className="rounded-2xl border border-border/70 bg-white p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <BellRing className="mt-1 h-5 w-5 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="font-semibold">Alerta de entrega próxima</p>
                            <p className="text-sm text-muted-foreground">
                              Avisa se você passar perto de outra parada pendente, sem alterar a sequência da rota.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant={proximityAlertsEnabled ? "outline" : "default"}
                          className="shrink-0 gap-2"
                          onClick={() => {
                            if (proximityAlertsEnabled) {
                              setProximityAlertsEnabled(false);
                              setActiveProximityAlert(null);
                              toast.message("Alertas de proximidade desativados.");
                              return;
                            }

                            void ensureProximityAudioReady();
                          }}
                        >
                          <BellRing className="h-4 w-4" />
                          {proximityAlertsEnabled ? "Desativar" : "Ativar alertas"}
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={proximitySoundEnabled ? "secondary" : "outline"}
                          className="gap-2"
                          onClick={() => setProximitySoundEnabled((current) => !current)}
                        >
                          <Volume2 className="h-4 w-4" />
                          Som {proximitySoundEnabled ? "ligado" : "desligado"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={proximityVibrationEnabled ? "secondary" : "outline"}
                          onClick={() => setProximityVibrationEnabled((current) => !current)}
                        >
                          Vibração {proximityVibrationEnabled ? "ligada" : "desligada"}
                        </Button>
                        <span className="inline-flex items-center text-xs text-muted-foreground">
                          Raio: {PROXIMITY_ALERT_RADIUS_METERS} m
                        </span>
                      </div>
                    </div>
                  )}

                  {activeProximityAlert && activeProximityStop && (
                    <div className="rounded-2xl border border-amber-400/50 bg-amber-50 p-4 text-amber-950">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold uppercase">
                            Entrega próxima detectada
                          </p>
                          <p className="text-lg font-bold leading-snug">
                            Parada {getStopDisplayLabel(activeProximityStop, activeProximityAlert.stopIndex)} a{" "}
                            {formatDistanceMeters(activeProximityAlert.distanceMeters)}
                          </p>
                          <p className="text-sm leading-snug">
                            {activeProximityStop.address}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 bg-white"
                          onClick={() => setActiveProximityAlert(null)}
                        >
                          Ignorar agora
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="bg-white"
                          onClick={() => {
                            setSelectedStopIndex(activeProximityAlert.stopIndex);
                            setStopSearch("");
                          }}
                        >
                          Ver parada
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="bg-white"
                          onClick={() => openStopInMap(activeProximityStop)}
                        >
                          <Navigation className="mr-2 h-4 w-4" />
                          Abrir no mapa
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            void handleStopResultAtIndex(
                              activeProximityAlert.stopIndex,
                              "delivered"
                            );
                          }}
                          disabled={updateRouteMutation.isPending}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Entregue
                        </Button>
                      </div>
                    </div>
                  )}

                  {isComplete ? (
                    <div
                      className={[
                        "rounded-2xl border border-border/70 bg-white p-5",
                        failedCount > 0
                          ? "border-amber-400/40 bg-amber-400/15"
                          : "border-accent/40 bg-accent/15",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "flex items-center gap-3",
                          failedCount > 0 ? "text-amber-200" : "text-accent",
                        ].join(" ")}
                      >
                        {failedCount > 0 ? (
                          <XCircle className="h-6 w-6" />
                        ) : (
                          <PackageCheck className="h-6 w-6" />
                        )}
                        <div>
                          <p className="font-semibold">
                            {failedCount > 0
                              ? "Rota finalizada com falhas de entrega."
                              : "Todas as entregas foram concluidas."}
                          </p>
                          <p
                            className={[
                              "text-sm",
                              failedCount > 0 ? "text-amber-100" : "text-accent/90",
                            ].join(" ")}
                          >
                            {failedCount > 0
                              ? `${deliveredCount} entregue(s) e ${failedCount} não entregue(s).`
                              : "A rota foi marcada como concluida."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : deliveryState.started && currentStop ? (
                    <div className="rounded-2xl border border-border/70 bg-white p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={[
                              "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary text-center font-bold leading-none text-primary-foreground shadow-sm",
                              getStopNumberTextClass(
                                getStopDisplayLabel(currentStop, deliveryState.currentIndex)
                              ),
                            ].join(" ")}
                            aria-label={`Parada ${getStopDisplayLabel(currentStop, deliveryState.currentIndex)}`}
                          >
                            <span className="max-w-[3.5rem] truncate">
                              {getStopDisplayLabel(currentStop, deliveryState.currentIndex)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              Parada atual
                            </p>
                            <p className="truncate text-sm font-medium text-foreground">
                              Parada {getStopDisplayLabel(currentStop, deliveryState.currentIndex)}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Atual
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" />
                          <div>
                            <p className="text-lg font-semibold">
                              {currentStop.address}
                            </p>
                            {currentStop.packageNumber && (
                              <p className="inline-flex max-w-full items-center rounded-lg bg-primary/10 px-2.5 py-1 text-base font-bold text-primary">
                                <span className="truncate">
                                  {currentStop.isSequentialImile ? "Parada" : "Pacote"}: {currentStop.packageNumber}
                                </span>
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {currentStop.latitude.toFixed(6)},{" "}
                              {currentStop.longitude.toFixed(6)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            className="gap-2"
                            onClick={handleDelivered}
                            disabled={updateRouteMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Entregue
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="gap-2"
                            onClick={handleNotDelivered}
                            disabled={updateRouteMutation.isPending}
                          >
                            <XCircle className="h-4 w-4" />
                            Não Entregue
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => {
                              setShowRouteMap(false);
                              openStopInMap(currentStop);
                            }}
                          >
                            <Navigation className="h-4 w-4" />
                            Abrir no mapa
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border/70 bg-secondary/55 p-5">
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Rota pronta para iniciar.</p>
                          <p className="text-sm text-muted-foreground">
                            Clique em Iniciar rota para abrir a primeira parada.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isComplete && nextStop && !deliveryState.started && (
                    <p className="text-sm text-muted-foreground">
                      Primeira parada: {nextStop.address}
                    </p>
                  )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Paradas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Input
                      value={stopSearch}
                      onChange={(event) => setStopSearch(event.target.value)}
                      placeholder="Filtrar por endereço da parada"
                      aria-label="Filtrar paradas por endereço"
                    />
                    {stopSearch.trim() && (
                      <p className="text-xs text-muted-foreground">
                        {filteredStops.length} de {stops.length} parada(s) encontrada(s)
                      </p>
                    )}
                  </div>
                  {routeStartPoint && (
                    <div className="rounded-lg border border-accent/40 bg-accent/15 p-3">
                      <p className="text-xs font-semibold uppercase text-accent/90">
                        Início
                      </p>
                      <p className="text-sm text-foreground">{routeStartPoint.address}</p>
                    </div>
                  )}
                  {filteredStops.map(({ stop, index }) => {
                    const delivered = deliveredSet.has(index);
                    const failed = failedSet.has(index);
                    const active = deliveryState.started && index === deliveryState.currentIndex;
                    const expanded = selectedStopIndex === index;
                    const stopLabel = getStopDisplayLabel(stop, index);

                    return (
                      <div key={stop.id ?? index}>
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() =>
                            setSelectedStopIndex((current) =>
                              current === index ? null : index
                            )
                          }
                        >
                        <div className="flex gap-3">
                          <div
                            className={[
                              "mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-center font-bold leading-none",
                              !delivered && !failed ? getStopNumberTextClass(stopLabel) : "",
                              delivered
                                ? "border-accent bg-accent text-accent-foreground"
                                : failed
                                  ? "border-destructive bg-destructive text-destructive-foreground"
                                : active
                                  ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20"
                                  : "bg-background",
                            ].join(" ")}
                            aria-label={`Parada ${stopLabel}`}
                          >
                            {delivered ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : failed ? (
                              <XCircle className="h-5 w-5" />
                            ) : (
                              <span className="max-w-10 truncate">{stopLabel}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug">{stop.address}</p>
                            {stop.packageNumber && (
                              <p className="inline-flex max-w-full rounded-md bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">
                                <span className="truncate">
                                  {stop.isSequentialImile ? "Parada" : "Pacote"}: {stop.packageNumber}
                                </span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {delivered
                                ? "Entregue"
                                : failed
                                  ? "Não entregue"
                                : active
                                    ? "Aberta agora"
                                    : "Pendente"}
                            </p>
                          </div>
                        </div>
                        </button>
                        {expanded && (
                          <div className="mt-2 space-y-3">
                            {editingStopIndex === index && (
                              <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/40 p-3">
                                <AddressInputSimple
                                  id={`route-detail-stop-${stop.id ?? index}-address`}
                                  label="Endereço da parada"
                                  placeholder="Rua, número, bairro, cidade - UF"
                                  value={stopDraft.address}
                                  latitude={stopDraft.latitude}
                                  longitude={stopDraft.longitude}
                                  onAddressChange={(address) =>
                                    setStopDraft((current) => ({
                                      ...current,
                                      address,
                                      latitude: 0,
                                      longitude: 0,
                                    }))
                                  }
                                  onCoordinatesChange={(latitude, longitude) =>
                                    setStopDraft((current) => ({
                                      ...current,
                                      latitude,
                                      longitude,
                                    }))
                                  }
                                />
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <label
                                      htmlFor={`route-detail-stop-${stop.id ?? index}-package`}
                                      className="text-sm font-medium"
                                    >
                                      Número/STOP do pacote
                                    </label>
                                    <Input
                                      id={`route-detail-stop-${stop.id ?? index}-package`}
                                      value={stopDraft.packageNumber}
                                      onChange={(event) =>
                                        setStopDraft((current) => ({
                                          ...current,
                                          packageNumber: event.target.value,
                                        }))
                                      }
                                      placeholder="Ex.: 1520"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label
                                      htmlFor={`route-detail-stop-${stop.id ?? index}-notes`}
                                      className="text-sm font-medium"
                                    >
                                      Observação
                                    </label>
                                    <Input
                                      id={`route-detail-stop-${stop.id ?? index}-notes`}
                                      value={stopDraft.notes}
                                      onChange={(event) =>
                                        setStopDraft((current) => ({
                                          ...current,
                                          notes: event.target.value,
                                        }))
                                      }
                                      placeholder="Complemento, referência ou detalhe"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => void handleSaveStop(stop, index)}
                                    disabled={updateStopMutation.isPending}
                                  >
                                    <Save className="h-4 w-4" />
                                    {updateStopMutation.isPending ? "Salvando..." : "Salvar parada"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelEditStop}
                                    disabled={updateStopMutation.isPending}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => handleStartEditStop(stop, index)}
                                disabled={updateStopMutation.isPending || deleteStopMutation.isPending}
                              >
                                <Pencil className="h-4 w-4" />
                                Editar parada
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteStop(stop, index)}
                                disabled={
                                  stops.length <= 2 ||
                                  updateStopMutation.isPending ||
                                  deleteStopMutation.isPending
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-2"
                                onClick={() => void handleStopResultAtIndex(index, "delivered")}
                                disabled={updateRouteMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Entregue
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="gap-2"
                                onClick={() => void handleStopResultAtIndex(index, "failed")}
                                disabled={updateRouteMutation.isPending}
                              >
                                <XCircle className="h-4 w-4" />
                                Não Entregue
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => {
                                  setShowRouteMap(false);
                                  openStopInMap(stop);
                                }}
                              >
                                <Navigation className="h-4 w-4" />
                                Abrir no mapa
                              </Button>
                            </div>
                          </div>
                        )}
                        {index < stops.length - 1 && <Separator className="mt-3" />}
                      </div>
                    );
                  })}
                  {filteredStops.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      Nenhuma parada corresponde ao endereço pesquisado.
                    </div>
                  )}
                  {routeEndPoint && (
                    <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-3">
                      <p className="text-xs font-semibold uppercase text-destructive">
                        Fim
                      </p>
                      <p className="text-sm text-foreground">{routeEndPoint.address}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {showRouteMap ? (
              <Suspense
                fallback={
                  <Card className="border-border/80 bg-white p-4 text-sm text-muted-foreground">
                    Carregando mapa...
                  </Card>
                }
              >
                <RouteMap
                  stops={stops}
                  routeName={routeQuery.data.name}
                  height="h-96"
                  startPoint={hasValidCoordinates(startPoint) ? startPoint : routeStartPoint}
                  endPoint={hasValidCoordinates(endPoint) ? endPoint : routeEndPoint}
                />
              </Suspense>
            ) : (
              <Card className="border-border/80 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">Mapa da rota</p>
                    <p className="text-sm text-muted-foreground">
                      Carregue o mapa somente quando precisar visualizar o trajeto completo.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => setShowRouteMap(true)}
                  >
                    <MapPin className="h-4 w-4" />
                    Mostrar mapa
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}


