import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  rememberAddressCoordinates,
  searchAddress,
} from "./geocodingService";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.restoreAllMocks();

  Object.defineProperty(globalThis, "window", {
    value: {
      setTimeout: vi.fn(() => 0),
      clearTimeout,
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
      },
    },
    configurable: true,
  });
});

describe("geocodingService", () => {
  it("returns a remembered coordinate before external search results", async () => {
    rememberAddressCoordinates(
      "Rua Teste, 123, Centro, Presidente Prudente, SP",
      -22.12,
      -51.4
    );

    const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchAddress(
      "Rua Teste, 123, Centro, Presidente Prudente, SP"
    );

    expect(results[0]).toMatchObject({
      latitude: -22.12,
      longitude: -51.4,
      type: "saved",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns remembered coordinates for equivalent address variations", async () => {
    rememberAddressCoordinates(
      "Rua Teste, 123, Centro, Presidente Prudente, SP, ap 12",
      -22.12,
      -51.4,
      {
        geocodingConfidenceScore: 95,
        geocodingMethod: "exact_address",
        geocodingSuspect: false,
      }
    );

    const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchAddress(
      "R. Teste, 123, Centro, Presidente Prudente, SP"
    );

    expect(results[0]).toMatchObject({
      latitude: -22.12,
      longitude: -51.4,
      type: "saved",
      geocodingConfidenceScore: 95,
      geocodingMethod: "exact_address",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the external geocoder flow when local memory misses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            place_id: 99,
            lat: "-22.13",
            lon: "-51.41",
            display_name: "Rua Nova, 456, Centro, Presidente Prudente, Sao Paulo",
            address: {
              road: "Rua Nova",
              house_number: "456",
              suburb: "Centro",
              city: "Presidente Prudente",
              state: "Sao Paulo",
            },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchAddress("Rua Nova, 456, Presidente Prudente, SP");

    expect(fetchMock).toHaveBeenCalled();
    expect(results[0]?.id).toBe("99");
  });

  it("tries cleaned fallback queries when the first query has no result", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const requestUrl = new URL(String(url), "https://econo-rotas.test");
      const q = requestUrl.searchParams.get("q") || "";
      const hasApartmentComplement = /ap\s*12/i.test(q);

      return new Response(
        JSON.stringify(
          hasApartmentComplement
            ? []
            : [
                {
                  place_id: 10,
                  lat: "-22.12",
                  lon: "-51.4",
                  display_name:
                    "Rua Teste, 123, Centro, Presidente Prudente, São Paulo",
                  address: {
                    road: "Rua Teste",
                    house_number: "123",
                    suburb: "Centro",
                    city: "Presidente Prudente",
                    state: "São Paulo",
                  },
                },
              ]
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchAddress(
      "Rua Teste, 123, Centro, Presidente Prudente, SP, ap 12"
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.label).toContain("Rua Teste");
    const searchedQueries = fetchMock.mock.calls.map(([url]) =>
      new URL(String(url), "https://econo-rotas.test").searchParams.get("q") || ""
    );
    expect(searchedQueries[0]).toMatch(/ap\s*12/i);
    expect(searchedQueries.slice(1).some((q) => !/ap\s*12/i.test(q))).toBe(true);
  });

  it("prioritizes exact house-number matches over street-only approximations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              place_id: 20,
              lat: "-22.11",
              lon: "-51.41",
              display_name: "Rua Teste, Centro, Presidente Prudente, Sao Paulo",
              importance: 0.8,
              type: "tertiary",
              address: {
                road: "Rua Teste",
                suburb: "Centro",
                city: "Presidente Prudente",
                state: "Sao Paulo",
              },
            },
            {
              place_id: 21,
              lat: "-22.12",
              lon: "-51.42",
              display_name: "Rua Teste, 123, Centro, Presidente Prudente, Sao Paulo",
              importance: 0.2,
              type: "house",
              address: {
                road: "Rua Teste",
                house_number: "123",
                suburb: "Centro",
                city: "Presidente Prudente",
                state: "Sao Paulo",
              },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const results = await searchAddress("Rua Teste, 123, Presidente Prudente, SP");

    expect(results[0]?.id).toBe("21");
    expect(results[0]?.accuracy).toBe("exact");
    expect(results[1]?.accuracy).toBe("approximate");
    expect(results[1]?.shortLabel).toContain("Aproximado pela rua");
  });
});
