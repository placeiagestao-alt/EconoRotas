import {
  normalizeStopSourceProvider,
  type StopMetadata,
  type StopSourceProvider,
} from "@shared/stopMetadata";

export type ImportedStop = {
  address: string;
  latitude: number;
  longitude: number;
  packageNumber?: string;
  deliveryCount?: number;
  routingStop?: number;
  sourceProvider?: StopSourceProvider;
  originalStop?: number | null;
  isUnsequencedStop?: boolean;
  metadata?: StopMetadata;
  notes?: string;
  sourceRow: number;
};

export type ImportedRoute = {
  routeName: string;
  stops: ImportedStop[];
  sourceProvider: StopSourceProvider;
  hasStopSequence: boolean;
  totalRows: number;
  totalDeliveries?: number;
  groupedDeliveries?: number;
  skippedRows: number;
  missingCoordinateRows: number;
};

type RawSpreadsheetRow = Record<string, unknown>;
type ParsedRouteRow = {
  address: string;
  latitude: number;
  longitude: number;
  notes?: string;
  sequence?: number;
  sourceRow: number;
  packageNumber?: string;
  metadata?: StopMetadata;
  sourceProvider?: StopSourceProvider;
  originalStop?: number | null;
  isUnsequencedStop?: boolean;
};

type ImileScreenRow = {
  trackingNumber?: string;
  recipientName?: string;
  deliveryCount: number;
  address: string;
  status?: string;
  distance?: string;
  sourceRow: number;
};

const HEADER_ALIASES = {
  routeId: ["at id", "route id", "rota", "codigo rota", "codigo da rota"],
  stop: ["stop"],
  tracking: ["spx tn", "tracking", "codigo", "pedido", "encomenda", "pacote"],
  address: [
    "destination address",
    "address",
    "endereco",
    "endereço",
    "endereco entrega",
    "endereco de entrega",
    "endereco destinatario",
    "endereco do destinatario",
    "endereco cliente",
    "endereco do cliente",
    "endereco destino",
    "endereco completo",
    "endereco completo entrega",
    "logradouro",
    "rua",
  ],
  number: ["numero", "número", "nro", "num", "no", "n", "number", "house number"],
  complement: ["complemento", "referencia", "referência", "apto", "apartamento"],
  neighborhood: ["bairro", "neighborhood", "district"],
  city: ["city", "cidade", "municipio"],
  state: ["uf", "estado", "state"],
  postalCode: ["zipcode postal code", "zipcode", "postal code", "cep"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long", "lon"],
} as const;

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeImportedAddressKey(value: string) {
  return normalizeHeader(value);
}

function getImportedDeliveryCount(stop: Pick<ImportedStop, "deliveryCount">) {
  const count = Number(stop.deliveryCount);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 1;
}

function hasImportedCoordinates(stop: Pick<ImportedStop, "latitude" | "longitude">) {
  return Boolean(stop.latitude && stop.longitude);
}

function pushUniqueText(values: string[], value: unknown) {
  const text = cleanText(value);
  if (!text) return;

  const normalized = normalizeHeader(text);
  if (!values.some((item) => normalizeHeader(item) === normalized)) {
    values.push(text);
  }
}

function summarizeValues(values: string[], limit = 8) {
  if (values.length <= limit) return values.join(", ");

  return `${values.slice(0, limit).join(", ")} +${values.length - limit}`;
}

function getImportedPackageNumber(stop: ImportedStop) {
  return (
    stop.packageNumber ||
    stop.metadata?.packageNumber ||
    stop.metadata?.trackingNumber ||
    ""
  );
}

function getImportedStopLabel(stop: ImportedStop) {
  const stopNumber = Number(stop.originalStop ?? stop.routingStop);
  if (Number.isFinite(stopNumber) && stopNumber > 0) return String(Math.round(stopNumber));
  if (stop.isUnsequencedStop || stopNumber === 0) return "sem STOP";
  return "";
}

function mergeGroupedStopNotes(
  deliveryCount: number,
  notes: string[],
  packageNumbers: string[],
  stopLabels: string[]
) {
  const parts = [`${deliveryCount}x entregas neste endereco`];

  if (packageNumbers.length > 1) {
    parts.push(`Pacotes: ${summarizeValues(packageNumbers)}`);
  }

  if (stopLabels.length > 1) {
    parts.push(`STOPs: ${summarizeValues(stopLabels)}`);
  }

  notes.forEach((note) => pushUniqueText(parts, note));

  return parts.join(" | ");
}

function mergeImportedStopsByAddress(stops: ImportedStop[]) {
  type GroupState = {
    stop: ImportedStop;
    deliveryCount: number;
    notes: string[];
    packageNumbers: string[];
    stopLabels: string[];
  };

  const groups = new Map<string, GroupState>();
  const orderedKeys: string[] = [];

  stops.forEach((stop) => {
    const key = normalizeImportedAddressKey(stop.address) || `row-${stop.sourceRow}`;
    let group = groups.get(key);

    if (!group) {
      group = {
        stop: {
          ...stop,
          metadata: stop.metadata ? { ...stop.metadata } : undefined,
        },
        deliveryCount: 0,
        notes: [],
        packageNumbers: [],
        stopLabels: [],
      };
      groups.set(key, group);
      orderedKeys.push(key);
    }

    group.deliveryCount += getImportedDeliveryCount(stop);
    pushUniqueText(group.notes, stop.notes);
    pushUniqueText(group.packageNumbers, getImportedPackageNumber(stop));
    pushUniqueText(group.stopLabels, getImportedStopLabel(stop));

    if (!hasImportedCoordinates(group.stop) && hasImportedCoordinates(stop)) {
      group.stop.latitude = stop.latitude;
      group.stop.longitude = stop.longitude;
    }

    group.stop.sourceRow = Math.min(group.stop.sourceRow, stop.sourceRow);

    const currentStopNumber = Number(group.stop.originalStop ?? group.stop.routingStop);
    const incomingStopNumber = Number(stop.originalStop ?? stop.routingStop);
    const currentHasPositiveStop =
      Number.isFinite(currentStopNumber) && currentStopNumber > 0;
    const incomingHasPositiveStop =
      Number.isFinite(incomingStopNumber) && incomingStopNumber > 0;

    if (
      incomingHasPositiveStop &&
      (!currentHasPositiveStop || incomingStopNumber < currentStopNumber)
    ) {
      group.stop.originalStop = Math.round(incomingStopNumber);
      group.stop.routingStop = Math.round(incomingStopNumber);
      group.stop.isUnsequencedStop = false;
    } else if (!currentHasPositiveStop && (stop.isUnsequencedStop || incomingStopNumber === 0)) {
      group.stop.originalStop = 0;
      group.stop.routingStop = 0;
      group.stop.isUnsequencedStop = true;
    }
  });

  const groupedStops = orderedKeys.map((key) => {
    const group = groups.get(key)!;
    const deliveryCount = Math.max(1, group.deliveryCount);
    const stop = {
      ...group.stop,
      deliveryCount: deliveryCount > 1 ? deliveryCount : group.stop.deliveryCount,
      metadata: {
        ...group.stop.metadata,
        groupedDeliveryCount:
          deliveryCount > 1
            ? deliveryCount
            : group.stop.metadata?.groupedDeliveryCount,
      },
      notes:
        deliveryCount > 1
          ? mergeGroupedStopNotes(
              deliveryCount,
              group.notes,
              group.packageNumbers,
              group.stopLabels
            )
          : group.notes[0] || group.stop.notes,
    };

    if (!stop.metadata?.groupedDeliveryCount) {
      delete stop.metadata?.groupedDeliveryCount;
    }

    return stop;
  });
  const totalDeliveries = groupedStops.reduce(
    (sum, stop) => sum + getImportedDeliveryCount(stop),
    0
  );

  return {
    stops: groupedStops,
    totalDeliveries,
    groupedDeliveries: Math.max(0, totalDeliveries - groupedStops.length),
  };
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";

  const text = String(value)
    .replace(/\[cite:\s*\d+\]/gi, "")
    .replace(/SÃ£o/gi, "São")
    .replace(/AraÃº/gi, "Araú")
    .replace(/Ã¡/g, "á")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ã£/g, "ã")
    .replace(/Ã©/g, "é")
    .replace(/Ãª/g, "ê")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ã´/g, "ô")
    .replace(/Ãµ/g, "õ")
    .replace(/Ãº/g, "ú")
    .replace(/Ã§/g, "ç")
    .trim();
  if (!text || text === "-") return "";

  return text.replace(/\s+/g, " ");
}

function parseCoordinate(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = cleanText(value).replace(",", ".");
  if (!text) return 0;

  const coordinate = Number(text);
  return Number.isFinite(coordinate) ? coordinate : 0;
}

function createHeaderMap(row: RawSpreadsheetRow) {
  return Object.keys(row).reduce<Record<string, string>>((headers, key) => {
    headers[normalizeHeader(key)] = key;
    return headers;
  }, {});
}

function getCell(
  row: RawSpreadsheetRow,
  headerMap: Record<string, string>,
  aliases: readonly string[]
) {
  const originalHeader = aliases
    .map((alias) => headerMap[normalizeHeader(alias)])
    .find(Boolean);

  return originalHeader ? row[originalHeader] : undefined;
}

function findHeaderByToken(headerMap: Record<string, string>, tokens: string[]) {
  const normalizedTokens = tokens.map(normalizeHeader);

  return Object.entries(headerMap).find(([normalizedHeader]) =>
    normalizedTokens.some((token) => {
      if (!token) return false;
      return normalizedHeader === token || normalizedHeader.includes(token);
    })
  )?.[1];
}

function getCellFuzzy(
  row: RawSpreadsheetRow,
  headerMap: Record<string, string>,
  aliases: readonly string[],
  tokens: string[]
) {
  const exactValue = getCell(row, headerMap, aliases);
  if (cleanText(exactValue)) return exactValue;

  const header = findHeaderByToken(headerMap, tokens);
  return header ? row[header] : undefined;
}

function pushUnique(parts: string[], value: string) {
  const normalizedValue = normalizeHeader(value);
  const alreadyExists = parts.some((part) => normalizeHeader(part) === normalizedValue);

  if (!alreadyExists) {
    parts.push(value);
  }
}

function hasHouseNumber(address: string) {
  return /(?:^|,\s*|\s)\d{1,6}[a-zA-Z]?(?:\s|,|$)/.test(address);
}

function isLikelySpreadsheetAddress(value: string) {
  const normalized = normalizeHeader(value);
  if (value.length < 8) return false;
  if (/^\d+$/.test(value)) return false;

  return (
    /\b(rua|r |avenida|av |travessa|alameda|rodovia|estrada|praca|praça|logradouro|bairro|jardim|vila|residencial|condominio|condomínio|apto|apartamento|bloco|centro)\b/i.test(
      normalized
    ) || /,\s*\d{1,6}\b/.test(value)
  );
}

function findAddressFromAnyColumn(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const ignoredHeaders = new Set(
    [
      ...HEADER_ALIASES.stop,
      ...HEADER_ALIASES.tracking,
      ...HEADER_ALIASES.routeId,
      ...HEADER_ALIASES.latitude,
      ...HEADER_ALIASES.longitude,
      "nome",
      "cliente",
      "destinatario",
      "destinatário",
      "recipient",
      "name",
    ].map(normalizeHeader)
  );

  return Object.entries(row)
    .filter(([header]) => !ignoredHeaders.has(normalizeHeader(header)))
    .map(([, value]) => cleanText(value))
    .find(isLikelySpreadsheetAddress) || "";
}

function buildAddress(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const rawAddress = cleanText(
    getCellFuzzy(row, headerMap, HEADER_ALIASES.address, [
      "endereco",
      "address",
      "logradouro",
      "rua",
    ])
  );
  const streetNumber = cleanText(getCell(row, headerMap, HEADER_ALIASES.number));
  const complement = cleanText(getCell(row, headerMap, HEADER_ALIASES.complement));
  const neighborhood = cleanText(getCellFuzzy(row, headerMap, HEADER_ALIASES.neighborhood, ["bairro"]));
  const city = cleanText(getCellFuzzy(row, headerMap, HEADER_ALIASES.city, ["cidade", "municipio"]));
  const state = cleanText(getCellFuzzy(row, headerMap, HEADER_ALIASES.state, ["uf", "estado"]));
  const postalCode = cleanText(getCellFuzzy(row, headerMap, HEADER_ALIASES.postalCode, ["cep", "postal"]));
  const parts: string[] = [];
  const address =
    rawAddress ||
    findAddressFromAnyColumn(row, headerMap);

  [
    address,
    streetNumber && address && !hasHouseNumber(address) ? streetNumber : "",
    neighborhood,
    city,
    state,
    postalCode,
    complement,
  ].forEach((part) => {
    if (part) pushUnique(parts, part);
  });

  return parts.join(", ");
}

function buildMetadata(
  row: RawSpreadsheetRow,
  headerMap: Record<string, string>,
  sourceProvider: StopSourceProvider
): StopMetadata {
  const tracking = cleanText(getCell(row, headerMap, HEADER_ALIASES.tracking));
  const routeId = cleanText(getCell(row, headerMap, HEADER_ALIASES.routeId));
  const metadata: StopMetadata = {
    importedFrom: sourceProvider,
  };

  if (tracking) {
    metadata.trackingNumber = tracking;
    metadata.packageNumber = tracking;
  }
  if (routeId) {
    metadata.sourceRouteId = routeId;
  }

  return metadata;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractImileTextLines(input: string) {
  const contentDescriptions = Array.from(input.matchAll(/content-desc="([^"]*)"/g))
    .map((match) => decodeXmlEntities(match[1] || ""));
  const rawText = contentDescriptions.length ? contentDescriptions.join("\n") : input;

  return rawText
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s{2,}/))
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function isImileTracking(value: string) {
  return /^\d{10,16}$/.test(value);
}

function isImileStatus(value: string) {
  return /^(E2E|SLA)\s*:|Tempo esgotado|Restante/i.test(value);
}

function isImileDistance(value: string) {
  return /^\d+(?:[.,]\d+)?\s*km$/i.test(value);
}

function isImileTag(value: string) {
  return /^(lm|d2d|notas rapidas|ordenar|agrupar|filtrar)$/i.test(normalizeHeader(value));
}

function isIgnoredImileLine(value: string) {
  const normalized = normalizeHeader(value);

  return (
    normalized.startsWith("horario de atualizacao") ||
    normalized.startsWith("superou ") ||
    normalized.startsWith("alerta") ||
    /^sla\s+\d/.test(normalized) ||
    normalized === "dismiss menu"
  );
}

function isLikelyImileRecipient(value: string) {
  if (!value || value.length < 3) return false;
  if (looksLikeImileAddress(value) || isImileTracking(value) || isImileStatus(value)) return false;
  if (isImileDistance(value) || isImileTag(value) || isIgnoredImileLine(value)) return false;
  if (/^\d{4}-\d{2}-\d{2}$|^v\d+\.\d+/i.test(value)) return false;
  if (/^D\d{6,}$/i.test(value)) return false;
  if (/^\d+$/.test(value)) return false;
  return /[A-Za-zÀ-ÿ]/.test(value);
}

function parseImileRecipient(value: string) {
  const cleaned = value
    .replace(/[\u200e\u200f]/g, "")
    .replace(/â€Ž/g, "")
    .trim();
  const match = cleaned.match(/^(.*?)\s*\((\d+)\)\s*$/);

  if (!match) {
    return {
      recipientName: cleaned,
      deliveryCount: 1,
    };
  }

  return {
    recipientName: match[1].trim(),
    deliveryCount: Math.max(1, Number(match[2]) || 1),
  };
}

function looksLikeImileAddress(value: string) {
  const normalized = normalizeHeader(value);
  if (value.length < 12) return false;
  if (isImileTracking(value) || isImileStatus(value) || isImileDistance(value) || isImileTag(value)) {
    return false;
  }

  return (
    /,/.test(value) &&
    /\b(rua|av|avenida|travessa|rodovia|estrada|alameda|praca|jardim|vila|bairro|residencial|parque|conjunto|distrito|centro|presidente prudente|sao paulo)\b/i.test(normalized)
  );
}

function buildImileMetadata(row: ImileScreenRow): StopMetadata {
  return {
    packageNumber: row.trackingNumber,
    trackingNumber: row.trackingNumber,
    recipientName: row.recipientName,
    externalStatus: row.status,
    externalDistanceText: row.distance,
    groupedDeliveryCount: row.deliveryCount > 1 ? row.deliveryCount : undefined,
    importedFrom: "imile",
  };
}

function normalizeImileAddress(address: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2 && /^\d+[a-zA-Z]?$/.test(parts[0]) && /[A-Za-z]/.test(parts[1])) {
    return [parts[1], parts[0], ...parts.slice(2)].join(", ");
  }

  return address;
}

function hasAddressBetween(lines: string[], fromIndex: number, toIndex: number) {
  const start = Math.max(0, Math.min(fromIndex, toIndex) + 1);
  const end = Math.max(fromIndex, toIndex);

  return lines.slice(start, end).some(looksLikeImileAddress);
}

function findNearestBefore(
  lines: string[],
  startIndex: number,
  predicate: (value: string) => boolean,
  maxDistance: number
) {
  for (let index = startIndex - 1; index >= Math.max(0, startIndex - maxDistance); index -= 1) {
    if (predicate(lines[index])) {
      return { value: lines[index], index };
    }
  }

  return undefined;
}

function findNearestAfter(
  lines: string[],
  startIndex: number,
  predicate: (value: string) => boolean,
  maxDistance: number
) {
  const endIndex = Math.min(lines.length - 1, startIndex + maxDistance);

  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    if (predicate(lines[index])) {
      return { value: lines[index], index };
    }
  }

  return undefined;
}

function trackingLikelyBelongsToPreviousAddress(lines: string[], trackingIndex: number) {
  const previousAddress = findNearestBefore(
    lines,
    trackingIndex,
    looksLikeImileAddress,
    4
  );
  if (!previousAddress) return false;

  const trackingBeforePreviousAddress = findNearestBefore(
    lines,
    previousAddress.index,
    isImileTracking,
    8
  );

  return !trackingBeforePreviousAddress;
}

function parseImileRowsFromLines(lines: string[]) {
  const rows: ImileScreenRow[] = [];
  let currentTracking = "";
  let currentRecipient = "";

  lines.forEach((line, index) => {
    if (isImileTracking(line)) {
      currentTracking = line;
      return;
    }

    if (looksLikeImileAddress(line)) {
      const previousTracking = findNearestBefore(lines, index, isImileTracking, 8);
      const nextTracking = findNearestAfter(lines, index, isImileTracking, 12);
      const previousRecipient = findNearestBefore(lines, index, isLikelyImileRecipient, 8);
      const nextRecipient = findNearestAfter(lines, index, isLikelyImileRecipient, 12);
      const previousTrackingBelongsToPriorAddress = previousTracking
        ? trackingLikelyBelongsToPreviousAddress(lines, previousTracking.index)
        : false;
      const trackingNumber =
        previousTracking &&
        !hasAddressBetween(lines, previousTracking.index, index) &&
        !previousTrackingBelongsToPriorAddress
          ? previousTracking.value
          : nextTracking?.value || currentTracking || undefined;
      const recipientSource =
        previousRecipient && !hasAddressBetween(lines, previousRecipient.index, index)
          ? previousRecipient.value
          : nextRecipient?.value || currentRecipient || "";
      const recipient = parseImileRecipient(recipientSource);
      const status = findNearestAfter(lines, index, isImileStatus, 12)?.value;
      const distance = findNearestAfter(lines, index, isImileDistance, 12)?.value;

      rows.push({
        trackingNumber,
        recipientName: recipient.recipientName || undefined,
        deliveryCount: recipient.deliveryCount,
        address: normalizeImileAddress(line),
        status,
        distance,
        sourceRow: index + 1,
      });
      return;
    }

    if (isLikelyImileRecipient(line)) {
      currentRecipient = line;
    }
  });

  return rows;
}

function dedupeImileRows(rows: ImileScreenRow[]) {
  const rowsByKey = new Map<string, ImileScreenRow>();
  const getKey = (row: ImileScreenRow) => {
    const trackingKey = normalizeHeader(row.trackingNumber || "");
    const addressKey = normalizeHeader(row.address || "");

    if (trackingKey && addressKey) return `${trackingKey}|${addressKey}`;
    return trackingKey || addressKey || String(row.sourceRow);
  };

  rows.forEach((row) => {
    const key = getKey(row);
    const existing = rowsByKey.get(key);
    const next = existing
      ? {
          ...existing,
          trackingNumber: existing.trackingNumber || row.trackingNumber,
          recipientName: existing.recipientName || row.recipientName,
          deliveryCount: Math.max(existing.deliveryCount || 1, row.deliveryCount || 1),
          status: existing.status || row.status,
          distance: existing.distance || row.distance,
          sourceRow: Math.min(existing.sourceRow, row.sourceRow),
        }
      : row;

    rowsByKey.set(key, next);
  });

  return Array.from(rowsByKey.values());
}

function calculateImileGroupedDeliveries(input: string) {
  const groupedRecipients = new Map<string, number>();

  extractImileTextLines(input).forEach((line) => {
    if (!/\(\d+\)/.test(line)) return;
    if (!isLikelyImileRecipient(line)) return;

    const recipient = parseImileRecipient(line);
    if (!recipient.recipientName || recipient.deliveryCount <= 1) return;

    const key = normalizeHeader(recipient.recipientName);
    groupedRecipients.set(
      key,
      Math.max(groupedRecipients.get(key) || 1, recipient.deliveryCount)
    );
  });

  return Array.from(groupedRecipients.values()).reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
}

function hasStopColumn(headerMap: Record<string, string>) {
  return Boolean(headerMap[normalizeHeader(HEADER_ALIASES.stop[0])]);
}

function hasShopeeRouteEvidence(
  rows: RawSpreadsheetRow[],
  headerMap: Record<string, string>
) {
  return rows.some((row) => {
    const routeId = cleanText(getCell(row, headerMap, HEADER_ALIASES.routeId));
    const tracking = cleanText(getCell(row, headerMap, HEADER_ALIASES.tracking));

    return (
      /^AT\d{8,}/i.test(routeId) ||
      /^BR[A-Z0-9]{8,}$/i.test(tracking)
    );
  });
}

function resolveImportSourceProvider(
  requestedProvider: StopSourceProvider,
  rows: RawSpreadsheetRow[],
  headerMap: Record<string, string>
) {
  const stopColumnExists = hasStopColumn(headerMap);
  const canAutoDetectShopee =
    requestedProvider === "generic" || requestedProvider === "manual";

  if (canAutoDetectShopee && stopColumnExists && hasShopeeRouteEvidence(rows, headerMap)) {
    return "shopee";
  }

  return requestedProvider;
}

function getStopSequence(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const stop = cleanText(getCell(row, headerMap, HEADER_ALIASES.stop));
  const parsed = Number(stop.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRouteName(rows: RawSpreadsheetRow[], headerMap: Record<string, string>, fileName: string) {
  const routeId = rows
    .map((row) => cleanText(getCell(row, headerMap, HEADER_ALIASES.routeId)))
    .find(Boolean);

  if (routeId) {
    return `Rota ${routeId}`;
  }

  return fileName.replace(/\.[^.]+$/, "") || "Rota importada";
}

export function parseRouteRows(
  rows: RawSpreadsheetRow[],
  fileName = "rota.xlsx",
  sourceProvider: StopSourceProvider | string = "generic"
): ImportedRoute {
  if (!rows.length) {
    throw new Error("A planilha esta vazia.");
  }

  const headerMap = createHeaderMap(rows[0]);
  const normalizedSourceProvider = resolveImportSourceProvider(
    normalizeStopSourceProvider(sourceProvider),
    rows,
    headerMap
  );
  const stopColumnExists = hasStopColumn(headerMap);
  const useShopeeStop = normalizedSourceProvider === "shopee" && stopColumnExists;
  const parsedRows = rows
    .map((row, index) => {
      const address = buildAddress(row, headerMap);
      const latitude = parseCoordinate(getCell(row, headerMap, HEADER_ALIASES.latitude));
      const longitude = parseCoordinate(getCell(row, headerMap, HEADER_ALIASES.longitude));
      const sequence = useShopeeStop ? getStopSequence(row, headerMap) : undefined;
      const metadata = buildMetadata(row, headerMap, normalizedSourceProvider);

      return {
        address,
        latitude,
        longitude,
        metadata,
        sequence,
        sourceRow: index + 2,
        sourceProvider: normalizedSourceProvider,
        originalStop: useShopeeStop ? sequence ?? 0 : null,
        isUnsequencedStop: useShopeeStop ? Number(sequence) <= 0 : false,
        packageNumber: metadata.packageNumber,
      };
    })
    .filter((stop) => stop.address);

  const hasStopSequence = useShopeeStop;
  const importedStops = parsedRows.map(({ sequence, ...stop }) => ({
    ...stop,
    routingStop: useShopeeStop ? sequence : undefined,
  }));
  const grouped = mergeImportedStopsByAddress(importedStops);
  const stops = grouped.stops;

  if (stops.length < 2) {
    throw new Error("A planilha precisa ter pelo menos 2 enderecos unicos validos.");
  }

  return {
    routeName: getRouteName(rows, headerMap, fileName),
    stops,
    sourceProvider: normalizedSourceProvider,
    hasStopSequence,
    totalRows: rows.length,
    totalDeliveries: grouped.totalDeliveries,
    groupedDeliveries: grouped.groupedDeliveries,
    skippedRows: rows.length - importedStops.length,
    missingCoordinateRows: stops.filter((stop) => !stop.latitude || !stop.longitude).length,
  };
}

export function parseImileScreenText(input: string, fileName = "imile-screen.txt"): ImportedRoute {
  const rows = dedupeImileRows(parseImileRowsFromLines(extractImileTextLines(input)));

  if (rows.length < 2) {
    throw new Error("A captura iMile precisa conter pelo menos 2 entregas visiveis.");
  }

  const importedStops = rows.map((row) => ({
    address: row.address,
    latitude: 0,
    longitude: 0,
    packageNumber: row.trackingNumber,
    deliveryCount: row.deliveryCount,
    sourceProvider: "imile" as const,
    originalStop: null,
    isUnsequencedStop: false,
    metadata: buildImileMetadata(row),
    sourceRow: row.sourceRow,
  }));
  const grouped = mergeImportedStopsByAddress(importedStops);
  const stops = grouped.stops;
  const groupedDeliveries = Math.max(
    calculateImileGroupedDeliveries(input),
    grouped.groupedDeliveries
  );
  const totalDeliveries = grouped.totalDeliveries;

  return {
    routeName: fileName.replace(/\.[^.]+$/, "") || "Rider Delivery",
    stops,
    sourceProvider: "imile",
    hasStopSequence: false,
    totalRows: totalDeliveries,
    totalDeliveries,
    groupedDeliveries,
    skippedRows: 0,
    missingCoordinateRows: stops.length,
  };
}

export async function parseImileScreenFile(file: File) {
  return parseImileScreenText(await file.text(), file.name);
}

export async function parseRouteWorkbook(
  file: File,
  sourceProvider: StopSourceProvider | string = "generic"
) {
  const buffer = await file.arrayBuffer();
  const normalizedSourceProvider = normalizeStopSourceProvider(sourceProvider);

  if (typeof Worker !== "undefined") {
    return await new Promise<ImportedRoute>((resolve, reject) => {
      const worker = new Worker(new URL("./routeImport.worker.ts", import.meta.url), {
        type: "module",
      });

      worker.onmessage = (event) => {
        const payload = event.data as
          | { ok: true; parsed: ImportedRoute }
          | { ok: false; message?: string };
        worker.terminate();

        if (payload?.ok) {
          resolve(payload.parsed);
          return;
        }

        reject(new Error(payload?.message || "Não foi possível processar a planilha."));
      };

      worker.onerror = () => {
        worker.terminate();
        reject(new Error("Falha ao processar planilha em segundo plano."));
      };

      worker.postMessage(
        {
          type: "parse-workbook",
          fileName: file.name,
          sourceProvider: normalizedSourceProvider,
          buffer,
        },
        [buffer]
      );
    });
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("A planilha não possui abas.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<RawSpreadsheetRow>(sheet, {
    defval: "",
    raw: true,
  });

  return parseRouteRows(rows, file.name, normalizedSourceProvider);
}

