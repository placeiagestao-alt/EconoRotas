import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Flag,
  MapPin,
  Navigation,
  PackageCheck,
  Play,
  RotateCcw,
  Save,
  XCircle,
  Zap,
} from "lucide-react";
import AddressInputSimple from "@/components/AddressInputSimple";
import DashboardLayout from "@/components/DashboardLayout";
import RouteMap from "@/components/RouteMap";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { searchAddress } from "@/services/maps/geocodingService";
import { toast } from "sonner";

type DeliveryState = {
  started: boolean;
  currentIndex: number;
  delivered: number[];
  failed: number[];
};

type Stop = {
  id?: number;
  address: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type RoutePoint = {
  address: string;
  latitude: number;
  longitude: number;
};

const DEFAULT_DELIVERY_STATE: DeliveryState = {
  started: false,
  currentIndex: 0,
  delivered: [],
  failed: [],
};
const EMPTY_ROUTE_POINT: RoutePoint = { address: "", latitude: 0, longitude: 0 };

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getDeliveryStorageKey(routeId: number) {
  return `routing-pwa:route-delivery:${routeId}`;
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "optimized":
      return "Otimizada";
    case "completed":
      return "Concluida";
    case "cancelled":
      return "Cancelada";
    default:
      return "Rascunho";
  }
}

function buildMapsUrl(stop?: Stop) {
  if (!stop) return "#";

  if (stop.latitude && stop.longitude) {
    return `https://www.openstreetmap.org/?mlat=${stop.latitude}&mlon=${stop.longitude}#map=18/${stop.latitude}/${stop.longitude}`;
  }

  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(stop.address)}`;
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

export default function RouteDetail() {
  const params = useParams<{ id: string }>();
  const routeId = Number(params.id);
  const utils = trpc.useUtils();
  const routeQuery = trpc.routes.get.useQuery(
    { id: routeId },
    { enabled: Number.isFinite(routeId) }
  );
  const stopsQuery = trpc.stops.list.useQuery(
    { routeId },
    { enabled: Number.isFinite(routeId) }
  );
  const updateRouteMutation = trpc.routes.update.useMutation({
    onSuccess: () => {
      void utils.routes.get.invalidate({ id: routeId });
      void utils.routes.list.invalidate();
    },
  });
  const optimizeRouteMutation = trpc.routes.optimize.useMutation({
    onSuccess: async () => {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
      await Promise.all([
        utils.routes.get.invalidate({ id: routeId }),
        utils.routes.list.invalidate(),
        utils.stops.list.invalidate({ routeId }),
      ]);
      toast.success("Rota otimizada.");
    },
    onError: (error) => {
      toast.error(error.message || "Nao foi possivel otimizar a rota.");
    },
  });

  const stops = useMemo<Stop[]>(
    () =>
      (stopsQuery.data ?? [])
        .map((stop: any) => ({
          id: stop.id,
          address: stop.address,
          latitude: toNumber(stop.latitude),
          longitude: toNumber(stop.longitude),
          sequence: stop.sequence,
        }))
        .sort((a: Stop, b: Stop) => a.sequence - b.sequence),
    [stopsQuery.data]
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

    setLoadedDeliveryRouteId(null);
    const savedState = window.localStorage.getItem(getDeliveryStorageKey(routeId));
    if (!savedState) {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
      setLoadedDeliveryRouteId(routeId);
      return;
    }

    try {
      const parsed = JSON.parse(savedState) as DeliveryState;
      setDeliveryState({
        started: Boolean(parsed.started),
        currentIndex: Number.isFinite(parsed.currentIndex)
          ? parsed.currentIndex
          : 0,
        delivered: Array.isArray(parsed.delivered) ? parsed.delivered : [],
        failed: Array.isArray(parsed.failed) ? parsed.failed : [],
      });
    } catch {
      setDeliveryState(DEFAULT_DELIVERY_STATE);
    }

    setLoadedDeliveryRouteId(routeId);
  }, [routeId]);

  useEffect(() => {
    if (!Number.isFinite(routeId)) return;
    if (loadedDeliveryRouteId !== routeId) return;

    window.localStorage.setItem(
      getDeliveryStorageKey(routeId),
      JSON.stringify(deliveryState)
    );
  }, [deliveryState, loadedDeliveryRouteId, routeId]);

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
  const nextStop = stops.find(
    (_, index) => !deliveredSet.has(index) && !failedSet.has(index)
  );
  const progressValue = stops.length > 0 ? (handledCount / stops.length) * 100 : 0;

  const completeRoute = async () => {
    await updateRouteMutation.mutateAsync({
      id: routeId,
      status: "completed",
    });
    toast.success("Rota concluida.");
  };

  const handleStartRoute = () => {
    const firstPendingIndex = stops.findIndex(
      (_, index) => !deliveredSet.has(index) && !failedSet.has(index)
    );

    setDeliveryState((current) => ({
      ...current,
      started: true,
      currentIndex: firstPendingIndex >= 0 ? firstPendingIndex : 0,
    }));
  };

  const handleStopResult = async (result: "delivered" | "failed") => {
    if (!currentStop) return;

    const currentStopIndex = deliveryState.currentIndex;
    const delivered = Array.from(
      new Set([
        ...deliveryState.delivered.filter((index) => index !== currentStopIndex),
        ...(result === "delivered" ? [currentStopIndex] : []),
      ])
    ).sort((a, b) => a - b);
    const failed = Array.from(
      new Set([
        ...deliveryState.failed.filter((index) => index !== currentStopIndex),
        ...(result === "failed" ? [currentStopIndex] : []),
      ])
    ).sort((a, b) => a - b);
    const handled = new Set([...delivered, ...failed]);
    const nextIndex = stops.findIndex((_, index) => !handled.has(index));
    const finished = nextIndex === -1;

    setDeliveryState({
      started: !finished,
      currentIndex: finished ? stops.length - 1 : nextIndex,
      delivered,
      failed,
    });

    if (finished) {
      await completeRoute();
      return;
    }

    if (result === "delivered") {
      toast.success("Entrega registrada. Proxima parada aberta.");
      return;
    }

    toast.warning("Falha registrada. Proxima parada aberta.");
  };

  const handleDelivered = async () => {
    await handleStopResult("delivered");
  };

  const handleNotDelivered = async () => {
    await handleStopResult("failed");
  };

  const handleReset = () => {
    setDeliveryState(DEFAULT_DELIVERY_STATE);
    toast.message("Execucao da rota reiniciada.");
  };

  const handleOptimizeRoute = () => {
    if (stops.length < 2) {
      toast.error("Adicione pelo menos 2 paradas para otimizar.");
      return;
    }

    optimizeRouteMutation.mutate({
      id: routeId,
      mode: routeQuery.data?.mode ?? "balanced",
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
      throw new Error(`Confira o endereco e as coordenadas de ${label}.`);
    }

    return {
      location: address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    };
  };

  const handleSaveEndpoints = async () => {
    if (!routeQuery.data) return;

    setIsSavingEndpoints(true);

    try {
      const [resolvedStart, resolvedEnd] = await Promise.all([
        resolveRoutePoint(startPoint, "inicio"),
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
      toast.success("Inicio e fim da rota salvos.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar inicio e fim."
      );
    } finally {
      setIsSavingEndpoints(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link href="/routes">
              <Button variant="ghost" size="sm" className="gap-2 px-0">
                <ArrowLeft className="h-4 w-4" />
                Voltar para rotas
              </Button>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">
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
              disabled={stops.length < 2 || optimizeRouteMutation.isPending}
            >
              <Zap className="mr-2 h-4 w-4" />
              {optimizeRouteMutation.isPending ? "Otimizando..." : "Otimizar rota"}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reiniciar
            </Button>
            <Button
              type="button"
              onClick={handleStartRoute}
              disabled={stops.length === 0 || isComplete}
            >
              <Play className="mr-2 h-4 w-4" />
              Iniciar rota
            </Button>
          </div>
        </div>

        {routeQuery.isLoading || stopsQuery.isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">
            Carregando rota...
          </Card>
        ) : routeQuery.error || stopsQuery.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Nao foi possivel carregar essa rota.
            </AlertDescription>
          </Alert>
        ) : !routeQuery.data ? (
          <Alert>
            <AlertDescription>Rota nao encontrada.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-[1fr_340px]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Flag className="h-5 w-5" />
                      Inicio e fim da rota
                    </CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSaveEndpoints}
                      disabled={isSavingEndpoints || updateRouteMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingEndpoints ? "Salvando..." : "Salvar inicio/fim"}
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border bg-gray-50 p-4">
                      <AddressInputSimple
                        id="route-detail-start-address"
                        label="Inicio da rota"
                        placeholder="Rua, numero, bairro, cidade - UF"
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

                    <div className="rounded-lg border bg-gray-50 p-4">
                      <AddressInputSimple
                        id="route-detail-end-address"
                        label="Fim da rota"
                        placeholder="Rua, numero, bairro, cidade - UF"
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
                      Execucao da rota
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

                  {isComplete ? (
                    <div
                      className={[
                        "rounded-lg border p-5",
                        failedCount > 0
                          ? "border-amber-200 bg-amber-50"
                          : "border-green-200 bg-green-50",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "flex items-center gap-3",
                          failedCount > 0 ? "text-amber-900" : "text-green-800",
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
                              failedCount > 0 ? "text-amber-800" : "text-green-700",
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
                    <div className="rounded-lg border bg-background p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <Badge variant="secondary">
                          Parada {deliveryState.currentIndex + 1}
                        </Badge>
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
                          <Button asChild variant="outline" className="w-full gap-2">
                            <a href={buildMapsUrl(currentStop)} target="_self">
                              <Navigation className="h-4 w-4" />
                              Abrir no mapa
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-5">
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
                  {routeStartPoint && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs font-semibold uppercase text-green-700">
                        Inicio
                      </p>
                      <p className="text-sm text-green-900">{routeStartPoint.address}</p>
                    </div>
                  )}
                  {stops.map((stop, index) => {
                    const delivered = deliveredSet.has(index);
                    const failed = failedSet.has(index);
                    const active = deliveryState.started && index === deliveryState.currentIndex;

                    return (
                      <div key={stop.id ?? index}>
                        <div className="flex gap-3">
                          <div
                            className={[
                              "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                              delivered
                                ? "border-green-600 bg-green-600 text-white"
                                : failed
                                  ? "border-destructive bg-destructive text-destructive-foreground"
                                : active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "bg-background",
                            ].join(" ")}
                          >
                            {delivered ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : failed ? (
                              <XCircle className="h-4 w-4" />
                            ) : (
                              index + 1
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug">{stop.address}</p>
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
                        {index < stops.length - 1 && <Separator className="mt-3" />}
                      </div>
                    );
                  })}
                  {routeEndPoint && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-semibold uppercase text-red-700">
                        Fim
                      </p>
                      <p className="text-sm text-red-900">{routeEndPoint.address}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <RouteMap
              stops={stops}
              routeName={routeQuery.data.name}
              height="h-96"
              startPoint={hasValidCoordinates(startPoint) ? startPoint : routeStartPoint}
              endPoint={hasValidCoordinates(endPoint) ? endPoint : routeEndPoint}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
