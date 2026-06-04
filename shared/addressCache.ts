export function normalizeAddressText(value: string) {
  return value
    .replace(/\bR\.\s+/gi, "Rua ")
    .replace(/\bAv\.\s+/gi, "Avenida ")
    .replace(/\bPres\.\s+Prudente\b/gi, "Presidente Prudente")
    .replace(/\bPte\.\s+Prudente\b/gi, "Presidente Prudente")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddressForCache(value: string) {
  return normalizeAddressText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bbrasil\b/g, " ")
    .replace(/\bsao paulo\b/g, " sp ")
    .replace(
      /\b(?:apto?|apartamento|ap|bloco|torre|casa|fundos|sala|loja|quadra|lote|andar|condominio)\b.*$/i,
      " "
    )
    .replace(/\bcep\b/g, " ")
    .replace(/\b\d{5}-?\d{3}\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function stripAddressComplementForCache(value: string) {
  const normalized = normalizeAddressText(value);
  return (
    normalized
      .replace(
        /\s*,?\s*\b(?:apto?|apartamento|ap|bloco|torre|casa|fundos|sala|loja|quadra|lote|andar|condominio|condomínio)\b.*$/i,
        ""
      )
      .trim() || normalized
  );
}

export function moveLeadingHouseNumberForCache(value: string) {
  const parts = normalizeAddressText(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return value;
  if (!/^\d+[a-zA-Z]?$/.test(parts[0]) || !/[a-zA-ZÀ-ÿ]/.test(parts[1])) {
    return value;
  }

  return [parts[1], parts[0], ...parts.slice(2)].join(", ");
}

export function getEquivalentAddressCacheKeys(value: string) {
  const normalized = normalizeAddressText(value);
  const withoutComplement = stripAddressComplementForCache(normalized);
  const candidates = [
    normalized,
    withoutComplement,
    normalized.replace(/,\s*brasil$/i, ""),
    withoutComplement.replace(/,\s*brasil$/i, ""),
    moveLeadingHouseNumberForCache(normalized),
    moveLeadingHouseNumberForCache(withoutComplement),
  ];

  return Array.from(
    new Set(
      candidates
        .map(normalizeAddressForCache)
        .filter((key) => key.length >= 4)
    )
  );
}
