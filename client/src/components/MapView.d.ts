import type { ReactElement } from "react";
import type { MapMarker } from "@/services/maps/markerService";
import type { LatLngTuple } from "@/services/maps/locationService";

export type MapViewProps = {
  center?: LatLngTuple;
  zoom?: number;
  markers?: MapMarker[];
  routePath?: LatLngTuple[];
  height?: string;
  className?: string;
  darkMode?: boolean;
};

export default function MapView(props: MapViewProps): ReactElement;
