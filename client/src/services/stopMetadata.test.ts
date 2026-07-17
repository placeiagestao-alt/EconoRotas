import { describe, expect, it } from "vitest";
import { getStopPackageNumbers, normalizeStopMetadata } from "@shared/stopMetadata";

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
});
