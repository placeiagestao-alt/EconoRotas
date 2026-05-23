export type ImportedStop = {
  address: string;
  latitude: number;
  longitude: number;
  notes?: string;
  sourceRow: number;
};

export type ImportedRoute = {
  routeName: string;
  stops: ImportedStop[];
  totalRows: number;
  skippedRows: number;
  missingCoordinateRows: number;
};

type RawSpreadsheetRow = Record<string, unknown>;

const HEADER_ALIASES = {
  routeId: ["at id", "route id", "rota", "codigo rota", "codigo da rota"],
  sequence: ["sequence", "sequencia", "sequencia rota", "ordem", "parada"],
  tracking: ["spx tn", "tracking", "codigo", "pedido", "encomenda", "pacote"],
  address: [
    "destination address",
    "address",
    "endereco",
    "endereco destino",
    "endereco completo",
    "logradouro",
  ],
  neighborhood: ["bairro", "neighborhood", "district"],
  city: ["city", "cidade", "municipio"],
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

  const text = String(value).trim();
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

function pushUnique(parts: string[], value: string) {
  const normalizedValue = normalizeHeader(value);
  const alreadyExists = parts.some((part) => normalizeHeader(part) === normalizedValue);

  if (!alreadyExists) {
    parts.push(value);
  }
}

function buildAddress(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const address = cleanText(getCell(row, headerMap, HEADER_ALIASES.address));
  const neighborhood = cleanText(getCell(row, headerMap, HEADER_ALIASES.neighborhood));
  const city = cleanText(getCell(row, headerMap, HEADER_ALIASES.city));
  const postalCode = cleanText(getCell(row, headerMap, HEADER_ALIASES.postalCode));
  const parts: string[] = [];

  [address, neighborhood, city, postalCode].forEach((part) => {
    if (part) pushUnique(parts, part);
  });

  return parts.join(", ");
}

function buildNotes(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const tracking = cleanText(getCell(row, headerMap, HEADER_ALIASES.tracking));
  const routeId = cleanText(getCell(row, headerMap, HEADER_ALIASES.routeId));
  const notes = [
    tracking ? `Pacote: ${tracking}` : "",
    routeId ? `Rota origem: ${routeId}` : "",
  ].filter(Boolean);

  return notes.length ? notes.join(" | ") : undefined;
}

function getSequence(row: RawSpreadsheetRow, headerMap: Record<string, string>) {
  const sequence = cleanText(getCell(row, headerMap, HEADER_ALIASES.sequence));
  const parsed = Number(sequence.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const parsedRows = rows
    .map((row, index) => {
      const address = buildAddress(row, headerMap);
      const latitude = parseCoordinate(getCell(row, headerMap, HEADER_ALIASES.latitude));
      const longitude = parseCoordinate(getCell(row, headerMap, HEADER_ALIASES.longitude));
      const sequence = getSequence(row, headerMap);

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

  const sortableRows = parsedRows.every((stop) => stop.sequence !== undefined)
    ? [...parsedRows].sort((a, b) => Number(a.sequence) - Number(b.sequence))
    : parsedRows;

  const stops = sortableRows.map(({ sequence: _sequence, ...stop }) => stop);

  if (stops.length < 2) {
    throw new Error("A planilha precisa ter pelo menos 2 enderecos validos.");
  }

  return {
    routeName: getRouteName(rows, headerMap, fileName),
    stops,
    totalRows: rows.length,
    skippedRows: rows.length - stops.length,
    missingCoordinateRows: stops.filter((stop) => !stop.latitude || !stop.longitude).length,
  };
}

export async function parseRouteWorkbook(file: File) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("A planilha nao possui abas.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<RawSpreadsheetRow>(sheet, {
    defval: "",
    raw: true,
  });

  return parseRouteRows(rows, file.name);
}
