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
import StopIdentityStrip from "@/components/StopIdentityStrip";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNavigationUrl } from "@/lib/navigationPreference";
import {
  readDeliveryProgress,
  saveDeliveryProgress,
  saveLastRouteProgress,
  type DeliveryProgressState,
} from "@/lib/routeProgress";
import { trpc } from "@/lib/trpc";
import {
  rememberAddressCoordinates,
  searchAddress,
} from "@/services/maps/geocodingService";
import type { GeocodingMethod } from "@shared/geocodingConfidence";
import {
  getStopPackageNumbers,
  normalizeStopMetadata,
  normalizeStopSourceProvider,
  parseLegacyStopNotes,
  type StopMetadata,
  type StopSourceProvider,
} from "@shared/stopMetadata";
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

type StopResultTrigger = "current_stop" | "proximity_alert" | "stop_list";

type Stop = {
  id?: number;
  address: string;
  latitude: number;
  longitude: number;
  sequence: number;
  packageNumber?: string;
  sourceProvider?: StopSourceProvider;
  originalStop?: number | null;
  isUnsequencedStop?: boolean;
  metadata?: StopMetadata;
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
  lastAction: null,
};

const BLOCKING_AUDIT_ISSUE_TYPES = new Set([
  "missing_coordinates",
  "invalid_coordinates",
]);
const STRUCTURAL_AUDIT_ISSUE_TYPES = new Set([
  "missing_coordinates",
  "invalid_coordinates",
]);
const EMPTY_ROUTE_POINT: RoutePoint = {
  address: "",
  latitude: 0,
  longitude: 0,
};
const FAR_FROM_STOP_ALERT_KM = 0.5;
const REMOTE_CONFIRMATION_ALERT_KM = 2;
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

  return false;
}

function isStructuralAuditIssue(issue: any) {
  return STRUCTURAL_AUDIT_ISSUE_TYPES.has(issue?.type);
}

function getRouteQualityLabel(quality?: string) {
  switch (quality) {
    case "excellent":
      return "Excelente";
    case "good":
      return "Bom";
    case "attention":
      return "Atenção";
    case "poor":
      return "Ruim";
    case "blocked":
      return "Bloqueado";
    default:
      return "Sem classificação";
  }
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStopNotes(notes?: string | null) {
  const parsed = parseLegacyStopNotes(notes);

  return {
    packageNumber: parsed.metadata.packageNumber,
    notes: parsed.notes,
    metadata: parsed.metadata,
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

function buildStopNotes(packageNumber: string, notes: string) {
  return notes.trim() || null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getStatusLabel(
  status?: string,
  operationalStatus?: string,
  operationalLabel?: string
) {
  if (operationalLabel) return operationalLabel;
  switch (operationalStatus || status) {
    case "shopee_stop_sequence":
      return "Sequência STOP Shopee";
    case "attention_strong":
      return "Atenção forte";
    case "optimized_attention":
      return "Otimizada com atenção";
    case "queued":
      return "Na fila de otimização";
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

function isShopeeStopSequenceRoute(route: unknown) {
  const routeData = route as
    | {
        operationalStatus?: string | null;
        routingStrategy?: string | null;
        structuralAuditOnly?: boolean | null;
      }
    | null
    | undefined;

  return (
    routeData?.operationalStatus === "shopee_stop_sequence" ||
    routeData?.routingStrategy === "shopee_stop_sequence" ||
    routeData?.structuralAuditOnly === true
  );
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
    toast.message(
      "Se o mapa não abrir, permita pop-ups ou copie o endereço da parada."
    );
  }
}

function getStopDisplayLabel(_stop: Stop, fallbackIndex: number) {
  return String(fallbackIndex + 1);
}

function getShopeeStopLabel(stop: Stop) {
  if (stop.sourceProvider !== "shopee") return undefined;
  if (Number(stop.originalStop) > 0) return `STOP ${Number(stop.originalStop)}`;
  if (stop.isUnsequencedStop) return "Sem STOP";
  return undefined;
}

function getGroupedDeliveryCount(stop?: Stop) {
  const count = Number(stop?.metadata?.groupedDeliveryCount);
  return Number.isFinite(count) && count > 1 ? Math.round(count) : undefined;
}

function getGroupedDeliveryLabel(stop?: Stop) {
  const count = getGroupedDeliveryCount(stop);
  return count ? `${count}x entregas neste endereco` : undefined;
}

function getPackageLabel(stop: Stop) {
  const packageNumbers = getStopPackageNumbers(
    stop.metadata,
    stop.packageNumber
  );
  if (!packageNumbers.length) return undefined;

  const visible = packageNumbers.slice(0, 6).join(", ");
  const remaining = packageNumbers.length - 6;
  return `${packageNumbers.length > 1 ? "Pacotes" : "Pacote"}: ${visible}${
    remaining > 0 ? ` +${remaining}` : ""
  }`;
}

function getStopIdentityDetails(stop: Stop, fallbackIndex: number) {
  return {
    routeStopLabel: getStopDisplayLabel(stop, fallbackIndex),
    shopeeStopLabel: getShopeeStopLabel(stop),
    packageLabel: getPackageLabel(stop),
  };
}

function normalizeDeliveryIndexes(value: unknown, stopsLength?: number) {
  const indexes = Array.isArray(value) ? value : [];
  return indexes
    .map(index => Number(index))
    .filter(index => {
      if (!Number.isInteger(index) || index < 0) return false;
      return typeof stopsLength === "number" ? index < stopsLength : true;
    });
}

function getDeliverySnapshot(state: DeliveryState) {
  return {
    started: state.started,
    currentIndex: state.currentIndex,
    delivered: [...state.delivered],
    failed: [...state.failed],
  };
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

  if (
    url.startsWith("https://localhost") ||
    url.startsWith("http://localhost")
  ) {
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
  if (distanceMeters < 100)
    return `${Math.max(1, Math.round(distanceMeters))} m`;
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
    onError: async error => {
      await utils.routes.audit.invalidate({ id: routeId });
      toast.error(
        error.message || "Não foi possível reotimizar as paradas restantes."
      );
    },
  });
  const optimizeRouteMutation = trpc.routes.optimize.useMutation({
    onSuccess: async result => {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
      await Promise.all([
        utils.routes.get.invalidate({ id: routeId }),
        utils.routes.list.invalidate(),
        utils.stops.list.invalidate({ routeId }),
        utils.routes.audit.invalidate({ id: routeId }),
      ]);
      if ((result as any)?.queued) {
        toast.success("Rota grande enviada para a fila de otimizacao.");
        return;
      }
      toast.success("Rota otimizada.");
    },
    onError: async error => {
      await utils.routes.audit.invalidate({ id: routeId });
      toast.error(error.message || "Não foi possível otimizar a rota.");
    },
  });
  const reportOperationalEventMutation = trpc.events.report.useMutation();
  const [proximityAlertsEnabled, setProximityAlertsEnabled] = useState(false);
  const [proximitySoundEnabled, setProximitySoundEnabled] = useState(true);
  const [proximityVibrationEnabled, setProximityVibrationEnabled] =
    useState(true);
  const [proximityAudioReady, setProximityAudioReady] = useState(false);
  const [activeProximityAlert, setActiveProximityAlert] =
    useState<ProximityAlertCandidate | null>(null);
  const proximityAlertedAtRef = useRef<Record<number, number>>({});
  const proximityAudioRef = useRef<AudioContext | null>(null);
  const proximityGpsErrorNotifiedRef = useRef(false);

  const stops = useMemo<Stop[]>(() => {
    const rawStops = stopsQuery.data ?? [];
    const routeLooksLikeImile =
      isImileRouteText(routeQuery.data?.name) ||
      isImileRouteText(routeQuery.data?.description) ||
      rawStops.some((stop: any) => isImileStopNotes(String(stop.notes || "")));

    return rawStops
      .map((stop: any) => {
        const legacy = parseStopNotes(stop.notes);
        const metadata = normalizeStopMetadata({
          ...legacy.metadata,
          ...normalizeStopMetadata(stop.metadata),
        });
        const sourceProvider = normalizeStopSourceProvider(stop.sourceProvider);

        return {
          id: stop.id,
          address: stop.address,
          latitude: toNumber(stop.latitude),
          longitude: toNumber(stop.longitude),
          sequence: stop.sequence,
          notes: legacy.notes,
          sourceProvider,
          originalStop: stop.originalStop ?? null,
          isUnsequencedStop: Boolean(stop.isUnsequencedStop),
          metadata,
          packageNumber: metadata.packageNumber || legacy.packageNumber,
        };
      })
      .sort((a: Stop, b: Stop) => a.sequence - b.sequence)
      .map((stop: Stop, index: number) => {
        const isSequentialImile =
          stop.sourceProvider === "imile" ||
          routeLooksLikeImile ||
          isImileStopNotes(stop.notes) ||
          isLegacyImileTrackingPackage(stop.packageNumber, stop.notes);

        return {
          ...stop,
          isSequentialImile,
        };
      });
  }, [routeQuery.data?.description, routeQuery.data?.name, stopsQuery.data]);
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
  const [isCheckingInStart, setIsCheckingInStart] = useState(false);
  const [isCheckingInEnd, setIsCheckingInEnd] = useState(false);
  const [stopSearch, setStopSearch] = useState("");
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(
    null
  );
  const [editingStopIndex, setEditingStopIndex] = useState<number | null>(null);
  const [stopDraft, setStopDraft] = useState<StopDraft>({
    address: "",
    latitude: 0,
    longitude: 0,
    packageNumber: "",
    notes: "",
  });
  const [isLocatingForReoptimization, setIsLocatingForReoptimization] =
    useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [loadedDeliveryRouteId, setLoadedDeliveryRouteId] = useState<
    number | null
  >(null);

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
      getEditableRoutePoint(
        route.endLocation,
        route.endLatitude,
        route.endLongitude
      )
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
      const lastAction =
        savedState.lastAction &&
        Number.isInteger(savedState.lastAction.stopIndex) &&
        savedState.lastAction.stopIndex >= 0 &&
        savedState.lastAction.previousState
          ? {
              stopIndex: savedState.lastAction.stopIndex,
              result: savedState.lastAction.result,
              previousState: {
                started: Boolean(savedState.lastAction.previousState.started),
                currentIndex: Number.isFinite(
                  savedState.lastAction.previousState.currentIndex
                )
                  ? savedState.lastAction.previousState.currentIndex
                  : 0,
                delivered: normalizeDeliveryIndexes(
                  savedState.lastAction.previousState.delivered
                ),
                failed: normalizeDeliveryIndexes(
                  savedState.lastAction.previousState.failed
                ),
              },
              createdAt: savedState.lastAction.createdAt,
            }
          : null;

      setDeliveryState({
        started: Boolean(savedState.started),
        currentIndex: Number.isFinite(savedState.currentIndex)
          ? savedState.currentIndex
          : 0,
        delivered: normalizeDeliveryIndexes(savedState.delivered),
        failed: normalizeDeliveryIndexes(savedState.failed),
        lastAction,
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

    setDeliveryState(current => ({
      ...current,
      currentIndex: Math.min(current.currentIndex, stops.length - 1),
      delivered: normalizeDeliveryIndexes(current.delivered, stops.length),
      failed: normalizeDeliveryIndexes(current.failed, stops.length),
      lastAction:
        current.lastAction && current.lastAction.stopIndex < stops.length
          ? current.lastAction
          : null,
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
  const currentStopIdentity = currentStop
    ? getStopIdentityDetails(currentStop, deliveryState.currentIndex)
    : null;
  const currentStopGroupedDeliveryLabel =
    getGroupedDeliveryLabel(currentStop);
  const activeProximityStop =
    activeProximityAlert?.stopIndex !== undefined
      ? stops[activeProximityAlert.stopIndex]
      : undefined;
  const nextStopIndex = stops.findIndex(
    (_, index) => !deliveredSet.has(index) && !failedSet.has(index)
  );
  const nextStop = nextStopIndex >= 0 ? stops[nextStopIndex] : undefined;
  const nextStopIdentity = nextStop
    ? getStopIdentityDetails(nextStop, nextStopIndex)
    : null;
  const progressValue =
    stops.length > 0 ? (handledCount / stops.length) * 100 : 0;
  const handledStopIds = useMemo(
    () =>
      Array.from(new Set([...deliveryState.delivered, ...deliveryState.failed]))
        .map(index => stops[index]?.id)
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

  useEffect(() => {
    if (!deliveryState.started || isComplete) return;

    const reportPauseOrResume = () => {
      if (document.visibilityState === "hidden") {
        reportRouteExecutionEvent({
          type: "route_paused",
          severity: "info",
          title: "Execução de rota pausada",
          metadata: {
            reason: "page_hidden",
            currentIndex: deliveryState.currentIndex,
          },
        });
        return;
      }

      reportRouteExecutionEvent({
        type: "route_resumed",
        severity: "info",
        title: "Execução de rota retomada",
        metadata: {
          reason: "page_visible",
          currentIndex: deliveryState.currentIndex,
        },
      });
    };

    document.addEventListener("visibilitychange", reportPauseOrResume);
    return () =>
      document.removeEventListener("visibilitychange", reportPauseOrResume);
  }, [
    deliveryState.currentIndex,
    deliveryState.started,
    isComplete,
    routeId,
    stops.length,
  ]);

  const ensureProximityAudioReady = async () => {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
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
      toast.warning(
        "Não foi possível ativar o som. O alerta visual continuará funcionando."
      );
      setProximityAlertsEnabled(true);
      return false;
    }
  };

  const playProximityAlert = () => {
    if (
      proximitySoundEnabled &&
      proximityAudioReady &&
      proximityAudioRef.current
    ) {
      const context = proximityAudioRef.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.45
      );

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
      position => {
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
        toast.warning(
          `Entrega próxima: parada ${stopLabel} a ${formatDistanceMeters(nearby.distanceMeters)}.`,
          {
            duration: 12000,
          }
        );

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
        toast.warning(
          "Não foi possível monitorar GPS para alertas de proximidade."
        );
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
  }, [
    activeProximityAlert,
    deliveredSet,
    deliveryState.currentIndex,
    failedSet,
  ]);

  const findNearestPendingStopIndex = (
    origin: Coordinate,
    handledIndexes: Set<number>
  ) => {
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    stops.forEach((stop, index) => {
      if (handledIndexes.has(index)) return;
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude))
        return;
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
      .filter(({ stop, index }) => {
        if (!query) return true;
        const identity = getStopIdentityDetails(stop, index);
        return [
          stop.address,
          identity.routeStopLabel,
          identity.shopeeStopLabel,
          identity.packageLabel,
        ]
          .filter(Boolean)
          .some(value => normalizeText(String(value)).includes(query));
      });
  }, [stopSearch, stops]);
  const blockingAuditIssues = useMemo(
    () =>
      (auditQuery.data?.issues || []).filter((issue: any) =>
        isBlockingAuditIssue(issue)
      ),
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
  const routeOperationalStatus = (routeQuery.data as any)?.operationalStatus as
    | string
    | undefined;
  const routeIsShopeeStopSequence = isShopeeStopSequenceRoute(routeQuery.data);
  const routeNeedsStrongAttention =
    routeOperationalStatus === "attention_strong";

  const completeRoute = async () => {
    await updateRouteMutation.mutateAsync({
      id: routeId,
      status: "completed",
    });
    reportRouteExecutionEvent({
      type: "route_completed",
      severity: "info",
      title: "Rota concluída",
      metadata: {
        deliveredCount,
        failedCount,
        handledCount,
        endCheckinLocation: routeEndPoint?.address ?? null,
        endCheckinLatitude: roundCoordinate(routeEndPoint?.latitude),
        endCheckinLongitude: roundCoordinate(routeEndPoint?.longitude),
      },
    });
    toast.success("Rota concluida.");
  };

  const reoptimizeAfterAuditBlock = async () => {
    if (remainingStopsCount < 2) {
      toast.error(
        "A rota precisa ter pelo menos 2 paradas pendentes para refazer a sequência."
      );
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message(
        "Recalculando a sequência da rota para uma nova validação..."
      );
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
          "Não foi possível obter sua localização para refazer a rota."
      );
    } finally {
      setIsLocatingForReoptimization(false);
    }
  };

  const handleStartRoute = async () => {
    if (hasStructuralAuditIssues) {
      const firstIssue = structuralAuditIssues[0];
      reportRouteExecutionEvent({
        type: "route_start_blocked",
        severity: "error",
        title: "Início de rota bloqueado",
        message: firstIssue.title,
        metadata: {
          reason: firstIssue.type || "other",
          issue: firstIssue,
        },
      });
      toast.error(
        `${firstIssue.title}: corrija as paradas com problema antes de iniciar.`
      );
      return;
    }

    if (routeQuery.data?.status !== "optimized") {
      reportRouteExecutionEvent({
        type: "route_start_blocked",
        severity: "warning",
        title: "Início de rota bloqueado",
        message: "A rota ainda não está otimizada.",
        metadata: {
          reason: "route_not_optimized",
          routeStatus: routeQuery.data?.status ?? null,
        },
      });
      toast.error("Otimize a rota antes de iniciar.");
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

    setDeliveryState(current => ({
      ...current,
      started: true,
      currentIndex,
      lastAction: null,
    }));

    const selectedStop = stops[currentIndex];
    reportRouteExecutionEvent({
      type: "route_started",
      title: "Execução de rota iniciada",
      stopId: selectedStop?.id,
      metadata: {
        selectedStopIndex: currentIndex,
        selectedStopAddress: selectedStop?.address,
        selectedStopPackage: selectedStop
          ? getStopPackageNumbers(
              selectedStop.metadata,
              selectedStop.packageNumber
            ).join(", ") || null
          : null,
        handledStopsExcluded: handledStopIds.length,
        locationStrategy,
        startCheckinLocation: routeStartPoint?.address ?? null,
        startCheckinLatitude: roundCoordinate(routeStartPoint?.latitude),
        startCheckinLongitude: roundCoordinate(routeStartPoint?.longitude),
      },
    });
  };

  const handleStopResultAtIndex = async (
    stopIndex: number,
    result: "delivered" | "failed",
    trigger: StopResultTrigger = "current_stop"
  ) => {
    const targetStop = stops[stopIndex];
    if (!targetStop) return;
    const isShopeeStopSequence = isShopeeStopSequenceRoute(routeQuery.data);
    const previousDeliveryState = getDeliverySnapshot(deliveryState);
    const previousHandled = new Set([
      ...deliveryState.delivered,
      ...deliveryState.failed,
    ]);
    const expectedSequenceIndex = stops.findIndex(
      (_, index) => !previousHandled.has(index)
    );
    const expectedSequenceStop =
      expectedSequenceIndex >= 0 ? stops[expectedSequenceIndex] : null;
    const isOutOfSequenceConfirmation =
      expectedSequenceIndex >= 0 && stopIndex !== expectedSequenceIndex;
    const skippedPendingIndexes = isOutOfSequenceConfirmation
      ? stops
          .map((_, index) => index)
          .filter(
            index =>
              index < stopIndex &&
              !previousHandled.has(index) &&
              index !== stopIndex
          )
      : [];
    const expectedSequenceLabel = expectedSequenceStop
      ? getStopDisplayLabel(expectedSequenceStop, expectedSequenceIndex)
      : undefined;

    const delivered = Array.from(
      new Set([
        ...deliveryState.delivered.filter(index => index !== stopIndex),
        ...(result === "delivered" ? [stopIndex] : []),
      ])
    ).sort((a, b) => a - b);
    const failed = Array.from(
      new Set([
        ...deliveryState.failed.filter(index => index !== stopIndex),
        ...(result === "failed" ? [stopIndex] : []),
      ])
    ).sort((a, b) => a - b);
    const handled = new Set([...delivered, ...failed]);
    const firstPendingIndex = stops.findIndex(
      (_, index) => !handled.has(index)
    );
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
        nearestPendingIndex = findNearestPendingStopIndex(
          currentPosition,
          handled
        );

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

        const sequenceStop =
          firstPendingIndex >= 0 ? stops[firstPendingIndex] : null;
        const nearestStop =
          nearestPendingIndex >= 0 ? stops[nearestPendingIndex] : null;
        if (
          !isShopeeStopSequence &&
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
      typeof sequenceGapKm === "number"
        ? Number(sequenceGapKm.toFixed(3))
        : undefined;
    const isFarFromExpectedStop =
      typeof distanceFromExpectedStopKm === "number" &&
      distanceFromExpectedStopKm > FAR_FROM_STOP_ALERT_KM;
    const isRemoteConfirmation =
      result === "delivered" &&
      typeof distanceFromExpectedStopKm === "number" &&
      distanceFromExpectedStopKm > REMOTE_CONFIRMATION_ALERT_KM;
    const locationIntegrity =
      typeof distanceFromExpectedStopKm !== "number"
        ? "gps_unavailable"
        : isRemoteConfirmation
          ? "remote_confirmation"
          : isFarFromExpectedStop
            ? "far_from_stop"
            : "gps_consistent";

    reportRouteExecutionEvent({
      type:
        result === "delivered" ? "route_stop_delivered" : "route_stop_failed",
      severity: isRemoteConfirmation
        ? "warning"
        : result === "delivered"
          ? "info"
          : "warning",
      title:
        result === "delivered"
          ? "Parada marcada como entregue"
          : "Parada marcada como não entregue",
      message: targetStop.address,
      stopId: targetStop.id,
      metadata: {
        result,
        stopIndex,
        routeExecutionStrategy: isShopeeStopSequence
          ? "shopee_stop_sequence"
          : "optimized_sequence",
        sequenceCoherenceCheckSkipped: isShopeeStopSequence,
        stopPackage: getStopDisplayLabel(targetStop, stopIndex),
        stopAddress: targetStop.address,
        stopLatitude: roundCoordinate(targetStop.latitude),
        stopLongitude: roundCoordinate(targetStop.longitude),
        distanceFromExpectedStopKm: distanceRounded,
        locationIntegrity,
        remoteConfirmation: isRemoteConfirmation,
        remoteConfirmationThresholdKm: REMOTE_CONFIRMATION_ALERT_KM,
        actionTrigger: trigger,
        sequenceIntegrity: isOutOfSequenceConfirmation
          ? "out_of_sequence"
          : "saved_sequence",
        expectedSequenceIndex,
        expectedSequenceStopId: expectedSequenceStop?.id,
        expectedSequenceStopPackage: expectedSequenceLabel,
        expectedSequenceAddress: expectedSequenceStop?.address,
        skippedPendingCount: skippedPendingIndexes.length,
        skippedPendingIndexesPreview: skippedPendingIndexes.slice(0, 12),
        skippedPendingIndexesTruncated: skippedPendingIndexes.length > 12,
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

    if (isFarFromExpectedStop) {
      reportRouteExecutionEvent({
        type: "route_stop_far_from_driver",
        severity: isRemoteConfirmation ? "error" : "warning",
        title: "Motorista longe da parada marcada",
        message: `Parada ${getStopDisplayLabel(targetStop, stopIndex)} marcada a ${distanceRounded} km do GPS.`,
        stopId: targetStop.id,
        metadata: {
          stopIndex,
          routeExecutionStrategy: isShopeeStopSequence
            ? "shopee_stop_sequence"
            : "optimized_sequence",
          sequenceCoherenceCheckSkipped: isShopeeStopSequence,
          stopPackage: getStopDisplayLabel(targetStop, stopIndex),
          stopAddress: targetStop.address,
          distanceFromExpectedStopKm: distanceRounded,
          locationIntegrity,
          remoteConfirmation: isRemoteConfirmation,
          remoteConfirmationThresholdKm: REMOTE_CONFIRMATION_ALERT_KM,
          driverLatitude: roundCoordinate(currentPosition?.latitude),
          driverLongitude: roundCoordinate(currentPosition?.longitude),
        },
      });
    }

    if (isRemoteConfirmation) {
      reportRouteExecutionEvent({
        type: "route_stop_remote_confirmation",
        severity: "error",
        title: "Entrega marcada longe do local",
        message: `Parada ${getStopDisplayLabel(targetStop, stopIndex)} foi marcada entregue a ${distanceRounded} km do GPS.`,
        stopId: targetStop.id,
        metadata: {
          stopIndex,
          routeExecutionStrategy: isShopeeStopSequence
            ? "shopee_stop_sequence"
            : "optimized_sequence",
          sequenceCoherenceCheckSkipped: isShopeeStopSequence,
          stopPackage: getStopDisplayLabel(targetStop, stopIndex),
          stopAddress: targetStop.address,
          distanceFromExpectedStopKm: distanceRounded,
          locationIntegrity,
          remoteConfirmation: true,
          remoteConfirmationThresholdKm: REMOTE_CONFIRMATION_ALERT_KM,
          driverLatitude: roundCoordinate(currentPosition?.latitude),
          driverLongitude: roundCoordinate(currentPosition?.longitude),
        },
      });
    }

    if (isOutOfSequenceConfirmation) {
      reportRouteExecutionEvent({
        type: "route_stop_out_of_sequence_confirmed",
        severity: isRemoteConfirmation ? "error" : "warning",
        title: "Parada confirmada fora da sequência",
        message: `Parada ${getStopDisplayLabel(targetStop, stopIndex)} marcada antes da parada pendente ${expectedSequenceLabel ?? expectedSequenceIndex + 1}.`,
        stopId: targetStop.id,
        metadata: {
          result,
          actionTrigger: trigger,
          routeExecutionStrategy: isShopeeStopSequence
            ? "shopee_stop_sequence"
            : "optimized_sequence",
          sequenceCoherenceCheckSkipped: isShopeeStopSequence,
          confirmedStopIndex: stopIndex,
          confirmedStopPackage: getStopDisplayLabel(targetStop, stopIndex),
          confirmedStopAddress: targetStop.address,
          expectedSequenceIndex,
          expectedSequenceStopId: expectedSequenceStop?.id,
          expectedSequenceStopPackage: expectedSequenceLabel,
          expectedSequenceAddress: expectedSequenceStop?.address,
          skippedPendingCount: skippedPendingIndexes.length,
          skippedPendingIndexesPreview: skippedPendingIndexes.slice(0, 12),
          skippedPendingIndexesTruncated: skippedPendingIndexes.length > 12,
          locationIntegrity,
          remoteConfirmation: isRemoteConfirmation,
          distanceFromExpectedStopKm: distanceRounded,
          driverLatitude: roundCoordinate(currentPosition?.latitude),
          driverLongitude: roundCoordinate(currentPosition?.longitude),
        },
      });
    }

    if (
      !isShopeeStopSequence &&
      typeof sequenceGapKm === "number" &&
      (sequenceGapKm > SEQUENCE_INCOHERENCE_ALERT_KM ||
        autoSelectedNearbyStop) &&
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
      currentIndex: finished
        ? stops.length - 1
        : nextIndex >= 0
          ? nextIndex
          : 0,
      delivered,
      failed,
      lastAction: {
        stopIndex,
        result,
        previousState: previousDeliveryState,
        createdAt: new Date().toISOString(),
      },
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
      if (isRemoteConfirmation) {
        toast.warning(
          `Entrega registrada com alerta: GPS a ${distanceRounded} km da parada ${getStopDisplayLabel(targetStop, stopIndex)}.${isOutOfSequenceConfirmation ? ` Fora da sequência esperada: ${expectedSequenceLabel}.` : ""}`
        );
        return;
      }
      if (isOutOfSequenceConfirmation) {
        toast.warning(
          `Entrega registrada fora da sequência salva. Esperada agora: ${expectedSequenceLabel}.`
        );
        return;
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

    if (isOutOfSequenceConfirmation) {
      toast.warning(
        `Falha registrada fora da sequência salva. Esperada agora: ${expectedSequenceLabel}.`
      );
      return;
    }

    toast.warning(
      `Falha registrada para parada ${getStopDisplayLabel(targetStop, stopIndex)}.`
    );
  };

  const handleDelivered = async () => {
    if (!currentStop) return;
    await handleStopResultAtIndex(
      deliveryState.currentIndex,
      "delivered",
      "current_stop"
    );
  };

  const handleNotDelivered = async () => {
    if (!currentStop) return;
    await handleStopResultAtIndex(
      deliveryState.currentIndex,
      "failed",
      "current_stop"
    );
  };

  const handleUndoLastAction = async () => {
    const lastAction = deliveryState.lastAction;
    if (!lastAction) {
      toast.message("Nenhuma ação recente para reverter.");
      return;
    }

    const targetStop = stops[lastAction.stopIndex];
    const previousState = {
      ...lastAction.previousState,
      currentIndex: Math.min(
        Math.max(0, lastAction.previousState.currentIndex),
        Math.max(0, stops.length - 1)
      ),
      delivered: normalizeDeliveryIndexes(
        lastAction.previousState.delivered,
        stops.length
      ),
      failed: normalizeDeliveryIndexes(
        lastAction.previousState.failed,
        stops.length
      ),
      lastAction: null,
    };

    setDeliveryState(previousState);

    if (routeQuery.data?.status === "completed") {
      try {
        await updateRouteMutation.mutateAsync({
          id: routeId,
          status: "optimized",
        });
      } catch {
        toast.warning(
          "Baixa revertida, mas não foi possível reabrir o status da rota no servidor."
        );
      }
    }

    reportRouteExecutionEvent({
      type: "route_stop_action_reverted",
      severity: "warning",
      title: "Última ação de parada revertida",
      message: targetStop?.address,
      stopId: targetStop?.id,
      metadata: {
        revertedStopIndex: lastAction.stopIndex,
        revertedResult: lastAction.result,
        revertedStopAddress: targetStop?.address,
        revertedStopPackage: targetStop
          ? getStopDisplayLabel(targetStop, lastAction.stopIndex)
          : undefined,
      },
    });

    toast.success(
      `Ação revertida. Parada ${targetStop ? getStopDisplayLabel(targetStop, lastAction.stopIndex) : lastAction.stopIndex + 1} voltou para pendente.`
    );
  };

  const handleReset = () => {
    if (deliveryState.started && !isComplete) {
      reportRouteExecutionEvent({
        type: "route_abandoned",
        severity: "warning",
        title: "Rota abandonada",
        metadata: {
          reason: "manual_reset",
          currentIndex: deliveryState.currentIndex,
          deliveredCount,
          failedCount,
          handledCount,
        },
      });
    }
    setDeliveryState(DEFAULT_DELIVERY_STATE);
    toast.message("Execução da rota reiniciada.");
  };

  const handleOptimizeRoute = async () => {
    if (hasStructuralAuditIssues) {
      const firstIssue = structuralAuditIssues[0];
      toast.error(
        `${firstIssue.title}: corrija os problemas de endereço antes de otimizar.`
      );
      return;
    }

    if (stops.length < 2) {
      toast.error("Adicione pelo menos 2 paradas para otimizar.");
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message(
        "Obtendo sua posição atual para otimizar a rota a partir de onde você está..."
      );
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
        `${firstIssue.title}: corrija os problemas de endereço antes de reotimizar.`
      );
      return;
    }

    if (remainingStopsCount < 2) {
      toast.error(
        "A rota precisa ter pelo menos 2 paradas pendentes para reotimizar."
      );
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message(
        "Obtendo sua posição atual para reotimizar as próximas entregas..."
      );
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
        `${firstIssue.title}: corrija os problemas de endereço antes de ajustar a sequência.`
      );
      return;
    }

    if (remainingStopsCount < 2) {
      toast.error(
        "A rota precisa ter pelo menos 2 paradas pendentes para ajustar a sequência."
      );
      return;
    }

    setIsLocatingForReoptimization(true);

    try {
      toast.message(
        "Obtendo sua posição para melhorar a sequência com prioridade nas paradas próximas..."
      );
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
      packageNumber: stop.metadata?.packageNumber ?? stop.packageNumber ?? "",
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
        geocodingConfidenceScore: 100,
        geocodingMethod: "manual_coordinate" as GeocodingMethod,
        geocodingSuspect: false,
      };
    }

    const suggestion = (await searchAddress(address, { limit: 1 }))[0];

    if (!suggestion) {
      throw new Error(`Confira o endereço e as coordenadas de ${label}.`);
    }

    rememberAddressCoordinates(
      address,
      suggestion.latitude,
      suggestion.longitude,
      {
        geocodingConfidenceScore: suggestion.geocodingConfidenceScore,
        geocodingMethod: suggestion.geocodingMethod,
        geocodingSuspect: suggestion.geocodingSuspect,
      }
    );

    return {
      location: address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      geocodingConfidenceScore: suggestion.geocodingConfidenceScore,
      geocodingMethod: suggestion.geocodingMethod,
      geocodingSuspect: suggestion.geocodingSuspect,
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
      const resolved = await resolveRoutePoint(
        stopDraft,
        `parada ${index + 1}`
      );

      await updateStopMutation.mutateAsync({
        routeId,
        stopId: stop.id,
        address,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        sequence: stop.sequence,
        notes: buildStopNotes(stopDraft.packageNumber, stopDraft.notes),
        sourceProvider: stop.sourceProvider,
        originalStop: stop.originalStop ?? null,
        isUnsequencedStop: Boolean(stop.isUnsequencedStop),
        metadata: normalizeStopMetadata({
          ...stop.metadata,
          packageNumber: stopDraft.packageNumber || undefined,
        }),
        geocodingConfidenceScore: resolved.geocodingConfidenceScore,
        geocodingMethod: resolved.geocodingMethod,
        geocodingSuspect: resolved.geocodingSuspect,
      });

      handleCancelEditStop();
      toast.success(
        "Parada salva. Reotimize a rota para recalcular a melhor sequência."
      );
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
      toast.success(
        "Parada excluída. Reotimize a rota para recalcular a melhor sequência."
      );
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

  const handleRouteLocationCheckin = async (kind: "start" | "end") => {
    if (!routeQuery.data) return;

    const isStart = kind === "start";
    const label = isStart ? "início" : "fim";
    const setChecking = isStart ? setIsCheckingInStart : setIsCheckingInEnd;
    const locationLabel = isStart
      ? "Meu local - início da rota"
      : "Meu local - fim da rota";

    setChecking(true);

    try {
      const position = await getCurrentPosition();

      if (isStart) {
        await updateRouteMutation.mutateAsync({
          id: routeId,
          startLocation: locationLabel,
          startLatitude: position.latitude,
          startLongitude: position.longitude,
        });
        setStartPoint({
          address: locationLabel,
          latitude: position.latitude,
          longitude: position.longitude,
        });
      } else {
        await updateRouteMutation.mutateAsync({
          id: routeId,
          endLocation: locationLabel,
          endLatitude: position.latitude,
          endLongitude: position.longitude,
        });
        setEndPoint({
          address: locationLabel,
          latitude: position.latitude,
          longitude: position.longitude,
        });
      }

      reportRouteExecutionEvent({
        type: isStart
          ? "route_start_location_checkin"
          : "route_end_location_checkin",
        severity: "info",
        title: isStart
          ? "Check-in de início da rota"
          : "Check-out de fim da rota",
        message: locationLabel,
        metadata: {
          checkinKind: kind,
          location: locationLabel,
          latitude: roundCoordinate(position.latitude),
          longitude: roundCoordinate(position.longitude),
        },
      });

      toast.success(
        isStart
          ? "Check-in salvo como início da rota."
          : "Check-out salvo como fim da rota."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Não foi possível obter seu local para marcar o ${label}.`
      );
    } finally {
      setChecking(false);
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
              <Badge
                variant={
                  routeQuery.data?.status === "completed" ||
                  (routeQuery.data as any)?.operationalStatus === "optimized"
                    ? "default"
                    : "outline"
                }
              >
                {getStatusLabel(
                  routeQuery.data?.status,
                  (routeQuery.data as any)?.operationalStatus,
                  (routeQuery.data as any)?.operationalStatusLabel
                )}
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
              {optimizeRouteMutation.isPending
                ? "Otimizando..."
                : "Otimizar rota"}
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
              {isLocatingForReoptimization ||
              optimizeRemainingMutation.isPending
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

        {routeNeedsStrongAttention ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-semibold">Sequência precisa de atenção.</p>
                <p className="text-sm">
                  Se der tempo, toque em Reotimizar. Se precisar sair agora,
                  siga a próxima parada destacada.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {routeIsShopeeStopSequence ? (
          <Alert className="border-orange-300 bg-orange-50 text-orange-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="text-sm">
                Siga os STOP da tabela. Paradas sem STOP aparecem encaixadas no
                ponto mais próximo.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

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
                    {getRouteQualityLabel((auditQuery.data as any).quality)}
                  </Badge>
                  <Badge variant="outline">
                    {auditQuery.data.issueCount} alerta(s)
                  </Badge>
                  <Badge variant="outline">
                    maior salto {auditQuery.data.maxLegKm.toFixed(2)} km
                  </Badge>
                  {(auditQuery.data as any).clusterMetrics ? (
                    <>
                      <Badge variant="outline">
                        {(auditQuery.data as any).clusterMetrics.clusterCount}{" "}
                        região(ões)
                      </Badge>
                      <Badge variant="outline">
                        raio médio{" "}
                        {(
                          auditQuery.data as any
                        ).clusterMetrics.averageRadiusKm.toFixed(2)}{" "}
                        km
                      </Badge>
                      <Badge variant="outline">
                        maior região{" "}
                        {(
                          auditQuery.data as any
                        ).clusterMetrics.maxRadiusKm.toFixed(2)}{" "}
                        km
                      </Badge>
                    </>
                  ) : null}
                </div>
                {hasBlockingAuditIssues ? (
                  <p className="text-sm font-semibold">
                    {hasStructuralAuditIssues
                      ? "Corrija os problemas de endereço ou coordenada antes de otimizar ou iniciar a rota."
                      : "A validação encontrou incoerência de sequência. Ao iniciar, o sistema vai refazer a rota para nova validação; você também pode usar Reotimizar restantes ou Não gostei da sequência."}
                  </p>
                ) : null}
                {auditQuery.data.issues.length ? (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
                    {auditQuery.data.issues.map((issue: any, index: number) => (
                      <div
                        key={`${issue.type}-${index}`}
                        className="flex gap-2"
                      >
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
                    Nenhuma parada próxima pulada, salto longo ou coordenada
                    repetida foi detectada.
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {routeQuery.isLoading || stopsQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-10 w-40 rounded-xl" />
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  <Skeleton className="h-44 rounded-2xl" />
                  <Skeleton className="h-44 rounded-2xl" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="flex gap-3">
                      <Skeleton className="h-12 w-12 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-4/5" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </CardContent>
            </Card>
          </div>
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
                      disabled={
                        isSavingEndpoints || updateRouteMutation.isPending
                      }
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingEndpoints
                        ? "Salvando..."
                        : "Salvar in\u00edcio/fim"}
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-white p-4">
                      <div className="mb-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            void handleRouteLocationCheckin("start")
                          }
                          disabled={
                            isCheckingInStart ||
                            isSavingEndpoints ||
                            updateRouteMutation.isPending
                          }
                        >
                          <MapPin className="h-4 w-4" />
                          {isCheckingInStart ? "Marcando..." : "Meu local"}
                        </Button>
                      </div>
                      <AddressInputSimple
                        id="route-detail-start-address"
                        label="Início da rota"
                        placeholder="Rua, número, bairro, cidade - UF"
                        value={startPoint.address}
                        latitude={startPoint.latitude}
                        longitude={startPoint.longitude}
                        onAddressChange={address =>
                          setStartPoint(current => ({ ...current, address }))
                        }
                        onCoordinatesChange={(latitude, longitude) =>
                          setStartPoint(current => ({
                            ...current,
                            latitude,
                            longitude,
                          }))
                        }
                      />
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-white p-4">
                      <div className="mb-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => void handleRouteLocationCheckin("end")}
                          disabled={
                            isCheckingInEnd ||
                            isSavingEndpoints ||
                            updateRouteMutation.isPending
                          }
                        >
                          <MapPin className="h-4 w-4" />
                          {isCheckingInEnd ? "Marcando..." : "Meu local"}
                        </Button>
                      </div>
                      <AddressInputSimple
                        id="route-detail-end-address"
                        label="Fim da rota"
                        placeholder="Rua, número, bairro, cidade - UF"
                        value={endPoint.address}
                        latitude={endPoint.latitude}
                        longitude={endPoint.longitude}
                        onAddressChange={address =>
                          setEndPoint(current => ({ ...current, address }))
                        }
                        onCoordinatesChange={(latitude, longitude) =>
                          setEndPoint(current => ({
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
                              <p className="font-semibold">
                                Avisar parada próxima
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Se você passar perto de outra entrega, o app
                                avisa.
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant={
                              proximityAlertsEnabled ? "outline" : "default"
                            }
                            className="shrink-0 gap-2"
                            onClick={() => {
                              if (proximityAlertsEnabled) {
                                setProximityAlertsEnabled(false);
                                setActiveProximityAlert(null);
                                toast.message(
                                  "Alertas de proximidade desativados."
                                );
                                return;
                              }

                              void ensureProximityAudioReady();
                            }}
                          >
                            <BellRing className="h-4 w-4" />
                            {proximityAlertsEnabled
                              ? "Desativar"
                              : "Ativar alertas"}
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              proximitySoundEnabled ? "secondary" : "outline"
                            }
                            className="gap-2"
                            onClick={() =>
                              setProximitySoundEnabled(current => !current)
                            }
                          >
                            <Volume2 className="h-4 w-4" />
                            Som {proximitySoundEnabled ? "ligado" : "desligado"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              proximityVibrationEnabled
                                ? "secondary"
                                : "outline"
                            }
                            onClick={() =>
                              setProximityVibrationEnabled(current => !current)
                            }
                          >
                            Vibração{" "}
                            {proximityVibrationEnabled ? "ligada" : "desligada"}
                          </Button>
                          <span className="inline-flex items-center text-xs text-muted-foreground">
                            Até {PROXIMITY_ALERT_RADIUS_METERS} m
                          </span>
                        </div>
                      </div>
                    )}

                    {activeProximityAlert && activeProximityStop && (
                      <div className="rounded-2xl border border-amber-400/50 bg-amber-50 p-4 text-amber-950">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold uppercase">
                              Você está perto desta entrega
                            </p>
                            <p className="text-lg font-bold leading-snug">
                              Parada{" "}
                              {getStopDisplayLabel(
                                activeProximityStop,
                                activeProximityAlert.stopIndex
                              )}{" "}
                              a{" "}
                              {formatDistanceMeters(
                                activeProximityAlert.distanceMeters
                              )}
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
                              setSelectedStopIndex(
                                activeProximityAlert.stopIndex
                              );
                              setStopSearch("");
                            }}
                          >
                            Ver detalhes
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="bg-white"
                            onClick={() => openStopInMap(activeProximityStop)}
                          >
                            <Navigation className="mr-2 h-4 w-4" />
                            Ir no mapa
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              void handleStopResultAtIndex(
                                activeProximityAlert.stopIndex,
                                "delivered",
                                "proximity_alert"
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
                            failedCount > 0 ? "text-amber-950" : "text-accent",
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
                                failedCount > 0
                                  ? "text-amber-900"
                                  : "text-accent/90",
                              ].join(" ")}
                            >
                              {failedCount > 0
                                ? `${deliveredCount} entregue(s) e ${failedCount} não entregue(s).`
                                : "A rota foi marcada como concluida."}
                            </p>
                          </div>
                        </div>
                        {deliveryState.lastAction && (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-4 gap-2 bg-white"
                            onClick={() => void handleUndoLastAction()}
                            disabled={updateRouteMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Reverter última ação
                          </Button>
                        )}
                      </div>
                    ) : deliveryState.started && currentStop ? (
                      <div className="rounded-2xl border border-primary/20 bg-white p-4 shadow-sm sm:p-5">
                        <div className="mb-4 space-y-2">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Próxima ação
                          </p>
                          <p className="text-2xl font-bold tracking-tight">
                            Vá para esta entrega
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Confira STOP, pacote e endereço antes de marcar o
                            resultado.
                          </p>
                        </div>

                        <div className="mb-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-primary/20 bg-primary p-4 text-primary-foreground shadow-sm">
                            <p className="text-xs font-semibold uppercase opacity-80">
                              Parada
                            </p>
                            <p className="mt-1 text-4xl font-black leading-none">
                              {currentStopIdentity?.routeStopLabel}
                            </p>
                            <p className="mt-1 text-xs opacity-85">
                              de {stops.length}
                            </p>
                          </div>
                          {currentStopIdentity?.shopeeStopLabel ? (
                            <div
                              className={
                                routeIsShopeeStopSequence
                                  ? "rounded-2xl border border-orange-300 bg-orange-500 p-4 text-white shadow-sm"
                                  : "rounded-2xl border border-border bg-secondary/70 p-4 text-foreground"
                              }
                            >
                              <p className="text-xs font-semibold uppercase opacity-90">
                                STOP
                              </p>
                              <p className="mt-1 text-4xl font-black leading-none">
                                {currentStopIdentity.shopeeStopLabel.replace(
                                  "STOP ",
                                  ""
                                )}
                              </p>
                              <p className="mt-1 text-xs opacity-90">
                                {currentStopIdentity.shopeeStopLabel ===
                                "Sem STOP"
                                  ? routeIsShopeeStopSequence
                                    ? "Encaixar por proximidade"
                                    : "Sem STOP na tabela"
                                  : routeIsShopeeStopSequence
                                    ? "Ordem da tabela ativa"
                                    : "Referencia da tabela"}
                              </p>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-border bg-secondary/70 p-4 text-foreground">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">
                                STOP
                              </p>
                              <p className="mt-1 text-2xl font-black leading-none">
                                Não usado
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Rota otimizada
                              </p>
                            </div>
                          )}
                          <div className="rounded-2xl border border-primary/10 bg-primary/10 p-4 text-primary">
                            <p className="text-xs font-semibold uppercase">
                              Pacote
                            </p>
                            <p className="mt-1 break-words text-2xl font-black leading-tight">
                              {currentStopIdentity?.packageLabel?.replace(
                                /^Pacotes?:\s*/,
                                ""
                              ) || "Sem pacote"}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-xl border border-border/70 bg-secondary/40 p-4">
                            <div className="flex gap-3">
                              <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" />
                              <div className="min-w-0">
                                <p className="text-lg font-semibold leading-snug">
                                  {currentStop.address}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Toque em Ir no mapa para navegar até a parada.
                                </p>
                                {currentStopGroupedDeliveryLabel ? (
                                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary">
                                    <PackageCheck className="h-4 w-4 shrink-0" />
                                    {currentStopGroupedDeliveryLabel}
                                  </p>
                                ) : null}
                                {currentStop.notes ? (
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    Observação: {currentStop.notes}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              className="h-12 justify-center gap-2 text-base"
                              onClick={() => {
                                setShowRouteMap(false);
                                openStopInMap(currentStop);
                              }}
                            >
                              <Navigation className="h-5 w-5" />
                              Ir no mapa
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 justify-center gap-2 border-emerald-600 text-base text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                              onClick={handleDelivered}
                              disabled={updateRouteMutation.isPending}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                              Entregue
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              className="h-12 justify-center gap-2 text-base"
                              onClick={handleNotDelivered}
                              disabled={updateRouteMutation.isPending}
                            >
                              <XCircle className="h-5 w-5" />
                              Não entregue
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 justify-center gap-2 text-base"
                              onClick={() => void handleUndoLastAction()}
                              disabled={
                                updateRouteMutation.isPending ||
                                !deliveryState.lastAction
                              }
                            >
                              <RotateCcw className="h-5 w-5" />
                              Desfazer
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/70 bg-secondary/55 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <Clock className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="font-medium">Pronto para sair</p>
                              {nextStop ? (
                                <div className="mt-2 space-y-2">
                                  <p className="text-sm text-muted-foreground">
                                    Primeira parada
                                  </p>
                                  <p className="text-lg font-semibold leading-snug">
                                    {nextStop.address}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary">
                                      Parada{" "}
                                      {nextStopIdentity?.routeStopLabel ??
                                        nextStopIndex + 1}
                                    </Badge>
                                    {nextStopIdentity?.shopeeStopLabel ? (
                                      <Badge
                                        variant={
                                          routeIsShopeeStopSequence
                                            ? "default"
                                            : "outline"
                                        }
                                        className={
                                          routeIsShopeeStopSequence
                                            ? "bg-orange-500 text-white hover:bg-orange-500"
                                            : undefined
                                        }
                                      >
                                        {nextStopIdentity.shopeeStopLabel}
                                      </Badge>
                                    ) : null}
                                    {nextStopIdentity?.packageLabel ? (
                                      <Badge variant="outline">
                                        {nextStopIdentity.packageLabel}
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Todas as paradas já foram tratadas.
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            type="button"
                            className="h-12 shrink-0 gap-2 text-base"
                            onClick={handleStartRoute}
                            disabled={
                              stops.length === 0 ||
                              isComplete ||
                              isLocatingForReoptimization ||
                              auditQuery.isLoading ||
                              hasStructuralAuditIssues
                            }
                          >
                            <Play className="h-5 w-5" />
                            Iniciar rota
                          </Button>
                        </div>
                      </div>
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
                      onChange={event => setStopSearch(event.target.value)}
                      placeholder="Buscar endereço, STOP, pacote ou parada"
                      aria-label="Buscar paradas por endereço, STOP, pacote ou número"
                    />
                    {stopSearch.trim() && (
                      <p className="text-xs text-muted-foreground">
                        {filteredStops.length} de {stops.length} parada(s)
                        encontrada(s)
                      </p>
                    )}
                  </div>
                  {routeStartPoint && (
                    <div className="rounded-lg border border-accent/40 bg-accent/15 p-3">
                      <p className="text-xs font-semibold uppercase text-accent/90">
                        Início
                      </p>
                      <p className="text-sm text-foreground">
                        {routeStartPoint.address}
                      </p>
                    </div>
                  )}
                  {filteredStops.map(({ stop, index }) => {
                    const delivered = deliveredSet.has(index);
                    const failed = failedSet.has(index);
                    const active =
                      deliveryState.started &&
                      index === deliveryState.currentIndex;
                    const expanded = selectedStopIndex === index;
                    const stopLabel = getStopDisplayLabel(stop, index);
                    const identity = getStopIdentityDetails(stop, index);

                    return (
                      <div key={stop.id ?? index}>
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() =>
                            setSelectedStopIndex(current =>
                              current === index ? null : index
                            )
                          }
                        >
                          <div className="flex gap-3">
                            <div
                              className={[
                                "mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-center font-bold leading-none",
                                !delivered && !failed
                                  ? getStopNumberTextClass(stopLabel)
                                  : "",
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
                                <span className="max-w-10 truncate">
                                  {stopLabel}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-snug">
                                {stop.address}
                              </p>
                              <StopIdentityStrip
                                routePositionLabel={identity.routeStopLabel}
                                stopLabel={identity.shopeeStopLabel}
                                packageLabel={identity.packageLabel}
                                className="mt-2"
                              />
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
                                  onAddressChange={address =>
                                    setStopDraft(current => ({
                                      ...current,
                                      address,
                                      latitude: 0,
                                      longitude: 0,
                                    }))
                                  }
                                  onCoordinatesChange={(latitude, longitude) =>
                                    setStopDraft(current => ({
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
                                      Pacote ou rastreio
                                    </label>
                                    <Input
                                      id={`route-detail-stop-${stop.id ?? index}-package`}
                                      value={stopDraft.packageNumber}
                                      onChange={event =>
                                        setStopDraft(current => ({
                                          ...current,
                                          packageNumber: event.target.value,
                                        }))
                                      }
                                      placeholder="Ex.: SPX123 ou 1520"
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
                                      onChange={event =>
                                        setStopDraft(current => ({
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
                                    onClick={() =>
                                      void handleSaveStop(stop, index)
                                    }
                                    disabled={updateStopMutation.isPending}
                                  >
                                    <Save className="h-4 w-4" />
                                    {updateStopMutation.isPending
                                      ? "Salvando..."
                                      : "Salvar parada"}
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
                                disabled={
                                  updateStopMutation.isPending ||
                                  deleteStopMutation.isPending
                                }
                              >
                                <Pencil className="h-4 w-4" />
                                Editar parada
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2 text-destructive hover:text-destructive"
                                onClick={() =>
                                  void handleDeleteStop(stop, index)
                                }
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
                                onClick={() =>
                                  void handleStopResultAtIndex(
                                    index,
                                    "delivered",
                                    "stop_list"
                                  )
                                }
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
                                onClick={() =>
                                  void handleStopResultAtIndex(
                                    index,
                                    "failed",
                                    "stop_list"
                                  )
                                }
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
                        {index < stops.length - 1 && (
                          <Separator className="mt-3" />
                        )}
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
                      <p className="text-sm text-foreground">
                        {routeEndPoint.address}
                      </p>
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
                  startPoint={
                    hasValidCoordinates(startPoint)
                      ? startPoint
                      : routeStartPoint
                  }
                  endPoint={
                    hasValidCoordinates(endPoint) ? endPoint : routeEndPoint
                  }
                  auditIssues={auditQuery.data?.issues || []}
                />
              </Suspense>
            ) : (
              <Card className="border-border/80 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">Mapa da rota</p>
                    <p className="text-sm text-muted-foreground">
                      Carregue o mapa somente quando precisar visualizar o
                      trajeto completo.
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
