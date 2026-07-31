import { describe, expect, it } from "vitest";
import {
  getStopPackageNumbers,
  mergeStopMetadata,
  normalizeStopMetadata,
  parseLegacyStopNotes,
} from "@shared/stopMetadata";

describe("stop metadata", () => {
  it("recovers package identities from serialized database JSON", () => {
    const metadata = normalizeStopMetadata(
      JSON.stringify({
        packageNumber: "BR-PKG-001",
        packageNumbers: ["BR-PKG-001", "BR-PKG-002"],
        trackingNumber: "BR-PKG-001",
      })
    );

    expect(getStopPackageNumbers(metadata)).toEqual([
      "BR-PKG-001",
      "BR-PKG-002",
    ]);
  });

  it("treats malformed serialized metadata as empty instead of throwing", () => {
    expect(normalizeStopMetadata("{invalid-json")).toEqual({});
  });

  it("preserves address variants and conflict evidence", () => {
    const metadata = normalizeStopMetadata({
      sourceAddressVariants: ["Rua A, 10", "Rua B, 20", "rua a, 10"],
      sourceAddressConflict: true,
    });

    expect(metadata).toEqual({
      sourceAddressVariants: ["Rua A, 10", "Rua B, 20"],
      sourceAddressConflict: true,
    });
  });

  it("merges address evidence without losing a detected conflict", () => {
    const metadata = mergeStopMetadata(
      { sourceAddressVariants: ["Rua A, 10"] },
      {
        sourceAddressVariants: ["Rua B, 20"],
        sourceAddressConflict: true,
      }
    );

    expect(metadata.sourceAddressVariants).toEqual(["Rua A, 10", "Rua B, 20"]);
    expect(metadata.sourceAddressConflict).toBe(true);
  });

  it("preserves every package when legacy notes contain a visual +N summary", () => {
    const packageNumbers = Array.from(
      { length: 10 },
      (_, index) => `BR-PKG-${String(index + 1).padStart(3, "0")}`
    );
    const legacy = parseLegacyStopNotes(
      `10x entregas neste endereco | Pacotes: ${packageNumbers
        .slice(0, 8)
        .join(", ")} +2`
    );
    const metadata = mergeStopMetadata(
      {
        packageNumber: packageNumbers[0],
        packageNumbers,
      },
      legacy.metadata
    );

    expect(legacy.metadata.packageNumbers).not.toContain("+2");
    expect(metadata.packageNumbers).toEqual(packageNumbers);
  });
});
