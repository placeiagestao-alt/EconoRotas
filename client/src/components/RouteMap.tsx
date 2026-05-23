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
              "Inicio da rota",
              startPoint.address,
              "start"
            ),
          ]
        : []),
      ...validStops.map((stop, index) =>
        createMapMarker(
          `route-stop-${index}`,
          stop,
          `Parada ${index + 1}`,
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
    <Card className="overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">{routeName}</h3>
          <span className="text-sm text-gray-600 ml-auto">
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
      />

      <div className="p-4 bg-gray-50 border-t">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500" />
            <span className="text-gray-700">Início</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500" />
            <span className="text-gray-700">Intermediária</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-gray-700">Fim</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
