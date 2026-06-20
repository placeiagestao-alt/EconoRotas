export const NAVIGATION_PROVIDER_KEY = "econorotas:navigation-provider";
export const NAVIGATION_PROVIDER_CHANGED =
  "econorotas:navigation-provider-changed";

export type NavigationProvider = "google_maps" | "waze";

export const NAVIGATION_PROVIDERS: Array<{
  value: NavigationProvider;
  label: string;
}> = [
  { value: "google_maps", label: "Google Maps" },
  { value: "waze", label: "Waze" },
];

export function isNavigationProvider(
  value: unknown
): value is NavigationProvider {
  return value === "google_maps" || value === "waze";
}

export function getNavigationProvider(): NavigationProvider {
  if (typeof window === "undefined") return "google_maps";

  const saved = window.localStorage.getItem(NAVIGATION_PROVIDER_KEY);
  return isNavigationProvider(saved) ? saved : "google_maps";
}

export function setNavigationProvider(provider: NavigationProvider) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(NAVIGATION_PROVIDER_KEY, provider);
  window.dispatchEvent(
    new CustomEvent<NavigationProvider>(NAVIGATION_PROVIDER_CHANGED, {
      detail: provider,
    })
  );
}

const BRAZIL_ZIP_CODE_PATTERN = /\b\d{5}-?\d{3}\b/g;

export function hasHouseNumber(address: string) {
  const cleanAddress = address
    .replace(BRAZIL_ZIP_CODE_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /(?:^|[\s,])\d{1,6}[a-zA-Z]?(?:\s*(?:\/|-)\s*\d{1,6}[a-zA-Z]?)?(?=$|[\s,.-])/.test(
    cleanAddress
  );
}

export function buildNavigationUrl({
  address,
  latitude,
  longitude,
  provider = getNavigationProvider(),
}: {
  address: string;
  latitude?: number;
  longitude?: number;
  provider?: NavigationProvider;
}) {
  const cleanAddress = address.trim();
  const hasCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude !== 0 &&
    longitude !== 0;
  const shouldUseAddress =
    cleanAddress.length > 0 && hasHouseNumber(cleanAddress);

  if (provider === "waze") {
    if (shouldUseAddress) {
      return `https://waze.com/ul?q=${encodeURIComponent(cleanAddress)}&navigate=yes`;
    }

    if (hasCoordinates) {
      return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
    }

    if (cleanAddress) {
      return `https://waze.com/ul?q=${encodeURIComponent(cleanAddress)}&navigate=yes`;
    }
  }

  const destination = shouldUseAddress
    ? encodeURIComponent(cleanAddress)
    : hasCoordinates
      ? `${latitude},${longitude}`
      : encodeURIComponent(cleanAddress);

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
