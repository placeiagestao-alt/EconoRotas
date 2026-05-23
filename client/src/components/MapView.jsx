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
const OPEN_STREET_MAP_ATTRIBUTION = "&copy; OpenStreetMap contributors";

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
          attribution={OPEN_STREET_MAP_ATTRIBUTION}
          url={OPEN_STREET_MAP_TILE_URL}
          updateWhenIdle
          keepBuffer={4}
        />

        <MapViewport markers={mapMarkers} center={effectiveCenter} zoom={effectiveZoom} />

        {mapMarkers.map((marker) => (
          <Marker key={marker.id} position={marker.position}>
            <Popup>
              <strong>{marker.title}</strong>
              {marker.description ? <p>{marker.description}</p> : null}
            </Popup>
          </Marker>
        ))}

        {routePath.length > 1 ? (
          <Polyline
            positions={routePath}
            pathOptions={{ color: "#2563eb", opacity: 0.82, weight: 4 }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}

export default memo(MapView);
