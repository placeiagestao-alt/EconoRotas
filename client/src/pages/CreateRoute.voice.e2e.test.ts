import { describe, expect, it } from "vitest";
import {
  applyEditedVoiceStop,
  applyFinalVoiceStop,
  type VoiceRouteStop,
} from "./createRouteVoiceStops";

function buildBackendStopsPayload(stops: VoiceRouteStop[]) {
  return stops
    .filter((stop) => stop.address.trim())
    .map((stop, sequence) => ({
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      notes: stop.notes,
      sequence,
    }));
}

describe("CreateRoute voice stop flow", () => {
  it("persists a finalized voice transcript into the backend stops payload", () => {
    const state = applyFinalVoiceStop<VoiceRouteStop>(
      [],
      "Rua das Flores 123",
      null
    );
    const backendStops = buildBackendStopsPayload(state.stops);

    expect(state.stops).toHaveLength(1);
    expect(state.stops[0]?.address).toBe("Rua das Flores 123");
    expect(backendStops).toHaveLength(1);
    expect(backendStops[0]?.address).toBe("Rua das Flores 123");
  });

  it("persists the edited voice transcript instead of the original text", () => {
    const firstState = applyFinalVoiceStop<VoiceRouteStop>(
      [],
      "Rua das Flores 123",
      null
    );
    const editedState = applyEditedVoiceStop<VoiceRouteStop>(
      firstState.stops,
      "Rua das Flores 321",
      firstState.pendingVoiceStopIndex
    );
    const backendStops = buildBackendStopsPayload(editedState.stops);

    expect(editedState.stops).toHaveLength(1);
    expect(editedState.stops[0]?.address).toBe("Rua das Flores 321");
    expect(backendStops).toHaveLength(1);
    expect(backendStops[0]?.address).toBe("Rua das Flores 321");
  });

  it("persists multiple finalized voice transcripts as multiple stops", () => {
    let stops: VoiceRouteStop[] = [];

    for (const transcript of ["Rua A", "Rua B", "Rua C"]) {
      const state = applyFinalVoiceStop<VoiceRouteStop>(
        stops,
        transcript,
        null
      );
      stops = state.stops;
    }

    const backendStops = buildBackendStopsPayload(stops);

    expect(stops).toHaveLength(3);
    expect(stops.map((stop) => stop.address)).toEqual(["Rua A", "Rua B", "Rua C"]);
    expect(backendStops).toHaveLength(3);
    expect(backendStops.map((stop) => stop.address)).toEqual([
      "Rua A",
      "Rua B",
      "Rua C",
    ]);
  });
});
