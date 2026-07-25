export const STOP_SOURCE_PROVIDERS = [
  "manual",
  "shopee",
  "imile",
  "mercado_livre",
  "amazon",
  "correios",
  "generic",
] as const;

export type StopSourceProvider = (typeof STOP_SOURCE_PROVIDERS)[number];

export type StopMetadata = {
  packageNumber?: string;
  packageNumbers?: string[];
  sourceAddressVariants?: string[];
  sourceAddressConflict?: boolean;
  trackingNumber?: string;
  recipientName?: string;
  recipientPhone?: string;
  externalStatus?: string;
  externalDistanceText?: string;
  groupedDeliveryCount?: number;
  sourceRouteId?: string;
  importedFrom?: string;
};

export type LegacyStopMetadataResult = {
  metadata: StopMetadata;
  notes?: string;
  originalStop?: number | null;
  isUnsequencedStop?: boolean;
};

function cleanMetadataValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

export function normalizePackageNumbers(...values: unknown[]) {
  const packageNumbers: string[] = [];

  const addValue = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(addValue);
      return;
    }

    const text = cleanMetadataValue(value);
    if (!text || text === "0") return;

    const normalized = text.toLowerCase();
    if (!packageNumbers.some((item) => item.toLowerCase() === normalized)) {
      packageNumbers.push(text);
    }
  };

  values.forEach(addValue);
  return packageNumbers;
}

export function getStopPackageNumbers(
  metadata: StopMetadata | null | undefined,
  fallbackPackageNumber?: unknown
) {
  return normalizePackageNumbers(
    metadata?.packageNumbers,
    metadata?.packageNumber,
    metadata?.trackingNumber,
    fallbackPackageNumber
  );
}

export function normalizeStopSourceProvider(
  value: unknown
): StopSourceProvider {
  const normalized = String(value || "").trim().toLowerCase();
  return STOP_SOURCE_PROVIDERS.includes(normalized as StopSourceProvider)
    ? (normalized as StopSourceProvider)
    : "generic";
}

export function normalizeStopMetadata(value: unknown): StopMetadata {
  let parsedValue = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = {};
    }
  }

  const input =
    parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : {};

  const metadata: StopMetadata = {};
  const stringKeys: Array<
    keyof Omit<
      StopMetadata,
      | "groupedDeliveryCount"
      | "packageNumbers"
      | "sourceAddressVariants"
      | "sourceAddressConflict"
    >
  > = [
    "packageNumber",
    "trackingNumber",
    "recipientName",
    "recipientPhone",
    "externalStatus",
    "externalDistanceText",
    "sourceRouteId",
    "importedFrom",
  ];

  stringKeys.forEach((key) => {
    const text = cleanMetadataValue(input[key]);
    if (text) metadata[key] = text;
  });

  const packageNumbers = normalizePackageNumbers(
    input.packageNumbers,
    metadata.packageNumber,
    metadata.trackingNumber
  );
  if (packageNumbers.length) {
    metadata.packageNumbers = packageNumbers;
    metadata.packageNumber ??= packageNumbers[0];
  }

  const sourceAddressVariants = normalizePackageNumbers(
    input.sourceAddressVariants
  );
  if (sourceAddressVariants.length) {
    metadata.sourceAddressVariants = sourceAddressVariants;
  }
  if (input.sourceAddressConflict === true) {
    metadata.sourceAddressConflict = true;
  }

  const groupedDeliveryCount = Number(input.groupedDeliveryCount);
  if (Number.isFinite(groupedDeliveryCount) && groupedDeliveryCount > 0) {
    metadata.groupedDeliveryCount = Math.round(groupedDeliveryCount);
  }

  return metadata;
}

export function mergeStopMetadata(
  ...values: Array<StopMetadata | null | undefined>
) {
  return values.reduce<StopMetadata>((acc, value) => {
    const normalized = normalizeStopMetadata(value);
    const merged = {
      ...acc,
      ...normalized,
    };
    const packageNumbers = normalizePackageNumbers(
      acc.packageNumbers,
      acc.packageNumber,
      normalized.packageNumbers,
      normalized.packageNumber
    );
    const sourceAddressVariants = normalizePackageNumbers(
      acc.sourceAddressVariants,
      normalized.sourceAddressVariants
    );

    return {
      ...merged,
      packageNumber: merged.packageNumber ?? packageNumbers[0],
      packageNumbers: packageNumbers.length ? packageNumbers : undefined,
      sourceAddressVariants: sourceAddressVariants.length
        ? sourceAddressVariants
        : undefined,
      sourceAddressConflict:
        acc.sourceAddressConflict === true ||
        normalized.sourceAddressConflict === true ||
        undefined,
    };
  }, {});
}

export function parseLegacyStopNotes(
  notes?: string | null
): LegacyStopMetadataResult {
  const raw = notes?.trim();
  if (!raw) return { metadata: {} };

  const metadata: StopMetadata = {};
  const remaining: string[] = [];
  let originalStop: number | null | undefined;
  let isUnsequencedStop: boolean | undefined;

  raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^([^:]+)\s*:\s*(.+)$/);
      const key = match?.[1]?.trim().toLowerCase();
      const value = match?.[2]?.trim();

      if (!key || !value) {
        remaining.push(part);
        return;
      }

      if (key === "pacote") {
        metadata.packageNumber ??= value;
        return;
      }

      if (key === "pacotes") {
        metadata.packageNumbers = normalizePackageNumbers(
          metadata.packageNumbers,
          value.split(",")
        );
        metadata.packageNumber ??= metadata.packageNumbers[0];
        return;
      }

      if (key === "stop") {
        const numericStop = Number(value.replace(",", "."));
        originalStop = Number.isFinite(numericStop) ? Math.round(numericStop) : 0;
        isUnsequencedStop = !Number.isFinite(numericStop) || numericStop <= 0;
        return;
      }

      if (key === "rastreio") {
        metadata.trackingNumber ??= value;
        return;
      }

      if (key === "rota origem") {
        metadata.sourceRouteId ??= value;
        return;
      }

      if (key === "destinatario" || key === "destinatário") {
        metadata.recipientName ??= value;
        return;
      }

      if (key === "telefone") {
        metadata.recipientPhone ??= value;
        return;
      }

      if (key === "status imile") {
        metadata.externalStatus ??= value;
        return;
      }

      if (key === "distancia app" || key === "distância app") {
        metadata.externalDistanceText ??= value;
        return;
      }

      if (key === "entregas agrupadas") {
        const count = Number(value.replace(",", "."));
        if (Number.isFinite(count) && count > 0) {
          metadata.groupedDeliveryCount ??= Math.round(count);
        }
        return;
      }

      remaining.push(part);
    });

  return {
    metadata,
    notes: remaining.length ? remaining.join(" | ") : undefined,
    originalStop,
    isUnsequencedStop,
  };
}

export function hasStructuredStopMetadata(value: StopMetadata | undefined) {
  return Object.keys(normalizeStopMetadata(value)).length > 0;
}
