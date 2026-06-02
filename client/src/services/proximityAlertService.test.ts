import { describe, expect, it } from "vitest";
import { findNearbyPendingStop } from "./proximityAlertService";

const origin = { latitude: -22.120000, longitude: -51.400000 };
const now = 1_000_000;
const radiusMeters = 20;
const repeatIntervalMs = 120_000;

function stop(latitudeOffset: number, longitudeOffset = 0) {
  return {
    latitude: origin.latitude + latitudeOffset,
    longitude: origin.longitude + longitudeOffset,
  };
}

describe("findNearbyPendingStop", () => {
  it("alerts the closest pending stop inside the configured radius", () => {
    const nearby = findNearbyPendingStop({
      origin,
      stops: [stop(0), stop(0.00025), stop(0.00008), stop(0.001)],
      currentIndex: 0,
      deliveredIndexes: [],
      failedIndexes: [],
      lastAlertedAtByIndex: {},
      now,
      radiusMeters,
      repeatIntervalMs,
    });

    expect(nearby?.stopIndex).toBe(2);
    expect(nearby?.distanceMeters).toBeGreaterThan(0);
    expect(nearby?.distanceMeters).toBeLessThan(radiusMeters);
  });

  it("does not alert the current destination even when the driver is on top of it", () => {
    const nearby = findNearbyPendingStop({
      origin,
      stops: [stop(0), stop(0.00008)],
      currentIndex: 0,
      deliveredIndexes: [],
      failedIndexes: [],
      lastAlertedAtByIndex: {},
      now,
      radiusMeters,
      repeatIntervalMs,
    });

    expect(nearby?.stopIndex).toBe(1);
  });

  it("ignores delivered, failed, invalid and far stops", () => {
    const nearby = findNearbyPendingStop({
      origin,
      stops: [
        stop(0),
        stop(0.00008),
        stop(0.00009),
        { latitude: 0, longitude: 0 },
        stop(0.002),
      ],
      currentIndex: 0,
      deliveredIndexes: [1],
      failedIndexes: [2],
      lastAlertedAtByIndex: {},
      now,
      radiusMeters,
      repeatIntervalMs,
    });

    expect(nearby).toBeNull();
  });

  it("respects cooldown per stop but still alerts another nearby stop", () => {
    const nearby = findNearbyPendingStop({
      origin,
      stops: [stop(0), stop(0.00005), stop(0.00009)],
      currentIndex: 0,
      deliveredIndexes: [],
      failedIndexes: [],
      lastAlertedAtByIndex: {
        1: now - 30_000,
      },
      now,
      radiusMeters,
      repeatIntervalMs,
    });

    expect(nearby?.stopIndex).toBe(2);
  });

  it("allows a repeated alert after the cooldown window", () => {
    const nearby = findNearbyPendingStop({
      origin,
      stops: [stop(0), stop(0.00005)],
      currentIndex: 0,
      deliveredIndexes: [],
      failedIndexes: [],
      lastAlertedAtByIndex: {
        1: now - repeatIntervalMs - 1,
      },
      now,
      radiusMeters,
      repeatIntervalMs,
    });

    expect(nearby?.stopIndex).toBe(1);
  });
});
