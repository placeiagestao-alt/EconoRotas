import { describe, expect, it } from "vitest";
import { buildRouteStopMarkerTitle } from "./routeStopMarkerTitle";

describe("buildRouteStopMarkerTitle", () => {
  it("does not invent a package number when the package is missing", () => {
    expect(buildRouteStopMarkerTitle({}, 0)).toBe("Parada 1");
  });

  it("keeps route position, Shopee STOP and package as separate identities", () => {
    expect(
      buildRouteStopMarkerTitle(
        {
          sourceProvider: "shopee",
          originalStop: 18,
          packageNumber: "BR123",
        },
        4
      )
    ).toBe("Parada 5 | STOP 18 | Pacote BR123");
  });

  it("identifies an unsequenced Shopee delivery without creating a package", () => {
    expect(
      buildRouteStopMarkerTitle(
        {
          sourceProvider: "shopee",
          originalStop: 0,
          isUnsequencedStop: true,
        },
        1
      )
    ).toBe("Parada 2 | Sem STOP");
  });

  it("keeps every package identity for a grouped delivery address", () => {
    expect(
      buildRouteStopMarkerTitle(
        {
          sourceProvider: "shopee",
          originalStop: 9,
          metadata: {
            packageNumbers: ["BR001", "BR002"],
            groupedDeliveryCount: 2,
          },
        },
        2
      )
    ).toBe("Parada 3 | STOP 9 | Pacotes BR001, BR002");
  });
});
