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
        ? [{ ...startPoint, address: `Início: ${startPoint.address}` }]
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
      <Card className="border-emerald-300/60 bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 text-white">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-emerald-100">
              <MapPin className="h-4 w-4 text-white" />
              <span>Distância Estimada</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {stats.totalDistance.toFixed(2)} km
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-emerald-100">
              <Clock className="h-4 w-4 text-white" />
              <span>Tempo Estimado</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {formatDuration(stats.totalDuration)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-emerald-100">
              <Zap className="h-4 w-4 text-white" />
              <span>Modo</span>
            </div>
            <div className="text-sm font-semibold text-white">
              {getModeLabel()}
            </div>
          </div>
        </div>
      </Card>

      {stats.segments.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold text-foreground">Detalhes por Segmento</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.segments.map((segment, index) => (
              <div
                key={`${segment.from}-${segment.to}`}
                className="space-y-2 rounded-xl border border-border/75 bg-secondary/55 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {index + 1}. {segment.from}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">↓</div>
                    <div className="truncate text-sm font-medium text-foreground">
                      {segment.to}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-primary">
                      {segment.distance.toFixed(2)} km
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDuration(segment.duration)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="rounded-xl border border-accent/35 bg-accent/10 p-3 text-sm text-foreground">
        <p className="font-medium mb-1">Dica:</p>
        <p>
          As métricas atuais usam distância geográfica estimada. A arquitetura já está preparada
          para receber motor de rotas OpenStreetMap/OSRM sem depender de provedor proprietário.
        </p>
      </div>
    </div>
  );
}

