import { describe, expect, it } from "vitest";
import {
  getEquivalentAddressCacheKeys,
  normalizeAddressForCache,
} from "../shared/addressCache";

describe("address cache normalization", () => {
  it("normalizes equivalent address strings to the same cache key", () => {
    expect(normalizeAddressForCache("Rua das Flores 123, Ourinhos, SP")).toBe(
      normalizeAddressForCache("Rua das Flores 123, Ourinhos, Sao Paulo, Brasil")
    );
  });

  it("builds equivalent cache keys without complement noise", () => {
    const keys = getEquivalentAddressCacheKeys(
      "Rua Teste, 123, Centro, Presidente Prudente, SP, ap 12"
    );

    expect(keys).toContain(
      normalizeAddressForCache("Rua Teste, 123, Centro, Presidente Prudente, SP")
    );
  });
});
