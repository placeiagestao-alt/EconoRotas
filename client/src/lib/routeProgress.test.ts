import { describe, expect, it } from "vitest";
import { getFirstPendingStopIndex } from "./routeProgress";

describe("getFirstPendingStopIndex", () => {
  it("advances to the next untreated stop", () => {
    expect(getFirstPendingStopIndex(5, [0, 1], [])).toBe(2);
  });

  it("skips delivered and failed stops", () => {
    expect(getFirstPendingStopIndex(5, [0, 2], [1, 3])).toBe(4);
  });

  it("keeps the saved route order after an out-of-order result", () => {
    expect(getFirstPendingStopIndex(5, [3], [])).toBe(0);
  });

  it("returns -1 when the route is complete", () => {
    expect(getFirstPendingStopIndex(3, [0, 2], [1])).toBe(-1);
  });
});
