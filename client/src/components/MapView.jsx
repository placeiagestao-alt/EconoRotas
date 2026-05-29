import { memo, useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  BRAZIL_CENTER,
  PRESIDENTE_PRUDENTE_CENTER,
  getResponsiveZoom,
} from "@/services/maps/locationService";
import { configureLeafletDefaultIcons } from "@/services/maps/markerService";

const OPEN_STREET_MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const OPEN_STREET_MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DARK_TILE_ATTRIBUTION =
  '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

configureLeafletDefaultIcons();

function MapViewport({ markers, center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length > 1) {
      const bounds = markers.map((marker) => marker.position);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
      return;
    }

    map.setView(center, zoom);
  }, [center, map, markers, zoom]);

  return null;
}

function MapSizeSync({ height }) {
  const map = useMap();

  useEffect(() => {
    const refresh = () => map.invalidateSize({ pan: false, debounceMoveend: true });

    const timer = window.setTimeout(refresh, 120);
    window.addEventListener("resize", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [map, height]);

  return null;
}

function MapView({
  center = PRESIDENTE_PRUDENTE_CENTER,
  zoom,
  markers,
  routePath = [],
  height = "100vh",
  className = "",
  darkMode = false,
}) {
  const mapMarkers = useMemo(
    () =>
      markers?.length
        ? markers
        : [
            {
              id: "presidente-prudente",
              position: PRESIDENTE_PRUDENTE_CENTER,
              title: "Presidente Prudente",
            },
          ],
    [markers]
  );
  const effectiveCenter = center || BRAZIL_CENTER;
  const effectiveZoom = zoom ?? getResponsiveZoom(mapMarkers.length);

  return (
    <div
      className={`leaflet-map-shell ${darkMode ? "leaflet-map-shell--dark" : ""} ${className}`}
      style={{ height, width: "100%" }}
    >
      <MapContainer
        center={effectiveCenter}
        zoom={effectiveZoom}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution={darkMode ? DARK_TILE_ATTRIBUTION : OPEN_STREET_MAP_ATTRIBUTION}
          url={darkMode ? DARK_TILE_URL : OPEN_STREET_MAP_TILE_URL}
          updateWhenIdle
          keepBuffer={4}
        />

        <MapViewport markers={mapMarkers} center={effectiveCenter} zoom={effectiveZoom} />
        <MapSizeSync height={height} />

        {mapMarkers.map((marker) => (
          <Marker key={marker.id} position={marker.position}>
            <Popup>
              <strong>{marker.title}</strong>
              {marker.description ? <p>{marker.description}</p> : null}
            </Popup>
          </Marker>
        ))}

        {routePath.length > 1 ? (
          <>
            <Polyline
              positions={routePath}
              pathOptions={{ color: "#34d399", opacity: 0.2, weight: 9 }}
            />
            <Polyline
              positions={routePath}
              pathOptions={{ color: "#2563eb", opacity: 0.92, weight: 4 }}
            />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}

export default memo(MapView);
