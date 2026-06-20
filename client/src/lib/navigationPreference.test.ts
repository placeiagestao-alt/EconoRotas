import { describe, expect, it } from "vitest";
import { buildNavigationUrl, hasHouseNumber } from "./navigationPreference";

describe("buildNavigationUrl", () => {
  it("uses the full address in Google Maps when it has a house number", () => {
    const url = buildNavigationUrl({
      address: "Avenida Brasil, 1520, Centro, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "google_maps",
    });

    const decoded = decodeURIComponent(url);
    expect(decoded).toContain(
      "destination=Avenida Brasil, 1520, Centro, Presidente Prudente - SP"
    );
    expect(decoded).not.toContain("destination=-22.1207,-51.3889");
    expect(decoded).toContain("1520");
  });

  it("uses the full address in Waze when it has a house number", () => {
    const url = buildNavigationUrl({
      address: "Avenida Brasil, 1520, Centro, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "waze",
    });

    const decoded = decodeURIComponent(url);
    expect(decoded).toContain(
      "q=Avenida Brasil, 1520, Centro, Presidente Prudente - SP"
    );
    expect(decoded).not.toContain("ll=-22.1207,-51.3889");
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

  it("uses coordinates when the address has no house number", () => {
    const url = buildNavigationUrl({
      address:
        "Rua Angelo Menegueso, Parque Sao Judas Tadeu, Presidente Prudente - SP",
      latitude: -22.1207,
      longitude: -51.3889,
      provider: "google_maps",
    });

    expect(url).toContain("destination=-22.1207,-51.3889");
  });
});

describe("hasHouseNumber", () => {
  it("detects regular house numbers", () => {
    expect(
      hasHouseNumber("Rua Angelo Menegueso, 338, Parque Sao Judas Tadeu")
    ).toBe(true);
    expect(hasHouseNumber("Avenida Brasil, 1520, Centro")).toBe(true);
  });

  it("does not treat Brazilian zip code as a house number", () => {
    expect(
      hasHouseNumber(
        "Rua Angelo Menegueso, Parque Sao Judas Tadeu, Presidente Prudente - SP, 19026-040"
      )
    ).toBe(false);
  });
});
