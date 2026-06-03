import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Navigation } from "lucide-react";
import MapView from "@/components/MapView";
import {
  calculateDistanceKm,
  getCenterFromCoordinates,
  getResponsiveZoom,
  isValidCoordinate,
  type LatLngTuple,
} from "@/services/maps/locationService";
import { createMapMarker } from "@/services/maps/markerService";

interface Stop {
  address: string;
  latitude: number;
  longitude: number;
  packageNumber?: string;
  sequence?: number;
}

type RouteMapAuditIssue = {
  type: string;
  severity?: string;
  fromSequence?: number;
  toSequence?: number;
  nearestSequence?: number;
};

interface RouteMapProps {
  stops: Stop[];
  routeName?: string;
  height?: string;
  startPoint?: Stop;
  endPoint?: Stop;
  auditIssues?: RouteMapAuditIssue[];
}

const NORMAL_SEGMENT_COLOR = "#16a34a";
const TRANSITION_SEGMENT_COLOR = "#f59e0b";
const PROBLEM_SEGMENT_COLOR = "#dc2626";
const TRANSITION_DISTANCE_KM = 1.2;

function matchesIssueSegment(
  issue: RouteMapAuditIssue,
  fromSequence: number | undefined,
  toSequence: number | undefined
) {
  if (fromSequence === undefined && toSequence === undefined) return false;

  if (
    issue.fromSequence === fromSequence &&
    issue.toSequence === toSequence
  ) {
    return true;
  }

  return (
    issue.toSequence !== undefined &&
    toSequence !== undefined &&
    issue.toSequence === toSequence
  );
}

export default function RouteMap({
  stops,
  routeName = "Rota",
  height = "h-96",
  startPoint,
  endPoint,
  auditIssues = [],
}: RouteMapProps) {
  const validStops = useMemo(
    () =>
      stops
        .filter((stop) => stop.address.trim() && isValidCoordinate(stop))
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [stops]
  );
  const routePoints = useMemo(
    () => [
      ...(startPoint?.address.trim() && isValidCoordinate(startPoint)
        ? [startPoint]
        : []),
      ...validStops,
      ...(endPoint?.address.trim() && isValidCoordinate(endPoint) ? [endPoint] : []),
    ],
    [endPoint, startPoint, validStops]
  );
  const markers = useMemo(
    () => [
      ...(startPoint?.address.trim() && isValidCoordinate(startPoint)
        ? [
            createMapMarker(
              "route-start",
              startPoint,
              "Início da rota",
              startPoint.address,
              "start"
            ),
          ]
        : []),
      ...validStops.map((stop, index) =>
        createMapMarker(
          `route-stop-${index}`,
          stop,
          `Sequência ${index + 1} · Pacote ${(stop.packageNumber ?? "").trim() || String(index + 1)}`,
          stop.address,
          "stop"
        )
      ),
      ...(endPoint?.address.trim() && isValidCoordinate(endPoint)
        ? [
            createMapMarker(
              "route-end",
              endPoint,
              "Fim da rota",
              endPoint.address,
              "end"
            ),
          ]
        : []),
    ],
    [endPoint, startPoint, validStops]
  );
  const routePath = useMemo(() => markers.map((marker) => marker.position), [markers]);
  const routeSegments = useMemo(() => {
    const routeNodes = [
      ...(startPoint?.address.trim() && isValidCoordinate(startPoint)
        ? [{ point: startPoint, sequence: undefined as number | undefined }]
        : []),
      ...validStops.map((stop) => ({ point: stop, sequence: stop.sequence })),
      ...(endPoint?.address.trim() && isValidCoordinate(endPoint)
        ? [{ point: endPoint, sequence: undefined as number | undefined }]
        : []),
    ];

    return routeNodes.slice(0, -1).map((node, index) => {
      const next = routeNodes[index + 1];
      const hasProblem = auditIssues.some((issue) => {
        if (
          issue.type !== "region_revisited" &&
          issue.type !== "premature_region_exit" &&
          issue.type !== "route_crossing" &&
          issue.type !== "nearby_stop_skipped"
        ) {
          return false;
        }

        return matchesIssueSegment(issue, node.sequence, next.sequence);
      });
      const isTransition =
        calculateDistanceKm(node.point, next.point) >= TRANSITION_DISTANCE_KM;

      return {
        positions: [
          [node.point.latitude, node.point.longitude],
          [next.point.latitude, next.point.longitude],
        ] as LatLngTuple[],
        color: hasProblem
          ? PROBLEM_SEGMENT_COLOR
          : isTransition
          ? TRANSITION_SEGMENT_COLOR
          : NORMAL_SEGMENT_COLOR,
      };
    });
  }, [auditIssues, endPoint, startPoint, validStops]);
  const center = useMemo(() => getCenterFromCoordinates(routePoints), [routePoints]);
  const zoom = getResponsiveZoom(markers.length);
  const mapHeight = height === "h-96" ? "24rem" : height;

  if (validStops.length < 2) {
    return (
      <Card className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Preencha pelo menos 2 paradas com coordenadas para visualizar a rota no mapa
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 bg-white">
      <div className="border-b border-border/70 bg-gradient-to-r from-emerald-50 via-sky-50 to-teal-50 p-4">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{routeName}</h3>
          <span className="ml-auto text-sm text-muted-foreground">
            {validStops.length} parada{validStops.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <MapView
        center={center}
        zoom={zoom}
        markers={markers}
        routePath={routePath}
        routeSegments={routeSegments}
        height={mapHeight}
        darkMode={false}
      />

      <div className="border-t border-border/70 bg-secondary/45 p-4">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Região concluída</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Transição</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Revisita/cruzamento</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

