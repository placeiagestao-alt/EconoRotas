import { describe, expect, it } from "vitest";
import { buildNavigationUrl } from "./navigationPreference";

describe("buildNavigationUrl", () => {
  it("keeps the full street number when opening Google Maps", () => {
    const url = buildNavigationUrl({
      address: "Avenida Brasil, 1520, Centro, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "google_maps",
    });

    expect(decodeURIComponent(url)).toContain(
      "destination=Avenida Brasil, 1520, Centro, Presidente Prudente - SP"
    );
    expect(url).not.toContain("-22.1207,-51.3889");
  });

  it("keeps the full street number when opening Waze", () => {
    const url = buildNavigationUrl({
      address: "Avenida Brasil, 1520, Centro, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "waze",
    });

    expect(decodeURIComponent(url)).toContain(
      "q=Avenida Brasil, 1520, Centro, Presidente Prudente - SP"
    );
    expect(url).not.toContain("ll=-22.1207,-51.3889");
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
