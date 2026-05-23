import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Coordinate, LatLngTuple } from "./locationService";
import { isValidCoordinate } from "./locationService";

export type MapMarker = {
  id: string;
  position: LatLngTuple;
  title: string;
  description?: string;
  type?: "start" | "stop" | "end" | "user" | "vehicle";
};

export type RouteStop = Coordinate & {
  address: string;
  sequence?: number;
};

export function configureLeafletDefaultIcons() {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
}

export function createMapMarker(
  id: string,
  coordinate: Coordinate,
  title: string,
  description?: string,
  type: MapMarker["type"] = "stop"
): MapMarker {
  return {
    id,
    position: [coordinate.latitude, coordinate.longitude],
    title,
    description,
    type,
  };
}

export function createMarkersFromStops(stops: RouteStop[]) {
  const validStops = stops
    .filter(isValidCoordinate)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  return validStops.map((stop, index) => {
    const isStart = index === 0;
    const isEnd = index === validStops.length - 1;

    return createMapMarker(
      String(index),
      stop,
      `Parada ${index + 1}`,
      stop.address,
      isStart ? "start" : isEnd ? "end" : "stop"
    );
  });
}

export function getMarkerClassName(type: MapMarker["type"]) {
  switch (type) {
    case "start":
      return "route-marker route-marker--start";
    case "end":
      return "route-marker route-marker--end";
    case "vehicle":
      return "route-marker route-marker--vehicle";
    case "user":
      return "route-marker route-marker--user";
    default:
      return "route-marker";
  }
}
