import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Navigation } from "lucide-react";
import MapView from "@/components/MapView";
import {
  getCenterFromCoordinates,
  getResponsiveZoom,
  isValidCoordinate,
} from "@/services/maps/locationService";
import { createMapMarker } from "@/services/maps/markerService";

interface Stop {
  address: string;
  latitude: number;
  longitude: number;
  packageNumber?: string;
  sequence?: number;
}

interface RouteMapProps {
  stops: Stop[];
  routeName?: string;
  height?: string;
  startPoint?: Stop;
  endPoint?: Stop;
}

export default function RouteMap({
  stops,
  routeName = "Rota",
  height = "h-96",
  startPoint,
  endPoint,
}: RouteMapProps) {
  const validStops = useMemo(
    () => stops.filter((stop) => stop.address.trim() && isValidCoordinate(stop)),
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
          `Pacote ${(stop.packageNumber ?? "").trim() || String(index + 1)}`,
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
        height={mapHeight}
        darkMode={false}
      />

      <div className="border-t border-border/70 bg-secondary/45 p-4">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Início</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Intermedi\u00e1ria</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Fim</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

