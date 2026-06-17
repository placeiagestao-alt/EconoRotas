import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCommercialEtaAlert,
  classifyCommercialEvidence,
  detectCommercialAtLocation,
  evaluateOpeningHours,
} from "./commercialDetection";
import * as db from "./db";

vi.mock("./db", () => ({
  getLocationCommercialCache: vi.fn(),
  setLocationCommercialCache: vi.fn(),
}));

const latitude = -22.121;
const longitude = -51.401;

describe("commercial detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("confirms a registered pharmacy with opening hours", () => {
    const result = classifyCommercialEvidence(
      {
        elements: [
          {
            type: "node",
            id: 1,
            lat: latitude,
            lon: longitude,
            tags: {
              amenity: "pharmacy",
              name: "Farmacia Central",
              opening_hours: "Mo-Fr 08:00-18:00",
            },
          },
        ],
      },
      latitude,
      longitude
    );

    expect(result.commercialDetectionStatus).toBe("confirmed");
    expect(result.commercialConfidence).toBe(95);
    expect(result.commercialPlaceName).toBe("Farmacia Central");
    expect(result.commercialCategory).toBe("amenity:pharmacy");
  });

  it("confirms a registered bank with opening hours", () => {
    const result = classifyCommercialEvidence(
      {
        elements: [
          {
            type: "node",
            id: 2,
            lat: latitude,
            lon: longitude,
            tags: {
              amenity: "bank",
              name: "Banco Exemplo",
              opening_hours: "Mo-Fr 10:00-16:00",
            },
          },
        ],
      },
      latitude,
      longitude
    );

    expect(result.commercialDetectionStatus).toBe("confirmed");
    expect(result.commercialCategory).toBe("amenity:bank");
  });

  it("keeps a residential coordinate unknown when there is no OSM commercial evidence", () => {
    const result = classifyCommercialEvidence({ elements: [] }, latitude, longitude);

    expect(result.commercialDetectionStatus).toBe("unknown");
    expect(result.commercialConfidence).toBe(0);
    expect(result.commercialPlaceName).toBeNull();
  });

  it("marks a registered commercial object without opening hours as suspected", () => {
    const result = classifyCommercialEvidence(
      {
        elements: [
          {
            type: "node",
            id: 3,
            lat: latitude,
            lon: longitude,
            tags: {
              shop: "car_parts",
              name: "Auto Pecas Silva",
            },
          },
        ],
      },
      latitude,
      longitude
    );

    expect(result.commercialDetectionStatus).toBe("suspected");
    expect(result.commercialConfidence).toBe(70);
    expect(result.commercialCategory).toBe("shop:car_parts");
  });

  it("generates a red alert when ETA is after closing time", () => {
    const eta = new Date("2026-06-11T18:20:00-03:00");
    const alert = buildCommercialEtaAlert(
      {
        commercialDetectionStatus: "confirmed",
        commercialOpeningHours: "Mo-Fr 08:00-18:00",
        commercialPlaceName: "Auto Pecas Silva",
      },
      eta
    );

    expect(evaluateOpeningHours("Mo-Fr 08:00-18:00", eta)).toBe("closed");
    expect(alert.status).toBe("risk");
    expect(alert.severity).toBe("danger");
  });

  it("generates a green alert when ETA is inside opening hours", () => {
    const eta = new Date("2026-06-11T15:20:00-03:00");
    const alert = buildCommercialEtaAlert(
      {
        commercialDetectionStatus: "confirmed",
        commercialOpeningHours: "Mo-Fr 08:00-18:00",
        commercialPlaceName: "Auto Pecas Silva",
      },
      eta
    );

    expect(evaluateOpeningHours("Mo-Fr 08:00-18:00", eta)).toBe("open");
    expect(alert.status).toBe("compatible");
    expect(alert.severity).toBe("success");
  });

  it("uses cache without a second external Overpass request", async () => {
    vi.mocked(db.getLocationCommercialCache)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        lat: latitude,
        lng: longitude,
        radius: 20,
        response: {
          elements: [
            {
              type: "node",
              id: 4,
              lat: latitude,
              lon: longitude,
              tags: {
                amenity: "pharmacy",
                name: "Farmacia Cache",
                opening_hours: "Mo-Fr 08:00-18:00",
              },
            },
          ],
        },
        createdAt: new Date(),
      });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 4,
              lat: latitude,
              lon: longitude,
              tags: {
                amenity: "pharmacy",
                name: "Farmacia Cache",
                opening_hours: "Mo-Fr 08:00-18:00",
              },
            },
          ],
        }),
      })
    );

    await detectCommercialAtLocation(latitude, longitude);
    await detectCommercialAtLocation(latitude, longitude);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.setLocationCommercialCache).toHaveBeenCalledTimes(1);
  });
});
