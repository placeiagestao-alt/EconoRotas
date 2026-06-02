import { ENV } from "./_core/env";

export type ImileDeliveryStop = {
  address: string;
  latitude: number;
  longitude: number;
  packageNumber?: string;
  trackingNumber?: string;
  recipientName?: string;
  recipientPhone?: string;
  status?: string;
  notes?: string;
};

export type ImileDeliveryImport = {
  configured: boolean;
  source: "imile";
  total: number;
  stops: ImileDeliveryStop[];
  missingAddressRows: number;
  missingCoordinateRows: number;
};

type ImileFetchInput = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
};

export type ImileCredentialOverrides = Partial<{
  baseUrl: string;
  fallbackBaseUrls: string[] | string;
  deliveriesPath: string;
  customerId: string;
  sign: string;
  authHeader: string;
  authToken: string;
  country: string;
  lang: string;
  resourceCode: string;
  timezone: string;
  hubCode: string;
  appVersion: string;
  sourceName: string;
}>;

const DEFAULT_IMILE_API_BASE_URL = "https://driverapp.imile.com";
const DEFAULT_IMILE_FALLBACK_BASE_URLS = [
  "https://driverapp-zen.imile.com",
  "https://driverapp-cf.imile.com",
  "https://driverapp-sgaws.imile.com",
];
const DEFAULT_IMILE_DELIVERIES_PATH =
  "/lm/express/driver/v1/driver/delivery/delivery/queryDeliveryListV2";
const DEFAULT_IMILE_APP_VERSION = "2.2.78";
const DEFAULT_IMILE_SOURCE_NAME = "REDeliveryApp";

const DIRECT_FIELDS = {
  trackingNumber: [
    "trackingNumber",
    "trackingNo",
    "waybillNo",
    "wayBillNo",
    "awbNo",
    "billCode",
    "orderNo",
    "shipmentNo",
    "scanNumber",
    "referenceNo",
    "taskNo",
  ],
  address: [
    "address",
    "destinationAddress",
    "receiverAddress",
    "recipientAddress",
    "consigneeAddress",
    "deliveryAddress",
    "addressDetail",
    "detailAddress",
    "consigneeStreet",
    "lastConsigneeAddress",
  ],
  city: ["city", "receiverCity", "recipientCity", "consigneeCity", "addressCity"],
  neighborhood: ["neighborhood", "district", "bairro", "receiverDistrict", "consigneeSuburb"],
  postalCode: ["postalCode", "zipCode", "zipcode", "cep", "consigneeZipCode"],
  latitude: [
    "latitude",
    "lat",
    "receiverLatitude",
    "recipientLatitude",
    "consigneeLatitude",
    "addressLatitude",
  ],
  longitude: [
    "longitude",
    "lng",
    "lon",
    "receiverLongitude",
    "recipientLongitude",
    "consigneeLongitude",
    "addressLongitude",
  ],
  recipientName: ["recipientName", "receiverName", "consigneeName", "customerName"],
  recipientPhone: [
    "recipientPhone",
    "receiverPhone",
    "consigneePhone",
    "consigneeMobile",
    "phone",
    "mobile",
  ],
  status: ["status", "deliveryStatus", "shipmentStatus", "state"],
} as const;

function readFirstString(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;

    const text = String(value).trim();
    if (text) return text;
  }

  return "";
}

function readCoordinate(record: Record<string, unknown>, keys: readonly string[]) {
  const value = readFirstString(record, keys).replace(",", ".");
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
}

function compactJoin(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index, all) =>
      all.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index
    )
    .join(", ");
}

function pickArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const candidateKeys = ["data", "list", "rows", "records", "result", "orders", "deliveries"];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value)) {
      const nested = pickArray(value);
      if (nested.length) return nested;
    }
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildNotes(stop: ImileDeliveryStop) {
  return [
    stop.trackingNumber ? `Rastreio: ${stop.trackingNumber}` : "",
    stop.status ? `Status iMile: ${stop.status}` : "",
    stop.recipientName ? `Destinatario: ${stop.recipientName}` : "",
    stop.recipientPhone ? `Telefone: ${stop.recipientPhone}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function normalizeDelivery(record: Record<string, unknown>, index: number): ImileDeliveryStop {
  const trackingNumber = readFirstString(record, DIRECT_FIELDS.trackingNumber);
  const address = compactJoin([
    readFirstString(record, DIRECT_FIELDS.address),
    readFirstString(record, DIRECT_FIELDS.neighborhood),
    readFirstString(record, DIRECT_FIELDS.city),
    readFirstString(record, DIRECT_FIELDS.postalCode),
  ]);
  const stop: ImileDeliveryStop = {
    address,
    latitude: readCoordinate(record, DIRECT_FIELDS.latitude),
    longitude: readCoordinate(record, DIRECT_FIELDS.longitude),
    packageNumber: String(index + 1).padStart(2, "0"),
    trackingNumber,
    recipientName: readFirstString(record, DIRECT_FIELDS.recipientName),
    recipientPhone: readFirstString(record, DIRECT_FIELDS.recipientPhone),
    status: readFirstString(record, DIRECT_FIELDS.status),
  };

  return {
    ...stop,
    notes: buildNotes(stop),
  };
}

function normalizeFallbackBaseUrls(value: string[] | string | undefined, baseUrl: string) {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return (raw || DEFAULT_IMILE_FALLBACK_BASE_URLS.join(","))
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .filter((value) => value !== baseUrl);
}

function getImileConfig(overrides: ImileCredentialOverrides = {}) {
  const baseUrl = (overrides.baseUrl || ENV.imileApiBaseUrl || DEFAULT_IMILE_API_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const deliveriesPath =
    overrides.deliveriesPath || ENV.imileDeliveriesPath || DEFAULT_IMILE_DELIVERIES_PATH;
  const fallbackBaseUrls = normalizeFallbackBaseUrls(
    overrides.fallbackBaseUrls || ENV.imileFallbackBaseUrls,
    baseUrl
  );
  const authToken = overrides.authToken || ENV.imileAuthToken;

  return {
    configured: Boolean(baseUrl && authToken),
    baseUrl,
    fallbackBaseUrls,
    deliveriesPath,
    customerId: overrides.customerId || ENV.imileCustomerId,
    sign: overrides.sign || ENV.imileSign,
    authHeader: overrides.authHeader || ENV.imileAuthHeader || "Authorization",
    authToken,
    country: overrides.country || ENV.imileCountry || "BRA",
    lang: overrides.lang || ENV.imileLang || "pt-BR",
    resourceCode: overrides.resourceCode || ENV.imileResourceCode || "BRA",
    timezone: overrides.timezone || ENV.imileTimezone || "America/Sao_Paulo",
    hubCode: overrides.hubCode || ENV.imileHubCode,
    appVersion: overrides.appVersion || ENV.imileAppVersion || DEFAULT_IMILE_APP_VERSION,
    sourceName: overrides.sourceName || ENV.imileSourceName || DEFAULT_IMILE_SOURCE_NAME,
  };
}

export function getImileConnectionStatus(overrides: ImileCredentialOverrides = {}) {
  const config = getImileConfig(overrides);

  return {
    configured: config.configured,
    baseUrlConfigured: Boolean(config.baseUrl),
    baseUrl: config.baseUrl,
    fallbackBaseUrls: config.fallbackBaseUrls,
    deliveriesPath: config.deliveriesPath,
    customerIdConfigured: Boolean(config.customerId),
    signConfigured: Boolean(config.sign),
    authTokenConfigured: Boolean(config.authToken),
    country: config.country,
    sourceName: config.sourceName,
    appVersion: config.appVersion,
  };
}

function buildImileHeaders(config: ReturnType<typeof getImileConfig>) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "IM-Language": config.lang,
    "IM-SourceName": config.sourceName,
    "IM-TimeZone": config.timezone,
    "IM-APP-Version": config.appVersion,
    "IM-APP-Timestamp": String(Date.now()),
    lang: config.lang,
    "resource-code": config.resourceCode,
    timezone: config.timezone,
  };

  if (config.hubCode) {
    headers["IM-HubId"] = config.hubCode;
    headers.hubcode = config.hubCode;
  }

  if (config.customerId) headers.customerId = config.customerId;
  if (config.sign) headers.sign = config.sign;
  if (config.authHeader && config.authToken) {
    headers[config.authHeader] =
      config.authHeader.toLowerCase() === "authorization" &&
      !config.authToken.toLowerCase().startsWith("bearer ")
        ? `Bearer ${config.authToken}`
        : config.authToken;
  }

  return headers;
}

function extractResponseMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  return String(payload.message || payload.msg || payload.error || payload.resultMessage || fallback);
}

function assertImilePayloadOk(payload: unknown, baseUrl: string) {
  if (!isRecord(payload)) return;

  const status = String(payload.status ?? "").toLowerCase();
  const resultCode = String(payload.resultCode ?? "");
  const success = payload.success;
  const authenticated = /auth|token|login/i.test(extractResponseMessage(payload, ""));

  if (resultCode === "00002" || authenticated) {
    throw new Error(
      `iMile exige autenticacao valida em ${baseUrl}. Cadastre a credencial Rider Delivery no perfil ou configure IMILE_AUTH_TOKEN no servidor.`
    );
  }

  if (success === false || status === "failure") {
    throw new Error(`iMile recusou a consulta em ${baseUrl}: ${extractResponseMessage(payload, "falha")}`);
  }
}

async function requestDeliveriesFromBaseUrl(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
) {
  const url = new URL(path, `${baseUrl}/`);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(async () => ({
    message: await response.text().catch(() => response.statusText),
  }));

  if (!response.ok) {
    const message = extractResponseMessage(payload, response.statusText);
    throw new Error(`iMile respondeu HTTP ${response.status} em ${baseUrl}: ${message}`);
  }

  assertImilePayloadOk(payload, baseUrl);
  return payload;
}

export async function fetchImileDeliveries(
  input: ImileFetchInput,
  overrides: ImileCredentialOverrides = {}
): Promise<ImileDeliveryImport> {
  const config = getImileConfig(overrides);

  if (!config.configured) {
    return {
      configured: false,
      source: "imile",
      total: 0,
      stops: [],
      missingAddressRows: 0,
      missingCoordinateRows: 0,
    };
  }

  const body = {
    customerId: config.customerId || undefined,
    sign: config.sign || undefined,
    country: config.country,
    countryCode: config.country,
    dateFrom: input.dateFrom || undefined,
    dateTo: input.dateTo || undefined,
    status: input.status || undefined,
    pageNum: 1,
    pageNumber: 1,
    currentPage: 1,
    pageSize: 500,
  };
  const headers = buildImileHeaders(config);
  const baseUrls = [config.baseUrl, ...config.fallbackBaseUrls];
  let payload: unknown = null;
  let lastError: unknown = null;

  for (const baseUrl of baseUrls) {
    try {
      payload = await requestDeliveriesFromBaseUrl(baseUrl, config.deliveriesPath, headers, body);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  const stops = pickArray(payload).map(normalizeDelivery).filter((stop) => stop.address);

  return {
    configured: true,
    source: "imile",
    total: stops.length,
    stops,
    missingAddressRows: pickArray(payload).length - stops.length,
    missingCoordinateRows: stops.filter((stop) => !stop.latitude || !stop.longitude).length,
  };
}
