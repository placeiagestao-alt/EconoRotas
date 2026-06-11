import { describe, expect, it } from "vitest";
import { buildNavigationUrl } from "./navigationPreference";

describe("buildNavigationUrl", () => {
  it("uses coordinates first when opening Google Maps to avoid POI ambiguity", () => {
    const url = buildNavigationUrl({
      address: "Avenida Brasil, 1520, Centro, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "google_maps",
    });

    expect(url).toContain("destination=-22.1207,-51.3889");
    expect(decodeURIComponent(url)).not.toContain("destination=Avenida Brasil");
  });

  it("uses coordinates first when opening Waze", () => {
    const url = buildNavigationUrl({
      address: "Avenida Brasil, 1520, Centro, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "waze",
    });

    expect(url).toContain("ll=-22.1207,-51.3889");
    expect(decodeURIComponent(url)).not.toContain("q=Avenida Brasil");
  });

  it("uses coordinates only when there is no address", () => {
    const url = buildNavigationUrl({
      address: " ",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "google_maps",
    });

    expect(url).toContain("destination=-22.1207,-51.3889");
  });
});
