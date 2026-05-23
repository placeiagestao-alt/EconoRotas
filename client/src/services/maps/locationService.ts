export type LatLngTuple = [number, number];

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export const BRAZIL_CENTER: LatLngTuple = [-14.235, -51.9253];
export const PRESIDENTE_PRUDENTE_CENTER: LatLngTuple = [-22.1207, -51.3889];

const EARTH_RADIUS_KM = 6371;

export function toLatLngTuple(coordinate: Coordinate): LatLngTuple {
  return [coordinate.latitude, coordinate.longitude];
}

export function isValidCoordinate(coordinate: Coordinate) {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180 &&
    coordinate.latitude !== 0 &&
    coordinate.longitude !== 0
  );
}

export function getResponsiveZoom(markerCount: number) {
  if (markerCount <= 1) {
    return 13;
  }

  if (markerCount <= 3) {
    return 11;
  }

  return 5;
}

export function getCenterFromCoordinates(coordinates: Coordinate[]): LatLngTuple {
  const validCoordinates = coordinates.filter(isValidCoordinate);

  if (validCoordinates.length === 0) {
    return BRAZIL_CENTER;
  }

  const totals = validCoordinates.reduce(
    (acc, coordinate) => ({
      latitude: acc.latitude + coordinate.latitude,
      longitude: acc.longitude + coordinate.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );

  return [
    totals.latitude / validCoordinates.length,
    totals.longitude / validCoordinates.length,
  ];
}

export function calculateDistanceKm(origin: Coordinate, destination: Coordinate) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDistance = toRadians(destination.latitude - origin.latitude);
  const longitudeDistance = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);

  const haversine =
    Math.sin(latitudeDistance / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDistance / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function getCurrentPosition(): Promise<Coordinate> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Geolocalização não suportada pelo navegador."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => reject(new Error("Não foi possível obter sua localização atual.")),
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      }
    );
  });
}
