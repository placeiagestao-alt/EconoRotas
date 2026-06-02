export type ImportedStop = {
  address: string;
  latitude: number;
  longitude: number;
  packageNumber?: string;
  deliveryCount?: number;
  routingStop?: number;
  notes?: string;
  sourceRow: number;
};

export type ImportedRoute = {
  routeName: string;
  stops: ImportedStop[];
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
  packageNumber: string;
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

function buildNotes(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const tracking = cleanText(getCell(row, headerMap, HEADER_ALIASES.tracking));
  const routeId = cleanText(getCell(row, headerMap, HEADER_ALIASES.routeId));
  const notes = [
    tracking ? `Rastreio: ${tracking}` : "",
    routeId ? `Rota origem: ${routeId}` : "",
  ].filter(Boolean);

  return notes.length ? notes.join(" | ") : undefined;
}

function buildPackageNumberFromTableIndex(tableIndex: number) {
  return String(tableIndex + 1);
}

function buildPackageNumber(tableIndex: number, sequence: number | undefined, hasStopColumn: boolean) {
  if (hasStopColumn && !Number.isFinite(sequence)) {
    return "0";
  }

  if (Number.isFinite(sequence)) {
    return String(Number(sequence));
  }

  return buildPackageNumberFromTableIndex(tableIndex);
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

function buildImileNotes(row: ImileScreenRow) {
  return [
    row.trackingNumber ? `Rastreio: ${row.trackingNumber}` : "",
    row.recipientName ? `Destinatario: ${row.recipientName}` : "",
    row.deliveryCount > 1 ? `Entregas agrupadas: ${row.deliveryCount}` : "",
    row.status ? `Status iMile: ${row.status}` : "",
    row.distance ? `Distancia app: ${row.distance}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildSequentialImilePackageNumber(index: number) {
  return String(index + 1).padStart(2, "0");
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

function hasNearbyAddressBefore(lines: string[], index: number, maxDistance: number) {
  return lines.slice(Math.max(0, index - maxDistance), index).some(looksLikeImileAddress);
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
      const trackingNumber =
        previousTracking &&
        !hasAddressBetween(lines, previousTracking.index, index) &&
        !hasNearbyAddressBefore(lines, previousTracking.index, 4)
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
  const canonicalByKey = new Map<string, string>();
  const rowsByCanonical = new Map<string, ImileScreenRow>();
  const getKeys = (row: ImileScreenRow) =>
    [row.trackingNumber, row.address]
      .map((value) => normalizeHeader(value || ""))
      .filter(Boolean);

  rows.forEach((row) => {
    const keys = getKeys(row);
    const canonicalKey =
      keys.map((key) => canonicalByKey.get(key)).find(Boolean) || keys[0] || String(row.sourceRow);
    const existing = rowsByCanonical.get(canonicalKey);
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

    rowsByCanonical.set(canonicalKey, next);
    getKeys(next).forEach((key) => canonicalByKey.set(key, canonicalKey));
  });

  return Array.from(rowsByCanonical.values());
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

function getStopSequence(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const stop = cleanText(getCell(row, headerMap, HEADER_ALIASES.stop));
  const parsed = Number(stop.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateDistanceScore(a: ParsedRouteRow, b: ParsedRouteRow) {
  const latDiff = a.latitude - b.latitude;
  const lngDiff = a.longitude - b.longitude;
  return latDiff * latDiff + lngDiff * lngDiff;
}

function getInsertionCost(
  orderedRows: ParsedRouteRow[],
  floatingRow: ParsedRouteRow,
  insertIndex: number
) {
  const previousRow = orderedRows[insertIndex - 1];
  const nextRow = orderedRows[insertIndex];

  if (!previousRow && nextRow) {
    return calculateDistanceScore(floatingRow, nextRow);
  }

  if (previousRow && !nextRow) {
    return calculateDistanceScore(previousRow, floatingRow);
  }

  if (previousRow && nextRow) {
    return (
      calculateDistanceScore(previousRow, floatingRow) +
      calculateDistanceScore(floatingRow, nextRow) -
      calculateDistanceScore(previousRow, nextRow)
    );
  }

  return 0;
}

function findBestInsertionIndex(
  orderedRows: ParsedRouteRow[],
  floatingRow: ParsedRouteRow
) {
  let bestIndex = orderedRows.length;
  let bestCost = Infinity;

  for (let index = 0; index <= orderedRows.length; index += 1) {
    const cost = getInsertionCost(orderedRows, floatingRow, index);

    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function sortStopsByStopSequence(rows: ParsedRouteRow[]) {
  const sequencedRows = rows
    .filter((stop) => Number(stop.sequence) > 0)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const floatingRows = rows.filter((stop) => Number(stop.sequence) <= 0);

  if (!sequencedRows.length) {
    return rows;
  }

  const orderedRows = [...sequencedRows];

  for (const floatingRow of floatingRows) {
    orderedRows.splice(findBestInsertionIndex(orderedRows, floatingRow), 0, floatingRow);
  }

  return orderedRows;
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

export function parseRouteRows(rows: RawSpreadsheetRow[], fileName = "rota.xlsx"): ImportedRoute {
  if (!rows.length) {
    throw new Error("A planilha esta vazia.");
  }

  const headerMap = createHeaderMap(rows[0]);
  const stopColumnExists = hasStopColumn(headerMap);
  const parsedRows = rows
    .map((row, index) => {
      const address = buildAddress(row, headerMap);
      const latitude = parseCoordinate(getCell(row, headerMap, HEADER_ALIASES.latitude));
      const longitude = parseCoordinate(getCell(row, headerMap, HEADER_ALIASES.longitude));
      const sequence = stopColumnExists ? getStopSequence(row, headerMap) : undefined;

      return {
        address,
        latitude,
        longitude,
        notes: buildNotes(row, headerMap),
        sequence,
        sourceRow: index + 2,
      };
    })
    .filter((stop) => stop.address);

  const numberedRows = parsedRows.map((stop, tableIndex) => ({
    ...stop,
    packageNumber: buildPackageNumber(tableIndex, stop.sequence, stopColumnExists),
  }));

  const sortableRows = stopColumnExists
    ? sortStopsByStopSequence(numberedRows)
    : numberedRows;

  const hasStopSequence = stopColumnExists;
  const stops = sortableRows.map(({ sequence, ...stop }) => ({
    ...stop,
    routingStop: sequence,
  }));

  if (stops.length < 2) {
    throw new Error("A planilha precisa ter pelo menos 2 endere\u00e7os v\u00e1lidos.");
  }

  return {
    routeName: getRouteName(rows, headerMap, fileName),
    stops,
    hasStopSequence,
    totalRows: rows.length,
    skippedRows: rows.length - stops.length,
    missingCoordinateRows: stops.filter((stop) => !stop.latitude || !stop.longitude).length,
  };
}

export function parseImileScreenText(input: string, fileName = "imile-screen.txt"): ImportedRoute {
  const rows = dedupeImileRows(parseImileRowsFromLines(extractImileTextLines(input)));

  if (rows.length < 2) {
    throw new Error("A captura iMile precisa conter pelo menos 2 entregas visiveis.");
  }

  const stops = rows.map((row, index) => ({
    address: row.address,
    latitude: 0,
    longitude: 0,
    packageNumber: buildSequentialImilePackageNumber(index),
    deliveryCount: row.deliveryCount,
    notes: buildImileNotes(row),
    sourceRow: row.sourceRow,
  }));
  const groupedDeliveries = Math.max(
    calculateImileGroupedDeliveries(input),
    rows.reduce((sum, row) => sum + Math.max(0, row.deliveryCount - 1), 0)
  );
  const totalDeliveries = stops.length + groupedDeliveries;

  return {
    routeName: fileName.replace(/\.[^.]+$/, "") || "Rider Delivery",
    stops,
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

export async function parseRouteWorkbook(file: File) {
  const buffer = await file.arrayBuffer();

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

  return parseRouteRows(rows, file.name);
}

