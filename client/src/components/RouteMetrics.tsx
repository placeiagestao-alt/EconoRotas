import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Clock, MapPin, Zap } from "lucide-react";
import { calculateDistanceKm, isValidCoordinate } from "@/services/maps/locationService";

interface Stop {
  address: string;
  latitude: number;
  longitude: number;
}

interface RouteMetricsProps {
  stops: Stop[];
  mode: "shortest_distance" | "shortest_time" | "balanced";
  startPoint?: Stop;
  endPoint?: Stop;
}

interface RouteStats {
  totalDistance: number;
  totalDuration: number;
  segments: Array<{
    from: string;
    to: string;
    distance: number;
    duration: number;
  }>;
}

const AVERAGE_SPEED_KMH_BY_MODE = {
  shortest_distance: 38,
  shortest_time: 52,
  balanced: 45,
};

export default function RouteMetrics({
  stops,
  mode,
  startPoint,
  endPoint,
}: RouteMetricsProps) {
  const validStops = useMemo(
    () => stops.filter((stop) => stop.address.trim() && isValidCoordinate(stop)),
    [stops]
  );
  const routePoints = useMemo(
    () => [
      ...(startPoint?.address.trim() && isValidCoordinate(startPoint)
        ? [{ ...startPoint, address: `Inicio: ${startPoint.address}` }]
        : []),
      ...validStops,
      ...(endPoint?.address.trim() && isValidCoordinate(endPoint)
        ? [{ ...endPoint, address: `Fim: ${endPoint.address}` }]
        : []),
    ],
    [endPoint, startPoint, validStops]
  );

  const stats = useMemo<RouteStats | null>(() => {
    if (routePoints.length < 2) {
      return null;
    }

    const averageSpeedKmh = AVERAGE_SPEED_KMH_BY_MODE[mode];
    const segments = routePoints.slice(0, -1).map((stop, index) => {
      const nextStop = routePoints[index + 1];
      const distance = calculateDistanceKm(stop, nextStop);
      const duration = Math.round((distance / averageSpeedKmh) * 3600);

      return {
        from: stop.address,
        to: nextStop.address,
        distance,
        duration,
      };
    });

    return {
      totalDistance: segments.reduce((total, segment) => total + segment.distance, 0),
      totalDuration: segments.reduce((total, segment) => total + segment.duration, 0),
      segments,
    };
  }, [mode, routePoints]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.max(1, Math.floor((seconds % 3600) / 60));

    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  };

  const getModeLabel = (): string => {
    switch (mode) {
      case "shortest_distance":
        return "Otimizado por Distância";
      case "shortest_time":
        return "Otimizado por Tempo";
      case "balanced":
        return "Balanceado";
      default:
        return "Padrão";
    }
  };

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Distância Estimada</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {stats.totalDistance.toFixed(2)} km
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>Tempo Estimado</span>
            </div>
            <div className="text-2xl font-bold text-indigo-900">
              {formatDuration(stats.totalDuration)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Zap className="w-4 h-4 text-amber-600" />
              <span>Modo</span>
            </div>
            <div className="text-sm font-semibold text-amber-900">
              {getModeLabel()}
            </div>
          </div>
        </div>
      </Card>

      {stats.segments.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Detalhes por Segmento</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.segments.map((segment, index) => (
              <div
                key={`${segment.from}-${segment.to}`}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {index + 1}. {segment.from}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">↓</div>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {segment.to}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-blue-600">
                      {segment.distance.toFixed(2)} km
                    </div>
                    <div className="text-xs text-gray-600">
                      {formatDuration(segment.duration)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-900">
        <p className="font-medium mb-1">Dica:</p>
        <p>
          As métricas atuais usam distância geográfica estimada. A arquitetura já está preparada
          para receber motor de rotas OpenStreetMap/OSRM sem depender de provedor proprietário.
        </p>
      </div>
    </div>
  );
}

