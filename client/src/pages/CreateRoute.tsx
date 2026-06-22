import { useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { Capacitor, registerPlugin } from "@capacitor/core";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressInputSimple from "@/components/AddressInputSimple";
import RouteMetrics from "@/components/RouteMetrics";
import {
  calculateGeocodingConfidence,
  type GeocodingMethod,
} from "@shared/geocodingConfidence";
import RouteShare from "@/components/RouteShare";
import RouteMap from "@/components/RouteMap";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { FileText, FileSpreadsheet, Flag, Mic, MicOff, Plus, Trash2, Upload, Zap, MapPin, Truck } from "lucide-react";
import {
  parseImileScreenFile,
  parseImileScreenText,
  parseRouteWorkbook,
  type ImportedRoute,
  type ImportedStop,
} from "@/services/routeImportService";
import {
  rememberAddressCoordinates,
  searchAddress,
  type AddressSuggestion,
} from "@/services/maps/geocodingService";
import { getCurrentPosition } from "@/services/maps/locationService";
import { cn } from "@/lib/utils";
import { buildApiUrl } from "@/lib/apiBase";
import { saveLastRouteProgress } from "@/lib/routeProgress";
import {
  applyEditedVoiceStop,
  applyFinalVoiceStop,
  parseVoiceStop,
} from "./createRouteVoiceStops";
import {
  normalizeStopMetadata,
  normalizeStopSourceProvider,
  parseLegacyStopNotes,
  type StopMetadata,
  type StopSourceProvider,
} from "@shared/stopMetadata";

type ImileCapturePlugin = {
  openAccessibilitySettings: () => Promise<void>;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<{ xml: string }>;
  getCapture: () => Promise<{ active: boolean; xml: string }>;
};

const ImileCapture = registerPlugin<ImileCapturePlugin>("ImileCapture");
const MAX_ROUTE_STOPS = 150;
const IMPORT_SOURCE_OPTIONS: Array<{ value: StopSourceProvider; label: string }> = [
  { value: "generic", label: "Genérico" },
  { value: "shopee", label: "Shopee" },
  { value: "mercado_livre", label: "Mercado Livre" },
  { value: "amazon", label: "Amazon" },
  { value: "correios", label: "Correios" },
  { value: "manual", label: "Manual" },
];

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type RouteStop = Pick<ImportedStop, "address" | "latitude" | "longitude"> & {
  packageNumber?: string;
  deliveryCount?: number;
  routingStop?: number;
  sourceProvider?: StopSourceProvider;
  originalStop?: number | null;
  isUnsequencedStop?: boolean;
  metadata?: StopMetadata;
  notes?: string;
  sourceRow?: number;
  geocodingConfidenceScore?: number;
  geocodingMethod?: GeocodingMethod;
  geocodingSuspect?: boolean;
};
type RoutePoint = Pick<RouteStop, "address" | "latitude" | "longitude">;
type StopIssue = {
  index: number;
  sourceRow?: number;
  address: string;
  hasAddress: boolean;
  hasCoordinates: boolean;
  suspiciousGeocoding: boolean;
  geocodingConfidenceScore?: number;
};

const EMPTY_ROUTE_POINT: RoutePoint = { address: "", latitude: 0, longitude: 0 };
const IS_LOCAL_ANDROID_API =
  import.meta.env.VITE_API_BASE_URL?.includes("127.0.0.1") ||
  import.meta.env.VITE_API_BASE_URL?.includes("localhost");
const SHOW_IMILE_API_CONNECTOR = false;
const GEOCODING_MIN_INTERVAL_MS = 1150;
const GEOCODING_QUERY_TIMEOUT_MS = 8000;
const MAX_BATCH_GEOCODE_CANDIDATES = 2;
const MAX_FALLBACK_GEOCODE_CANDIDATES = 5;
let lastGeocodingRequestAt = 0;

function isLocalBrowserHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function isPackagedAndroidApp() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function isNetworkFetchError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForGeocodingSlot() {
  const elapsed = Date.now() - lastGeocodingRequestAt;
  if (elapsed < GEOCODING_MIN_INTERVAL_MS) {
    await wait(GEOCODING_MIN_INTERVAL_MS - elapsed);
  }
  lastGeocodingRequestAt = Date.now();
}

function isAddressServiceBusyError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("limite") ||
    message.includes("ocupado") ||
    message.includes("too many") ||
    message.includes("429")
  );
}

async function assertApiReachable() {
  try {
    const response = await fetch(buildApiUrl("/api/health"), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Servidor respondeu ${response.status}`);
    }
  } catch {
    if (IS_LOCAL_ANDROID_API) {
      throw new Error(
        "Sem conexão com o servidor local. Verifique se o ambiente de teste está ativo e tente novamente."
      );
    }

    throw new Error(
      "Sem conexão com o servidor. Confira a internet do aparelho e tente novamente em alguns segundos."
    );
  }
}

async function searchAddressWithNetworkRetry(
  query: string,
  options: Parameters<typeof searchAddress>[1]
) {
  try {
    return await searchAddress(query, options);
  } catch (error) {
    if (!isNetworkFetchError(error)) {
      throw error;
    }

    await assertApiReachable();
    await wait(750);

    try {
      return await searchAddress(query, options);
    } catch (retryError) {
      if (isNetworkFetchError(retryError)) {
        throw new Error(
          "A conexão com o servidor caiu durante a busca de coordenadas. Confira a internet do aparelho e tente novamente."
        );
      }

      throw retryError;
    }
  }
}

async function searchAddressWithTimeout(
  query: string,
  options: Parameters<typeof searchAddress>[1] = {}
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    GEOCODING_QUERY_TIMEOUT_MS
  );

  try {
    return await searchAddressWithNetworkRetry(query, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function parseStopNotes(notes?: string) {
  const parsed = parseLegacyStopNotes(notes);

  return {
    packageNumber: parsed.metadata.packageNumber ?? "",
    notes: parsed.notes,
    metadata: parsed.metadata,
  };
}

function buildStopNotes(packageNumber?: string, notes?: string) {
  return notes?.trim() || undefined;
}

function buildStopMetadata(stop: RouteStop) {
  return normalizeStopMetadata({
    ...stop.metadata,
    packageNumber: stop.packageNumber || stop.metadata?.packageNumber,
    groupedDeliveryCount: stop.deliveryCount || stop.metadata?.groupedDeliveryCount,
  });
}

export default function CreateRoute() {
  const [, navigate] = useLocation();
  const [isCalculating, setIsCalculating] = useState(false);
  const [createdRouteId, setCreatedRouteId] = useState<number | undefined>();
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"shortest_distance" | "shortest_time" | "balanced">("balanced");
  const [importSourceProvider, setImportSourceProvider] =
    useState<StopSourceProvider>("generic");
  const [importSummary, setImportSummary] = useState<ImportedRoute | null>(null);
  const [respectImportedStopSequence, setRespectImportedStopSequence] = useState(false);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isImportingImileCapture, setIsImportingImileCapture] = useState(false);
  const [isImportingLatestImileCapture, setIsImportingLatestImileCapture] = useState(false);
  const [isRunningImileCapture, setIsRunningImileCapture] = useState(false);
  const [isImportingImile, setIsImportingImile] = useState(false);
  const [imileDateFrom, setImileDateFrom] = useState(() => toDateInputValue(new Date()));
  const [imileDateTo, setImileDateTo] = useState(() => toDateInputValue(new Date()));
  const [imileStatus, setImileStatus] = useState("");
  const [voiceRecognition, setVoiceRecognition] = useState<SpeechRecognitionLike | null>(null);
  const [isListeningVoiceStops, setIsListeningVoiceStops] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [pendingVoiceStopIndex, setPendingVoiceStopIndex] = useState<number | null>(null);
  const pendingVoiceStopIndexRef = useRef<number | null>(null);
  const [voiceAddressSuggestions, setVoiceAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingVoiceSuggestions, setIsLoadingVoiceSuggestions] = useState(false);
  const [voiceSuggestionError, setVoiceSuggestionError] = useState<string | null>(null);
  const [isResolvingCoordinates, setIsResolvingCoordinates] = useState(false);
  const [coordinateResolveProgress, setCoordinateResolveProgress] = useState<{
    resolved: number;
    total: number;
  } | null>(null);
  const [startPoint, setStartPoint] = useState<RoutePoint>(EMPTY_ROUTE_POINT);
  const [endPoint, setEndPoint] = useState<RoutePoint>(EMPTY_ROUTE_POINT);
  const [isCheckingInStart, setIsCheckingInStart] = useState(false);
  const [isCheckingInEnd, setIsCheckingInEnd] = useState(false);
  const [invalidStopIndexes, setInvalidStopIndexes] = useState<number[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([
    { address: "", latitude: 0, longitude: 0, geocodingConfidenceScore: 0, geocodingMethod: "city_match", geocodingSuspect: true },
    { address: "", latitude: 0, longitude: 0, geocodingConfidenceScore: 0, geocodingMethod: "city_match", geocodingSuspect: true },
  ]);

  const createAndOptimizeMutation = trpc.routes.createAndOptimize.useMutation();
  const imileDeliveriesQuery = trpc.imile.deliveries.useQuery(
    {
      dateFrom: imileDateFrom,
      dateTo: imileDateTo,
      status: imileStatus.trim() || undefined,
    },
    { enabled: false }
  );
  const isSavingRoute =
    createAndOptimizeMutation.isPending ||
    isResolvingCoordinates;
  const routeActionLabel = respectImportedStopSequence
    ? "Criar rota com STOP"
    : "Criar e Otimizar Rota";
  const canRunImileScreenCapture =
    (IS_LOCAL_ANDROID_API || isLocalBrowserHost()) && !isPackagedAndroidApp();
  const canUseAndroidImileCapture = isPackagedAndroidApp();
  const submitLabel = isResolvingCoordinates
    ? coordinateResolveProgress
      ? `Localizando ${coordinateResolveProgress.resolved}/${coordinateResolveProgress.total}...`
      : "Localizando endere\u00e7os..."
    : isSavingRoute
      ? respectImportedStopSequence
        ? "Criando rota..."
        : "Criando e otimizando..."
      : routeActionLabel;

  const updatePendingVoiceStopIndex = (
    next:
      | number
      | null
      | ((current: number | null) => number | null)
  ) => {
    const resolved =
      typeof next === "function" ? next(pendingVoiceStopIndexRef.current) : next;
    pendingVoiceStopIndexRef.current = resolved;
    setPendingVoiceStopIndex(resolved);
    return resolved;
  };

  const createAndOptimizeWithNetworkRetry = async (
    payload: Parameters<typeof createAndOptimizeMutation.mutateAsync>[0]
  ) => {
    try {
      return await createAndOptimizeMutation.mutateAsync(payload);
    } catch (error) {
      if (!isNetworkFetchError(error)) {
        throw error;
      }

      await assertApiReachable();
      await wait(750);

      try {
        return await createAndOptimizeMutation.mutateAsync(payload);
      } catch (retryError) {
        if (isNetworkFetchError(retryError)) {
          throw new Error(
            "A conexão com o servidor caiu durante a criação da rota. Confira a internet do aparelho e tente novamente."
          );
        }

        throw retryError;
      }
    }
  };

  const hasValidCoordinates = (stop: RoutePoint) =>
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude) &&
    !(stop.latitude === 0 && stop.longitude === 0) &&
    stop.latitude >= -90 &&
    stop.latitude <= 90 &&
    stop.longitude >= -180 &&
    stop.longitude <= 180;

  const getDefaultStopConfidence = (stop: RoutePoint) =>
    calculateGeocodingConfidence({
      method: hasValidCoordinates(stop) ? "manual_coordinate" : "city_match",
    });

  const getStopIssues = (routeStops: RouteStop[]): StopIssue[] =>
    routeStops
      .map((stop, index) => ({
        index,
        sourceRow: stop.sourceRow,
        address: stop.address,
        hasAddress: Boolean(stop.address.trim()),
        hasCoordinates: hasValidCoordinates(stop),
        suspiciousGeocoding:
          hasValidCoordinates(stop) &&
          Number(stop.geocodingConfidenceScore ?? 0) < 60,
        geocodingConfidenceScore: stop.geocodingConfidenceScore,
      }))
      .filter(
        (item) =>
          !item.hasAddress || !item.hasCoordinates || item.suspiciousGeocoding
      );

  const formatStopIssue = (issue: StopIssue) =>
    `Parada ${issue.index + 1}${issue.sourceRow ? ` (linha ${issue.sourceRow})` : ""}`;

  const formatStopList = (issues: StopIssue[]) =>
    issues
      .slice(0, 5)
      .map(formatStopIssue)
      .join(", ") + (issues.length > 5 ? ` e mais ${issues.length - 5}` : "");

  const getAuthHeaders = (): Record<string, string> => {
    return {};
  };

  const assertRouteStopLimit = (stopCount: number, source: string) => {
    if (stopCount <= MAX_ROUTE_STOPS) return true;
    toast.error(
      `${source} tem ${stopCount} paradas. Durante testes e validação, o limite operacional é de ${MAX_ROUTE_STOPS} paradas por rota. Volumes maiores serão liberados gradualmente conforme a infraestrutura evoluir.`
    );
    return false;
  };

  const applyImileCaptureRoute = (
    importedRoute: ImportedRoute,
    descriptionSource: string,
    successLabel: string
  ) => {
    if (!assertRouteStopLimit(importedRoute.stops.length, "Esta importacao")) {
      return;
    }

    setInvalidStopIndexes([]);
    setStops(
      importedRoute.stops.map((stop) => ({
        ...(() => {
          const confidence = getDefaultStopConfidence(stop);
          return {
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            geocodingConfidenceScore: confidence.score,
            geocodingMethod: confidence.method,
            geocodingSuspect: confidence.suspect,
          };
        })(),
        packageNumber: stop.packageNumber,
        deliveryCount: stop.deliveryCount,
        routingStop: stop.routingStop,
        sourceProvider: stop.sourceProvider ?? "imile",
        originalStop: stop.originalStop ?? null,
        isUnsequencedStop: Boolean(stop.isUnsequencedStop),
        metadata: normalizeStopMetadata(stop.metadata),
        notes: stop.notes,
        sourceRow: stop.sourceRow,
      }))
    );
    setImportSummary(importedRoute);
    setRespectImportedStopSequence(false);

    if (!name.trim()) {
      setName(importedRoute.routeName);
    }

    if (!description.trim()) {
      const totalDeliveries = importedRoute.totalDeliveries ?? importedRoute.stops.length;
      setDescription(
        `Importada ${descriptionSource} com ${importedRoute.stops.length} paradas e ${totalDeliveries} entregas.`
      );
    }

    const totalDeliveries = importedRoute.totalDeliveries ?? importedRoute.stops.length;
    toast.success(
      `${importedRoute.stops.length} paradas e ${totalDeliveries} entregas iMile ${successLabel}.`
    );
    if ((importedRoute.groupedDeliveries ?? 0) > 0) {
      toast.message(`${importedRoute.groupedDeliveries} entregas agrupadas em enderecos ja importados.`);
    }
    toast.warning("As coordenadas serao buscadas ao criar a rota.");
  };

  const getAddressParts = (address: string) =>
    address
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const hasPostalCode = (value: string) => /\b\d{5}-?\d{3}\b/.test(value);

  const normalizeAddressToken = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const normalizeStateForSearch = (state?: string) => {
    const normalized = normalizeAddressToken(state || "");
    if (!normalized) return "";
    if (normalized === "sp" || normalized === "sao paulo") return "SP";
    if (normalized.length === 2) return normalized.toUpperCase();
    return state?.trim() || "";
  };

  const inferState = (city?: string, explicitState?: string) => {
    const state = normalizeStateForSearch(explicitState);
    if (state) return state;
    if (!city) return "";

    return city.toLowerCase().includes("presidente prudente") ? "SP" : "";
  };

  const buildCandidate = (parts: string[]) =>
    parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

  const stripStreetComplementForSearch = (street: string) =>
    street
      .replace(
        /\s+\b(?:torre|bloco|apto?|apartamento|casa|fundos|sala|loja|quadra|lote)\b.*$/i,
        ""
      )
      .trim() || street;

  const normalizeStreetForSearch = (street: string) =>
    stripStreetComplementForSearch(street)
      .replace(/^av\.?\s+/i, "Avenida ")
      .replace(/^r\.?\s+/i, "Rua ")
      .trim();

  const getStateIndex = (parts: string[]) =>
    parts.findIndex((part) => {
      const normalized = normalizeAddressToken(part);
      return normalized === "sp" || normalized === "sao paulo";
    });

  const getCleanedAddressCandidates = (address: string) => {
    const rawParts = getAddressParts(address);
    const parts =
      rawParts.length >= 2 && /^\d+[a-zA-Z]?$/.test(rawParts[0]) && /[A-Za-z]/.test(rawParts[1])
        ? [rawParts[1], rawParts[0], ...rawParts.slice(2)]
        : rawParts;

    if (parts.length < 4) {
      return [];
    }

    const [street, number, ...rest] = parts;
    const streetForSearch = normalizeStreetForSearch(street);
    const restWithoutPostalCode = rest.filter((part) => !hasPostalCode(part));
    const stateIndex = getStateIndex(restWithoutPostalCode);
    const explicitState = stateIndex >= 0 ? restWithoutPostalCode[stateIndex] : "";
    const city =
      stateIndex > 0
        ? restWithoutPostalCode[stateIndex - 1]
        : restWithoutPostalCode[restWithoutPostalCode.length - 1];
    const districtParts =
      stateIndex > 1
        ? restWithoutPostalCode.slice(0, stateIndex - 1)
        : restWithoutPostalCode.slice(0, -1);
    const state = inferState(city, explicitState);
    const district = districtParts.join(", ");
    const baseWithDistrict = buildCandidate([
      streetForSearch,
      number,
      district,
      city,
      state,
      "Brasil",
    ]);
    const baseWithoutDistrict = buildCandidate([
      streetForSearch,
      number,
      city,
      state,
      "Brasil",
    ]);
    const streetWithDistrict = buildCandidate([streetForSearch, district, city, state, "Brasil"]);
    const streetWithCity = buildCandidate([streetForSearch, city, state, "Brasil"]);
    const streetNumberCity = buildCandidate([streetForSearch, number, city, state, "Brasil"]);

    return [
      baseWithDistrict,
      baseWithoutDistrict,
      streetNumberCity,
      streetWithDistrict,
      streetWithCity,
    ].filter(Boolean);
  };

  const getSearchCandidates = (address: string) => {
    const normalized = address.replace(/\s+/g, " ").trim();
    const candidates = [
      ...getCleanedAddressCandidates(normalized),
      normalized,
      normalized.includes("Brasil") ? "" : `${normalized}, Brasil`,
    ].filter(Boolean);

    return Array.from(new Set(candidates));
  };

  const searchFirstAddressMatch = async (
    address: string,
    maxCandidates = MAX_BATCH_GEOCODE_CANDIDATES
  ) => {
    for (const candidate of getSearchCandidates(address).slice(0, maxCandidates)) {
      await waitForGeocodingSlot();
      let suggestions;

      try {
        suggestions = await searchAddressWithTimeout(candidate, {
          limit: 1,
          useFallbackQueries: false,
        });
      } catch (error) {
        if (isAddressServiceBusyError(error)) {
          await wait(1800);
          continue;
        }

        continue;
      }

      const suggestion = suggestions[0];

      if (suggestion) {
        return suggestion;
      }
    }

    return undefined;
  };

  const resolveMissingCoordinates = async (routeStops: RouteStop[]) => {
    const resolvedStops: RouteStop[] = [];
    let resolvedCount = 0;
    const totalToResolve = routeStops.filter((stop) => !hasValidCoordinates(stop)).length;
    let attemptedCount = 0;

    for (const stop of routeStops) {
      if (hasValidCoordinates(stop)) {
        resolvedStops.push(stop);
        continue;
      }

      const suggestion = await searchFirstAddressMatch(stop.address);

      if (suggestion) {
        resolvedStops.push({
          ...stop,
          latitude: suggestion.latitude,
          longitude: suggestion.longitude,
          geocodingConfidenceScore: suggestion.geocodingConfidenceScore,
          geocodingMethod: suggestion.geocodingMethod,
          geocodingSuspect: suggestion.geocodingSuspect,
        });
        resolvedCount += 1;
      } else {
        resolvedStops.push(stop);
      }

      attemptedCount += 1;
      setCoordinateResolveProgress({
        resolved: attemptedCount,
        total: totalToResolve,
      });
    }

    const unresolvedIndexes = resolvedStops
      .map((stop, index) => (hasValidCoordinates(stop) ? -1 : index))
      .filter((index) => index >= 0);

    const canRunFallbackPass =
      unresolvedIndexes.length > 0 &&
      unresolvedIndexes.length <= Math.max(20, Math.ceil(totalToResolve * 0.25));

    if (canRunFallbackPass) {
      for (const index of unresolvedIndexes) {
        const stop = resolvedStops[index];
        const suggestion = await searchFirstAddressMatch(
          stop.address,
          MAX_FALLBACK_GEOCODE_CANDIDATES
        );

        if (suggestion) {
          resolvedStops[index] = {
            ...stop,
            latitude: suggestion.latitude,
            longitude: suggestion.longitude,
            geocodingConfidenceScore: suggestion.geocodingConfidenceScore,
            geocodingMethod: suggestion.geocodingMethod,
            geocodingSuspect: suggestion.geocodingSuspect,
          };
          resolvedCount += 1;
        }

        attemptedCount += 1;
        setCoordinateResolveProgress({
          resolved: attemptedCount,
          total: totalToResolve + unresolvedIndexes.length,
        });
      }
    }

    const unresolvedCount = resolvedStops.filter((stop) => !hasValidCoordinates(stop)).length;

    return { resolvedStops, resolvedCount, unresolvedCount };
  };

  const resolveOptionalPoint = async (point: RoutePoint) => {
    if (!point.address.trim() || hasValidCoordinates(point)) {
      return { point, resolved: false };
    }

    const suggestion = await searchFirstAddressMatch(point.address);

    if (!suggestion) {
      return { point, resolved: false };
    }

    return {
      point: {
        address: point.address,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      },
      resolved: true,
    };
  };

  const handleAddStop = () => {
    if (!assertRouteStopLimit(stops.length + 1, "Esta rota")) {
      return;
    }

    setInvalidStopIndexes([]);
    setRespectImportedStopSequence(false);
    setStops((currentStops) => [
      ...currentStops,
      {
        address: "",
        latitude: 0,
        longitude: 0,
        geocodingConfidenceScore: 0,
        geocodingMethod: "city_match",
        geocodingSuspect: true,
      },
    ]);
  };

  const loadVoiceAddressSuggestions = async (address: string) => {
    setIsLoadingVoiceSuggestions(true);
    setVoiceSuggestionError(null);
    setVoiceAddressSuggestions([]);

    try {
      const suggestions = await searchAddressWithTimeout(address);
      setVoiceAddressSuggestions(suggestions);
      if (suggestions.length === 0) {
        setVoiceSuggestionError("Nenhuma sugestão encontrada. Ajuste o endereço falado ou digite no campo abaixo.");
      }
    } catch (error) {
      setVoiceSuggestionError(
        error instanceof Error
          ? error.message
          : "Não foi possível buscar sugestões para esse endereço."
      );
    } finally {
      setIsLoadingVoiceSuggestions(false);
    }
  };

  const appendVoiceStop = (rawTranscript: string) => {
    const parsed = parseVoiceStop(rawTranscript);

    if (parsed.address.length < 6) {
      return;
    }

    if (
      pendingVoiceStopIndexRef.current === null &&
      !assertRouteStopLimit(stops.length + 1, "Esta rota")
    ) {
      return;
    }

    voiceRecognition?.stop();
    setVoiceRecognition(null);
    setIsListeningVoiceStops(false);
    setVoiceAddressSuggestions([]);
    setVoiceSuggestionError(null);
    setInvalidStopIndexes([]);
    setRespectImportedStopSequence(false);
    setStops((currentStops) => {
      const result = applyFinalVoiceStop(
        currentStops,
        rawTranscript,
        pendingVoiceStopIndexRef.current
      );
      updatePendingVoiceStopIndex(result.pendingVoiceStopIndex);
      return result.stops;
    });
    setVoiceTranscript(parsed.address);
    void loadVoiceAddressSuggestions(parsed.address);
    toast.message("Escolha o endereço correto nas sugestões para salvar e continuar falando.");
  };

  const handleVoiceTranscriptChange = (address: string) => {
    setVoiceTranscript(address);
    setVoiceAddressSuggestions([]);
    setVoiceSuggestionError(null);

    const voiceStopIndex = pendingVoiceStopIndexRef.current;
    if (voiceStopIndex === null && address.trim().length >= 6) {
      setInvalidStopIndexes([]);
      setRespectImportedStopSequence(false);
    }

    if (voiceStopIndex !== null) {
      setInvalidStopIndexes((current) =>
        current.filter((item) => item !== voiceStopIndex)
      );
    }

    setStops((currentStops) => {
      const result = applyEditedVoiceStop(
        currentStops,
        address,
        pendingVoiceStopIndexRef.current
      );
      updatePendingVoiceStopIndex(result.pendingVoiceStopIndex);
      return result.stops;
    });
  };

  const handleSearchEditedVoiceAddress = () => {
    const address = voiceTranscript.trim();
    if (address.length < 6) {
      toast.error("Digite um endereço mais completo para buscar sugestões.");
      return;
    }

    void loadVoiceAddressSuggestions(address);
  };

  const handleStartVoiceStops = (showInstruction = true) => {
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
      toast.error("Comando de voz não está disponível neste navegador/aparelho.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";

        if (!transcript) continue;

        if (result.isFinal) {
          appendVoiceStop(transcript);
        } else {
          interimTranscript = transcript;
        }
      }

      if (interimTranscript) {
        handleVoiceTranscriptChange(interimTranscript);
      }
    };
    recognition.onerror = (event) => {
      const error = event.error || "erro desconhecido";
      setIsListeningVoiceStops(false);
      setVoiceRecognition(null);
      toast.error(`Falha no comando de voz: ${error}`);
    };
    recognition.onend = () => {
      setIsListeningVoiceStops(false);
      setVoiceRecognition(null);
    };

    try {
      recognition.start();
      setVoiceRecognition(recognition);
      setIsListeningVoiceStops(true);
      setVoiceTranscript("");
      if (showInstruction) {
        toast.message("Fale uma parada. Depois escolha o endereço correto nas sugestões.");
      }
    } catch (error: any) {
      toast.error(error.message || "Não foi possível iniciar o comando de voz.");
    }
  };

  const handleStopVoiceStops = () => {
    voiceRecognition?.stop();
    setVoiceRecognition(null);
    setIsListeningVoiceStops(false);
    updatePendingVoiceStopIndex(null);
    setVoiceAddressSuggestions([]);
    setVoiceSuggestionError(null);
  };

  const handleSelectVoiceAddressSuggestion = (
    suggestion: AddressSuggestion,
    index: number
  ) => {
    setInvalidStopIndexes((current) => current.filter((item) => item !== index));
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index
          ? {
              ...stop,
              address: suggestion.label,
              latitude: suggestion.latitude,
              longitude: suggestion.longitude,
              geocodingConfidenceScore: suggestion.geocodingConfidenceScore,
              geocodingMethod: suggestion.geocodingMethod,
              geocodingSuspect: suggestion.geocodingSuspect,
            }
          : stop
      )
    );
    rememberAddressCoordinates(
      suggestion.label,
      suggestion.latitude,
      suggestion.longitude,
      {
        geocodingConfidenceScore: suggestion.geocodingConfidenceScore,
        geocodingMethod: suggestion.geocodingMethod,
        geocodingSuspect: suggestion.geocodingSuspect,
      }
    );
    updatePendingVoiceStopIndex(null);
    setVoiceTranscript("");
    setVoiceAddressSuggestions([]);
    setVoiceSuggestionError(null);
    toast.success(`Parada ${index + 1} salva. Pode falar a próxima.`);
    window.setTimeout(() => handleStartVoiceStops(false), 650);
  };

  const handleRemoveStop = (index: number) => {
    setInvalidStopIndexes([]);
    setRespectImportedStopSequence(false);
    updatePendingVoiceStopIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
    setVoiceAddressSuggestions([]);
    setVoiceSuggestionError(null);
    setStops((currentStops) => currentStops.filter((_, i) => i !== index));
  };

  const handleAddressChange = (index: number, address: string) => {
    setInvalidStopIndexes((current) => current.filter((item) => item !== index));
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index
          ? {
              ...stop,
              address,
              latitude: 0,
              longitude: 0,
              geocodingConfidenceScore: 0,
              geocodingMethod: "city_match",
              geocodingSuspect: true,
            }
          : stop
      )
    );
  };

  const handleCoordinatesChange = (index: number, latitude: number, longitude: number) => {
    setInvalidStopIndexes((current) => current.filter((item) => item !== index));
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, latitude, longitude } : stop
      )
    );

    if (
      pendingVoiceStopIndexRef.current === index &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude !== 0 &&
      longitude !== 0
    ) {
      updatePendingVoiceStopIndex(null);
      setVoiceTranscript("");
      setVoiceAddressSuggestions([]);
      setVoiceSuggestionError(null);
      toast.success(`Parada ${index + 1} salva. Pode falar a próxima.`);
      window.setTimeout(() => handleStartVoiceStops(false), 650);
    }
  };

  const handlePackageNumberChange = (index: number, packageNumber: string) => {
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, packageNumber } : stop
      )
    );
  };

  const getRoutePointPayload = (point: RoutePoint) =>
    point.address.trim() && hasValidCoordinates(point)
      ? {
          location: point.address.trim(),
          latitude: point.latitude,
          longitude: point.longitude,
        }
      : undefined;

  const handleRouteFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    setIsImportingFile(true);

    try {
      const importedRoute = await parseRouteWorkbook(file, importSourceProvider);
      if (!assertRouteStopLimit(importedRoute.stops.length, "Esta planilha")) {
        return;
      }

      const importedStops = importedRoute.stops.map((stop) => {
        const confidence = getDefaultStopConfidence(stop);
        return {
          ...parseStopNotes(stop.notes),
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          geocodingConfidenceScore: confidence.score,
          geocodingMethod: confidence.method,
          geocodingSuspect: confidence.suspect,
          packageNumber: stop.packageNumber,
          deliveryCount: stop.deliveryCount,
          routingStop: stop.routingStop,
          sourceProvider: stop.sourceProvider,
          originalStop: stop.originalStop,
          isUnsequencedStop: stop.isUnsequencedStop,
          metadata: normalizeStopMetadata({
            ...stop.metadata,
            ...parseStopNotes(stop.notes).metadata,
          }),
          notes: stop.notes,
          sourceRow: stop.sourceRow,
        };
      });

      setInvalidStopIndexes([]);
      setStops(importedStops);
      setImportSummary(importedRoute);
      setRespectImportedStopSequence(false);

      if (!name.trim()) {
        setName(importedRoute.routeName);
      }

      if (!description.trim()) {
        setDescription(
          `Importada de ${file.name} com ${importedRoute.stops.length} paradas.`
        );
      }

      toast.success(`${importedRoute.stops.length} paradas importadas.`);
      if (importedRoute.hasStopSequence) {
        toast.message(
          "Coluna STOP detectada: escolha se deseja seguir essa sequencia ou otimizar automaticamente."
        );
      } else if (importSourceProvider !== "shopee") {
        toast.message("Origem sem regra STOP: a sequência será definida pela otimização da rota.");
      }

      if (importedRoute.missingCoordinateRows > 0) {
        toast.message(
          `${importedRoute.missingCoordinateRows} endereço(s) reconhecido(s). Clique em "${routeActionLabel}" para localizar e criar a rota.`
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Não foi possível importar a planilha.");
    } finally {
      setIsImportingFile(false);
      input.value = "";
    }
  };

  const handleImileCaptureImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    setIsImportingImileCapture(true);

    try {
      const importedRoute = await parseImileScreenFile(file);
      applyImileCaptureRoute(importedRoute, "de captura iMile", "importadas");
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel importar a captura iMile.");
    } finally {
      setIsImportingImileCapture(false);
      input.value = "";
    }
  };

  const handleLatestImileCaptureImport = async () => {
    setIsImportingLatestImileCapture(true);

    try {
      const response = await fetch(buildApiUrl("/api/imile/capture/latest"), {
        credentials: "include",
        headers: {
          Accept: "application/xml,text/plain",
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        const message = response.headers
          .get("content-type")
          ?.includes("application/json")
          ? ((await response.json()) as { message?: string }).message
          : undefined;

        throw new Error(message || "Nenhuma captura iMile pronta para importar.");
      }

      const importedRoute = parseImileScreenText(
        await response.text(),
        "ultima-captura-imile.xml"
      );
      applyImileCaptureRoute(importedRoute, "da ultima captura iMile", "carregadas");
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel usar a ultima captura iMile.");
    } finally {
      setIsImportingLatestImileCapture(false);
    }
  };

  const handleRunImileCaptureImport = async () => {
    setIsRunningImileCapture(true);
    toast.message("Captura iniciada. Mantenha o Rider Delivery aberto na lista de entregas.");

    try {
      const response = await fetch(buildApiUrl("/api/imile/capture/run"), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/xml,text/plain",
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        const message = response.headers
          .get("content-type")
          ?.includes("application/json")
          ? ((await response.json()) as { message?: string }).message
          : undefined;

        throw new Error(message || "Nao foi possivel capturar a tela do Rider Delivery.");
      }

      const importedRoute = parseImileScreenText(
        await response.text(),
        "captura-automatica-imile.xml"
      );
      applyImileCaptureRoute(importedRoute, "da captura automatica iMile", "capturadas");
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel capturar e importar o Rider Delivery.");
    } finally {
      setIsRunningImileCapture(false);
    }
  };

  const handleOpenImileAccessibilitySettings = async () => {
    try {
      await ImileCapture.openAccessibilitySettings();
      toast.message("Ative EconoRota na acessibilidade e volte para iniciar a captura.");
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel abrir a permissao de acessibilidade.");
    }
  };

  const handleStartAndroidImileCapture = async () => {
    setIsRunningImileCapture(true);

    try {
      await ImileCapture.startCapture();
      toast.message("Rider Delivery aberto. Espere a rolagem terminar e volte ao EconoRota.");
    } catch (error: any) {
      setIsRunningImileCapture(false);
      toast.error(error.message || "Nao foi possivel iniciar a captura do Rider Delivery.");
    }
  };

  const handleImportAndroidImileCapture = async () => {
    setIsImportingLatestImileCapture(true);

    try {
      const { xml } = await ImileCapture.stopCapture();
      const importedRoute = parseImileScreenText(xml, "captura-android-imile.xml");
      applyImileCaptureRoute(importedRoute, "da captura Android iMile", "capturadas");
      setIsRunningImileCapture(false);
    } catch (error: any) {
      toast.error(error.message || "Nao foi possivel importar a captura Android iMile.");
    } finally {
      setIsImportingLatestImileCapture(false);
    }
  };

  const handleImileImport = async () => {
    setIsImportingImile(true);

    try {
      const result = await imileDeliveriesQuery.refetch();
      const importedRoute = result.data;

      if (!importedRoute?.configured) {
        toast.error("Cadastre a credencial Rider Delivery no perfil antes de importar.");
        return;
      }

      if (!importedRoute.stops.length) {
        toast.warning("Nenhuma entrega Rider Delivery encontrada para o filtro informado.");
        return;
      }

      if (!assertRouteStopLimit(importedRoute.stops.length, "Esta importacao")) {
        return;
      }

      setInvalidStopIndexes([]);
      setStops(
        importedRoute.stops.map((stop, index) => {
          const confidence = getDefaultStopConfidence(stop);
          const stopMetadata = normalizeStopMetadata((stop as any).metadata);
          return {
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            geocodingConfidenceScore: confidence.score,
            geocodingMethod: confidence.method,
            geocodingSuspect: confidence.suspect,
            packageNumber: stop.packageNumber,
            sourceProvider: "imile" as const,
            originalStop: null,
            isUnsequencedStop: false,
            metadata: normalizeStopMetadata({
              ...stopMetadata,
              importedFrom: "imile",
              packageNumber: stop.packageNumber || stopMetadata.packageNumber,
            }),
            notes: stop.notes,
            sourceRow: index + 1,
          };
        })
      );
      setImportSummary({
        routeName: `Rider Delivery ${imileDateFrom}${imileDateTo !== imileDateFrom ? ` a ${imileDateTo}` : ""}`,
        stops: importedRoute.stops.map((stop, index) => ({
          ...(() => {
            const stopMetadata = normalizeStopMetadata((stop as any).metadata);
            return {
              metadata: normalizeStopMetadata({
                ...stopMetadata,
                importedFrom: "imile",
                packageNumber: stop.packageNumber || stopMetadata.packageNumber,
              }),
            };
          })(),
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          packageNumber: stop.packageNumber,
          sourceProvider: "imile" as const,
          originalStop: null,
          isUnsequencedStop: false,
          notes: stop.notes,
          sourceRow: index + 1,
        })),
        sourceProvider: "imile",
        hasStopSequence: false,
        totalRows: importedRoute.total,
        skippedRows: importedRoute.missingAddressRows,
        missingCoordinateRows: importedRoute.missingCoordinateRows,
      });
      setRespectImportedStopSequence(false);

      if (!name.trim()) {
        setName(`Rider Delivery ${imileDateFrom}`);
      }

      if (!description.trim()) {
        setDescription(`Importada do Rider Delivery/iMile com ${importedRoute.stops.length} entregas.`);
      }

      toast.success(`${importedRoute.stops.length} entregas Rider Delivery carregadas.`);
      if (importedRoute.missingCoordinateRows > 0) {
        toast.warning(
          `${importedRoute.missingCoordinateRows} entregas vieram sem coordenadas e serao geocodificadas ao criar a rota.`
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Falha ao carregar entregas Rider Delivery.");
    } finally {
      setIsImportingImile(false);
    }
  };

  const handleFocusFirstInvalidStop = () => {
    const firstInvalidIndex = invalidStopIndexes[0];
    if (firstInvalidIndex === undefined) return;

    document
      .getElementById(`route-stop-${firstInvalidIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleRemoveInvalidStops = () => {
    const invalidIndexes = new Set(invalidStopIndexes);
    const nextStops = stops.filter((_, index) => !invalidIndexes.has(index));

    if (nextStops.length < 2) {
      toast.error("A rota precisa manter pelo menos 2 paradas.");
      return;
    }

    setStops(nextStops);
    setInvalidStopIndexes([]);
    toast.success(`${invalidIndexes.size} parada(s) com problema removida(s).`);
  };

  const handleGeocodingConfidenceChange = (
    index: number,
    score: number,
    method: GeocodingMethod,
    suspect: boolean
  ) => {
    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index
          ? {
              ...stop,
              geocodingConfidenceScore: score,
              geocodingMethod: method,
              geocodingSuspect: suspect,
            }
          : stop
      )
    );
  };

  const handleRelocateInvalidStops = async () => {
    const issues = getStopIssues(stops);
    const relocatableIssues = issues.filter(
      (issue) =>
        issue.hasAddress && (!issue.hasCoordinates || issue.suspiciousGeocoding)
    );

    if (relocatableIssues.length === 0) {
      toast.message("Não há parada com endereço preenchido aguardando localização.");
      return;
    }

    setIsResolvingCoordinates(true);
    toast.message(
      `Tentando localizar ${relocatableIssues.length} parada(s) pendente(s)...`
    );

    try {
      const indexesToRetry = new Set(relocatableIssues.map((issue) => issue.index));
      const stopsForResolve = stops.map((stop, index) =>
        indexesToRetry.has(index)
          ? {
              ...stop,
              latitude: 0,
              longitude: 0,
              geocodingConfidenceScore: 0,
              geocodingMethod: "city_match" as GeocodingMethod,
              geocodingSuspect: true,
            }
          : stop
      );
      const result = await resolveMissingCoordinates(stopsForResolve);
      const nextIssues = getStopIssues(result.resolvedStops);

      setStops(result.resolvedStops);
      setInvalidStopIndexes(nextIssues.map((item) => item.index));

      if (result.resolvedCount > 0) {
        toast.success(`${result.resolvedCount} parada(s) localizada(s).`);
      }

      if (nextIssues.length > 0) {
        toast.warning(
          `${nextIssues.length} parada(s) ainda precisam de correção manual.`
        );
      } else {
        toast.success("Todas as paradas pendentes foram localizadas.");
      }
    } catch (error: any) {
      toast.error(error.message || "Não foi possível buscar as coordenadas.");
    } finally {
      setIsResolvingCoordinates(false);
      setCoordinateResolveProgress(null);
    }
  };

  const handleRoutePointCheckIn = async (kind: "start" | "end") => {
    const isStart = kind === "start";
    const setChecking = isStart ? setIsCheckingInStart : setIsCheckingInEnd;
    const label = isStart
      ? "Meu local - início da rota"
      : "Meu local - fim da rota";

    setChecking(true);

    try {
      const position = await getCurrentPosition();
      const nextPoint = {
        address: label,
        latitude: position.latitude,
        longitude: position.longitude,
      };

      if (isStart) {
        setStartPoint(nextPoint);
      } else {
        setEndPoint(nextPoint);
      }

      toast.success(
        isStart ? "Início marcado com seu GPS." : "Fim marcado com seu GPS."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível obter sua localização atual."
      );
    } finally {
      setChecking(false);
    }
  };

  const invalidStopIssues = invalidStopIndexes
    .map((index) => {
      const stop = stops[index];

      if (!stop) return undefined;

      return {
        index,
        sourceRow: stop.sourceRow,
        address: stop.address,
        hasAddress: Boolean(stop.address.trim()),
        hasCoordinates: hasValidCoordinates(stop),
        suspiciousGeocoding:
          hasValidCoordinates(stop) &&
          Number(stop.geocodingConfidenceScore ?? 0) < 60,
        geocodingConfidenceScore: stop.geocodingConfidenceScore,
      };
    })
    .filter(Boolean) as StopIssue[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isResolvingCoordinates) {
      toast.message("Espere a localização de endereços terminar.");
      return;
    }

    if (!name.trim()) {
      toast.error("Nome da rota é obrigatório");
      return;
    }

    const filledStops = stops.filter((stop) => stop.address.trim());

    if (filledStops.length < 2) {
      toast.error("Adicione pelo menos 2 paradas");
      return;
    }

    if (!assertRouteStopLimit(filledStops.length, "Esta rota")) {
      return;
    }

    let validStops = filledStops;
    let validStartPoint = startPoint;
    let validEndPoint = endPoint;

    const endpointMissingCoordinates = [validStartPoint, validEndPoint].filter(
      (point) => point.address.trim() && !hasValidCoordinates(point)
    );
    if (endpointMissingCoordinates.length > 0) {
      setIsResolvingCoordinates(true);
      toast.message(
        `Buscando coordenadas de ${endpointMissingCoordinates.length} ponto(s) de in\u00edcio/fim...`
      );

      try {
        const [resolvedStart, resolvedEnd] = await Promise.all([
          resolveOptionalPoint(validStartPoint),
          resolveOptionalPoint(validEndPoint),
        ]);

        validStartPoint = resolvedStart.point;
        validEndPoint = resolvedEnd.point;
        setStartPoint(validStartPoint);
        setEndPoint(validEndPoint);

        const resolvedCount =
          Number(resolvedStart.resolved) + Number(resolvedEnd.resolved);
        if (resolvedCount > 0) {
          toast.success(`${resolvedCount} ponto(s) de in\u00edcio/fim localizado(s).`);
        }
      } catch (error: any) {
        toast.error(error.message || "Não foi possível buscar início/fim.");
        setIsResolvingCoordinates(false);
        return;
      } finally {
        setIsResolvingCoordinates(false);
        setCoordinateResolveProgress(null);
      }
    }

    if (validStartPoint.address.trim() && !hasValidCoordinates(validStartPoint)) {
      toast.error("Confira endereço e coordenadas do início da rota.");
      return;
    }

    if (validEndPoint.address.trim() && !hasValidCoordinates(validEndPoint)) {
      toast.error("Confira endereço e coordenadas do fim da rota.");
      return;
    }

    const stopsMissingCoordinates = validStops.filter(
      (stop) => !hasValidCoordinates(stop)
    );

    if (stopsMissingCoordinates.length > 0) {
      setIsResolvingCoordinates(true);
      toast.message(
        `Buscando coordenadas de ${stopsMissingCoordinates.length} parada(s)...`
      );

      try {
        const result = await resolveMissingCoordinates(validStops);
        validStops = result.resolvedStops;
        setStops(result.resolvedStops);

        if (result.resolvedCount > 0) {
          toast.success(`${result.resolvedCount} parada(s) localizada(s).`);
        }

        if (result.unresolvedCount > 0) {
          toast.warning(
            `${result.unresolvedCount} parada(s) ainda precisam de correção manual antes da otimização.`
          );
        }
      } catch (error: any) {
        toast.error(error.message || "Não foi possível buscar as coordenadas.");
        setIsResolvingCoordinates(false);
        return;
      } finally {
        setIsResolvingCoordinates(false);
        setCoordinateResolveProgress(null);
      }
    }

    const unresolvedStopIssues = getStopIssues(validStops);
    if (unresolvedStopIssues.length > 0) {
      setInvalidStopIndexes(unresolvedStopIssues.map((item) => item.index));
      toast.error(
        `Confira endereço e coordenadas: ${formatStopList(unresolvedStopIssues)}.`
      );
      return;
    }

    try {
      let startPayload = getRoutePointPayload(validStartPoint);
      const endPayload = getRoutePointPayload(validEndPoint);

      if (!startPayload && !validStartPoint.address.trim()) {
        try {
          const currentPosition = await getCurrentPosition();
          startPayload = {
            location: "Local atual do motorista",
            latitude: currentPosition.latitude,
            longitude: currentPosition.longitude,
          };
          toast.success("Rota será otimizada a partir da sua posição atual.");
        } catch {
          toast.warning(
            "Não foi possível obter sua posição atual. A rota será otimizada sem ponto de partida real."
          );
        }
      }

      setInvalidStopIndexes([]);
      const stopsWithSequence = validStops.map((stop, index) => ({
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        notes: buildStopNotes(undefined, stop.notes),
        sequence: index,
        sourceProvider: normalizeStopSourceProvider(stop.sourceProvider ?? "manual"),
        originalStop: stop.originalStop ?? null,
        isUnsequencedStop: Boolean(stop.isUnsequencedStop),
        metadata: buildStopMetadata(stop),
        geocodingConfidenceScore:
          stop.geocodingConfidenceScore ??
          getDefaultStopConfidence(stop).score,
        geocodingMethod:
          stop.geocodingMethod ??
          getDefaultStopConfidence(stop).method,
        geocodingSuspect:
          stop.geocodingSuspect ??
          getDefaultStopConfidence(stop).suspect,
      }));
      const result = await createAndOptimizeWithNetworkRetry({
        name,
        description,
        mode,
        startLocation: startPayload?.location,
        startLatitude: startPayload?.latitude,
        startLongitude: startPayload?.longitude,
        endLocation: endPayload?.location,
        endLatitude: endPayload?.latitude,
        endLongitude: endPayload?.longitude,
        stops: stopsWithSequence,
        respectInputSequence: respectImportedStopSequence,
      });

      const { route, optimization } = result;

      saveLastRouteProgress(route.id, route.name);
      setCreatedRouteId(route.id);
      setTotalDistance(optimization?.totalDistance ?? 0);
      setTotalDuration(optimization?.totalTime ?? 0);
      
      if (optimization) {
        toast.success("Rota criada e otimizada com sucesso!");
      } else {
        toast.warning(
          result.warning ||
            "Rota salva como rascunho. Abra a rota e tente otimizar novamente."
        );
      }
      navigate(`/routes/${route.id}`);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar rota");
    }
  };

  // Use state totalDistance instead of recalculating

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Criar Nova Rota</h1>
            <p className="mt-2 text-muted-foreground">Configure sua rota com endereços reais e deixe a IA otimizar</p>
          </div>
          <Button
            type="submit"
            form="create-route-form"
            disabled={isSavingRoute}
            className="gap-2 md:mt-1"
          >
            <Zap className="w-4 h-4" />
            {submitLabel}
          </Button>
        </div>

        <form id="create-route-form" onSubmit={handleSubmit} className="space-y-6 pb-24">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Nome da Rota *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Entrega Centro-Sul"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva a rota..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="mode">Modo de Otimização *</Label>
                <Select value={mode} onValueChange={(value: any) => setMode(value)}>
                  <SelectTrigger id="mode" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shortest_distance">Menor Distância</SelectItem>
                    <SelectItem value="shortest_time">Menor Tempo</SelectItem>
                    <SelectItem value="balanced">Balanceado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Início e Fim da Rota
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="mb-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleRoutePointCheckIn("start")}
                    disabled={isSavingRoute || isCheckingInStart}
                  >
                    <MapPin className="h-4 w-4" />
                    {isCheckingInStart ? "Marcando..." : "Meu local"}
                  </Button>
                </div>
                <AddressInputSimple
                  id="route-start-address"
                  label="Início da rota"
                  placeholder="Rua, número, bairro, cidade - UF"
                  value={startPoint.address}
                  latitude={startPoint.latitude}
                  longitude={startPoint.longitude}
                  onAddressChange={(address) =>
                    setStartPoint((current) => ({ ...current, address }))
                  }
                  onCoordinatesChange={(latitude, longitude) =>
                    setStartPoint((current) => ({ ...current, latitude, longitude }))
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
                    onClick={() => void handleRoutePointCheckIn("end")}
                    disabled={isSavingRoute || isCheckingInEnd}
                  >
                    <MapPin className="h-4 w-4" />
                    {isCheckingInEnd ? "Marcando..." : "Meu local"}
                  </Button>
                </div>
                <AddressInputSimple
                  id="route-end-address"
                  label="Fim da rota"
                  placeholder="Rua, número, bairro, cidade - UF"
                  value={endPoint.address}
                  latitude={endPoint.latitude}
                  longitude={endPoint.longitude}
                  onAddressChange={(address) =>
                    setEndPoint((current) => ({ ...current, address }))
                  }
                  onCoordinatesChange={(latitude, longitude) =>
                    setEndPoint((current) => ({ ...current, latitude, longitude }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Stops */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Paradas da Rota
              </CardTitle>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-xs font-medium",
                    stops.length > MAX_ROUTE_STOPS
                      ? "text-destructive"
                      : stops.length >= MAX_ROUTE_STOPS * 0.9
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  )}
                >
                  {stops.length}/{MAX_ROUTE_STOPS} paradas
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddStop}
                  disabled={stops.length >= MAX_ROUTE_STOPS}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Parada
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    {isListeningVoiceStops ? (
                      <MicOff className="mt-1 h-5 w-5 text-destructive" />
                    ) : (
                      <Mic className="mt-1 h-5 w-5 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">Inserir paradas por voz</p>
                      <p className="text-sm text-muted-foreground">
                        Fale uma entrega por vez. O app mostra sugestões, você escolhe o endereço correto e o microfone abre novamente.
                      </p>
                      {voiceTranscript && (
                        <div className="mt-2 space-y-2">
                          <Label htmlFor="voice-transcript-address" className="sr-only">
                            Endereço falado
                          </Label>
                          <Textarea
                            id="voice-transcript-address"
                            value={voiceTranscript}
                            onChange={(event) =>
                              handleVoiceTranscriptChange(event.target.value)
                            }
                            rows={2}
                            className="resize-none bg-muted text-sm"
                            placeholder="Edite o endereço falado antes de escolher a sugestão"
                          />
                          {pendingVoiceStopIndex !== null && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleSearchEditedVoiceAddress}
                                disabled={isLoadingVoiceSuggestions}
                              >
                                Buscar sugestões
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleStartVoiceStops(false)}
                              >
                                Gravar novamente
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {pendingVoiceStopIndex !== null && (
                        <div className="mt-2 space-y-2">
                          {isLoadingVoiceSuggestions && (
                            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                              Buscando sugestões para a Parada {pendingVoiceStopIndex + 1}...
                            </p>
                          )}

                          {!isLoadingVoiceSuggestions &&
                            voiceAddressSuggestions.length > 0 && (
                              <div className="overflow-hidden rounded-xl border border-primary/30 bg-white shadow-[0_14px_28px_rgb(15_23_42_/_10%)]">
                                {voiceAddressSuggestions.map((suggestion) => (
                                  <button
                                    key={suggestion.id}
                                    type="button"
                                    onClick={() =>
                                      handleSelectVoiceAddressSuggestion(
                                        suggestion,
                                        pendingVoiceStopIndex
                                      )
                                    }
                                    className="block w-full border-b border-border/60 px-3 py-3 text-left text-sm last:border-b-0 hover:bg-primary/10 focus:bg-primary/10 focus:outline-none"
                                  >
                                    <span className="block font-semibold text-foreground">
                                      {suggestion.label}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                      {suggestion.shortLabel}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                          {!isLoadingVoiceSuggestions &&
                            voiceAddressSuggestions.length === 0 && (
                              <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                                {voiceSuggestionError ||
                                  `Escolha uma sugestão na Parada ${pendingVoiceStopIndex + 1} para salvar e continuar.`}
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isListeningVoiceStops ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleStopVoiceStops}
                        className="gap-2"
                      >
                        <MicOff className="h-4 w-4" />
                        Parar voz
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => handleStartVoiceStops()}
                        className="gap-2"
                      >
                        <Mic className="h-4 w-4" />
                        Falar paradas
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed bg-muted/30 p-4">
                {SHOW_IMILE_API_CONNECTOR && (
                <div className="mb-4 rounded-lg border bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex gap-3">
                      <Truck className="mt-1 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Importar entregas Rider Delivery</p>
                        <p className="text-sm text-muted-foreground">
                          Busca entregas do app da iMile no conector do servidor e traz
                          endereço, rastreio, status e telefone para roteirização.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4 lg:w-[560px]">
                      <div className="space-y-1">
                        <Label htmlFor="imile-date-from">De</Label>
                        <Input
                          id="imile-date-from"
                          type="date"
                          value={imileDateFrom}
                          onChange={(event) => setImileDateFrom(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="imile-date-to">Até</Label>
                        <Input
                          id="imile-date-to"
                          type="date"
                          value={imileDateTo}
                          onChange={(event) => setImileDateTo(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="imile-status">Status</Label>
                        <Input
                          id="imile-status"
                          value={imileStatus}
                          onChange={(event) => setImileStatus(event.target.value)}
                          placeholder="ex: pending"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleImileImport}
                        disabled={isImportingImile}
                        className="gap-2 self-end"
                      >
                        <Truck className="h-4 w-4" />
                        {isImportingImile ? "Carregando..." : "Buscar"}
                      </Button>
                    </div>
                  </div>
                </div>
                )}

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex gap-3">
                    <FileSpreadsheet className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Importar tabela de rotas</p>
                      <p className="text-sm text-muted-foreground">
                        Aceita .xlsx, .xls ou .csv com colunas como Destination Address,
                        Bairro, City, Zipcode/Postal code, Latitude e Longitude.
                      </p>
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-2 md:w-72">
                    <Label htmlFor="route-import-source">Origem da tabela</Label>
                    <Select
                      value={importSourceProvider}
                      onValueChange={(value) =>
                        setImportSourceProvider(normalizeStopSourceProvider(value))
                      }
                    >
                      <SelectTrigger id="route-import-source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORT_SOURCE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label htmlFor="route-file-import" className="sr-only">
                      Importar planilha de rotas
                    </Label>
                    <Input
                      id="route-file-import"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={isImportingFile}
                      onChange={handleRouteFileImport}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4 border-t pt-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex gap-3">
                    <FileText className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Importar captura iMile</p>
                      <p className="text-sm text-muted-foreground">
                        {canUseAndroidImileCapture
                          ? "Abre o Rider Delivery no Android e captura os enderecos visiveis, sem computador."
                          : canRunImileScreenCapture
                            ? "Ferramenta tecnica para validar captura local do Rider Delivery."
                            : "Captura automatica sem computador disponivel no aplicativo Android."}
                      </p>
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-2 md:w-72">
                    {canUseAndroidImileCapture && (
                      <>
                        <Button
                          type="button"
                          onClick={handleOpenImileAccessibilitySettings}
                          variant="outline"
                          className="gap-2"
                        >
                          <Truck className="h-4 w-4" />
                          Ativar captura Android
                        </Button>
                        <Button
                          type="button"
                          onClick={handleStartAndroidImileCapture}
                          disabled={isRunningImileCapture}
                          className="gap-2"
                        >
                          <Truck className="h-4 w-4" />
                          {isRunningImileCapture ? "Capturando..." : "Abrir Rider e capturar"}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleImportAndroidImileCapture}
                          disabled={isImportingLatestImileCapture}
                          variant="outline"
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          Importar captura do Android
                        </Button>
                      </>
                    )}
                    {canRunImileScreenCapture && (
                      <>
                        <Button
                          type="button"
                          onClick={handleRunImileCaptureImport}
                          disabled={isRunningImileCapture}
                          className="gap-2"
                        >
                          <Truck className="h-4 w-4" />
                          {isRunningImileCapture ? "Capturando..." : "Capturar Rider agora"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLatestImileCaptureImport}
                          disabled={isImportingLatestImileCapture || isRunningImileCapture}
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          {isImportingLatestImileCapture ? "Carregando..." : "Usar ultima captura iMile"}
                        </Button>
                        <Label htmlFor="imile-capture-import" className="sr-only">
                          Importar captura iMile
                        </Label>
                        <Input
                          id="imile-capture-import"
                          type="file"
                          accept=".xml,.txt,.html"
                          disabled={isImportingImileCapture || isRunningImileCapture}
                          onChange={handleImileCaptureImport}
                        />
                      </>
                    )}
                    {!canUseAndroidImileCapture && !canRunImileScreenCapture && (
                      <Button type="button" disabled variant="outline" className="gap-2">
                        <Truck className="h-4 w-4" />
                        Use o aplicativo Android
                      </Button>
                    )}
                  </div>
                </div>

                {importSummary && (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Upload className="h-4 w-4" />
                        {importSummary.stops.length} paradas importadas
                      </span>
                      {importSummary.totalDeliveries !== undefined &&
                        importSummary.totalDeliveries !== importSummary.stops.length && (
                          <span>
                            {importSummary.totalDeliveries} entregas no total
                          </span>
                        )}
                      {(importSummary.groupedDeliveries ?? 0) > 0 && (
                        <span>
                          {importSummary.groupedDeliveries} entregas agrupadas
                        </span>
                      )}
                      {importSummary.skippedRows > 0 && (
                        <span>{importSummary.skippedRows} linhas ignoradas</span>
                      )}
                      {importSummary.missingCoordinateRows > 0 && (
                        <span>
                          {importSummary.missingCoordinateRows} sem coordenadas
                        </span>
                      )}
                    </div>

                    {importSummary.hasStopSequence && (
                      <div className="rounded-xl border border-border/70 bg-white p-3 text-sm">
                        <p className="font-medium text-foreground">
                          Como ordenar esta rota?
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          A coluna STOP so sera usada como sequencia se voce escolher
                          esta opcao. Na otimizacao, STOP fica apenas como informacao.
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            aria-pressed={respectImportedStopSequence}
                            onClick={() => setRespectImportedStopSequence(true)}
                            className={cn(
                              "rounded-lg border p-3 text-left transition",
                              respectImportedStopSequence
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-white text-muted-foreground hover:border-primary/50"
                            )}
                          >
                            <span className="block font-medium text-foreground">
                              Usar sequencia STOP
                            </span>
                            <span className="mt-1 block text-xs">
                              Mantem a ordem original da tabela pela coluna STOP.
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-pressed={!respectImportedStopSequence}
                            onClick={() => setRespectImportedStopSequence(false)}
                            className={cn(
                              "rounded-lg border p-3 text-left transition",
                              !respectImportedStopSequence
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-white text-muted-foreground hover:border-primary/50"
                            )}
                          >
                            <span className="block font-medium text-foreground">
                              Otimizar rota
                            </span>
                            <span className="mt-1 block text-xs">
                              Ignora STOP como ordem e recalcula a sequencia mais curta.
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {invalidStopIssues.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription className="space-y-3">
                    <div>
                      <p className="font-medium">
                        {invalidStopIssues.length} parada(s) precisam de revisão.
                      </p>
                      <p className="mt-1">
                        Corrija endereço, confirme uma sugestão confiável, digite
                        coordenadas manualmente ou remova paradas com problema.
                      </p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {invalidStopIssues.slice(0, 6).map((issue) => (
                        <p key={issue.index}>
                          {formatStopIssue(issue)}: {issue.address || "sem endereço"}
                        </p>
                      ))}
                      {invalidStopIssues.length > 6 && (
                        <p>Mais {invalidStopIssues.length - 6} parada(s) com problema.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleRelocateInvalidStops}
                        disabled={isResolvingCoordinates}
                      >
                        Tentar localizar novamente
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleFocusFirstInvalidStop}
                      >
                        Ir para primeira
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleRemoveInvalidStops}
                      >
                        Remover paradas com problema
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {stops.map((stop, index) => (
                <div
                  key={index}
                  id={`route-stop-${index}`}
                  className={cn(
                    "space-y-3 rounded-2xl border border-border/70 bg-white p-4",
                    pendingVoiceStopIndex === index &&
                      "border-primary bg-primary/5 ring-1 ring-primary/20",
                    invalidStopIndexes.includes(index) &&
                      "border-destructive bg-destructive/5"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-medium">Parada {index + 1}</span>
                      {stop.sourceRow && (
                        <p className="text-xs text-muted-foreground">
                          Linha {stop.sourceRow} da planilha
                        </p>
                      )}
                      {pendingVoiceStopIndex === index && (
                        <p className="text-xs font-medium text-primary">
                          Selecione uma sugestão para confirmar esta parada
                        </p>
                      )}
                    </div>
                    {stops.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveStop(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <AddressInputSimple
                    id={`address-${index}`}
                    label="Endereço completo"
                    placeholder="Rua, número, bairro, cidade - UF"
                    value={stop.address}
                    latitude={stop.latitude}
                    longitude={stop.longitude}
                    onAddressChange={(address) => handleAddressChange(index, address)}
                    onCoordinatesChange={(lat, lng) => handleCoordinatesChange(index, lat, lng)}
                    onGeocodingConfidenceChange={(score, method, suspect) =>
                      handleGeocodingConfidenceChange(index, score, method, suspect)
                    }
                  />
                  {hasValidCoordinates(stop) && (
                    <p className="text-xs text-muted-foreground">
                      Confiança do endereço: {stop.geocodingConfidenceScore ?? 0}/100
                      {stop.geocodingSuspect ? " · revisar antes de otimizar" : ""}
                    </p>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor={`package-number-${index}`}>Número do pacote</Label>
                    <Input
                      id={`package-number-${index}`}
                      value={stop.packageNumber ?? ""}
                      onChange={(event) =>
                        handlePackageNumberChange(index, event.target.value)
                      }
                      placeholder="Ex: 1, 2, 3 (pode repetir)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Identificador editável: pode repetir em paradas diferentes.
                    </p>
                  </div>
                  {stop.notes && (
                    <p className="text-sm text-muted-foreground">{stop.notes}</p>
                  )}
                  {(stop.deliveryCount ?? 1) > 1 && (
                    <p className="text-sm font-medium text-primary">
                      {stop.deliveryCount} entregas neste endereço
                    </p>
                  )}
                  {invalidStopIndexes.includes(index) && (
                    <p className="rounded-md border border-destructive/30 bg-background p-2 text-sm text-destructive">
                      Essa parada precisa de revisão de endereço/coordenada antes da
                      otimização.
                    </p>
                  )}
                </div>
              ))}

            </CardContent>
          </Card>

          {/* Route Metrics */}
          <RouteMetrics
            stops={stops}
            mode={mode}
            startPoint={startPoint}
            endPoint={endPoint}
          />

          {/* Route Map Visualization */}
          {stops.length >= 2 && (
            <RouteMap
              stops={stops}
              routeName={name || "Rota"}
              height="h-96"
              startPoint={startPoint}
              endPoint={endPoint}
            />
          )}

          {/* Route Share - Show after creation */}
          {createdRouteId && (
            <RouteShare
              routeId={createdRouteId}
              routeName={name}
              description={description}
              stops={stops}
              totalDistance={totalDistance}
              totalDuration={totalDuration}
              mode={mode}
            />
          )}

          {/* Actions */}
          <div className="z-20 flex flex-col gap-3 border border-border/70 bg-white/95 p-4 shadow-[0_-6px_16px_rgb(15_23_42_/_8%)] sm:flex-row md:sticky md:bottom-0 md:rounded-2xl">
            <Button
              type="submit"
              disabled={isSavingRoute}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              {submitLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/routes")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}


