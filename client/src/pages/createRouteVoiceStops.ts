export type VoiceRouteStop = {
  address: string;
  latitude: number;
  longitude: number;
  packageNumber?: string;
  notes?: string;
};

const MIN_VOICE_ADDRESS_LENGTH = 4;

export function parseVoiceStop(rawTranscript: string) {
  let text = rawTranscript
    .normalize("NFC")
    .replace(/[.!?;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const packageMatch = text.match(/\b(?:pacote|entrega)\s+([a-z0-9._-]+)\b/i);
  const packageNumber = packageMatch?.[1];

  text = text
    .replace(/\b(?:nova\s+parada|novo\s+endereco|novo\s+endereço|adicionar\s+parada)\b/gi, "")
    .replace(/\b(?:entrega|parada|endereco|endereço)\s+(?:na|no|em)\b/gi, "")
    .replace(/\bpacote\s+[a-z0-9._-]+\b/gi, "")
    .replace(/\bnumero\b/gi, "número")
    .replace(/\s+número\s+/gi, ", ")
    .replace(/\s+bairro\s+/gi, ", bairro ")
    .replace(/\s+cidade\s+/gi, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();

  return {
    address: text,
    packageNumber,
  };
}

export function applyFinalVoiceStop<TStop extends VoiceRouteStop>(
  currentStops: TStop[],
  rawTranscript: string,
  pendingVoiceStopIndex: number | null
) {
  const parsed = parseVoiceStop(rawTranscript);

  if (parsed.address.length < MIN_VOICE_ADDRESS_LENGTH) {
    return {
      stops: currentStops,
      pendingVoiceStopIndex,
      voiceTranscript: parsed.address,
      changed: false,
    };
  }

  const nextStop = {
    address: parsed.address,
    latitude: 0,
    longitude: 0,
    packageNumber: parsed.packageNumber,
    notes: `Inserido por voz: ${rawTranscript.trim()}`,
  } as TStop;

  if (
    pendingVoiceStopIndex !== null &&
    pendingVoiceStopIndex >= 0 &&
    pendingVoiceStopIndex < currentStops.length
  ) {
    return {
      stops: currentStops.map((stop, index) =>
        index === pendingVoiceStopIndex ? { ...stop, ...nextStop } : stop
      ),
      pendingVoiceStopIndex,
      voiceTranscript: parsed.address,
      changed: true,
    };
  }

  const emptyIndex = currentStops.findIndex((stop) => !stop.address.trim());

  if (emptyIndex >= 0) {
    return {
      stops: currentStops.map((stop, index) =>
        index === emptyIndex ? ({ ...stop, ...nextStop } as TStop) : stop
      ),
      pendingVoiceStopIndex: emptyIndex,
      voiceTranscript: parsed.address,
      changed: true,
    };
  }

  return {
    stops: [...currentStops, nextStop],
    pendingVoiceStopIndex: currentStops.length,
    voiceTranscript: parsed.address,
    changed: true,
  };
}

export function applyEditedVoiceStop<TStop extends VoiceRouteStop>(
  currentStops: TStop[],
  address: string,
  pendingVoiceStopIndex: number | null
) {
  const normalizedAddress = address.trim();

  if (normalizedAddress.length < MIN_VOICE_ADDRESS_LENGTH) {
    return {
      stops: currentStops,
      pendingVoiceStopIndex,
      changed: false,
    };
  }

  if (pendingVoiceStopIndex === null) {
    const emptyIndex = currentStops.findIndex((stop) => !stop.address.trim());
    const targetIndex = emptyIndex >= 0 ? emptyIndex : currentStops.length;
    const nextStop = {
      address: normalizedAddress,
      latitude: 0,
      longitude: 0,
      notes: "Inserido por voz com edicao manual",
    } as TStop;

    if (emptyIndex >= 0) {
      return {
        stops: currentStops.map((stop, index) =>
          index === emptyIndex ? ({ ...stop, ...nextStop } as TStop) : stop
        ),
        pendingVoiceStopIndex: targetIndex,
        changed: true,
      };
    }

    return {
      stops: [...currentStops, nextStop],
      pendingVoiceStopIndex: targetIndex,
      changed: true,
    };
  }

  return {
    stops: currentStops.map((stop, index) =>
      index === pendingVoiceStopIndex
        ? ({
            ...stop,
            address: normalizedAddress,
            latitude: 0,
            longitude: 0,
            notes: stop.notes || "Inserido por voz com edicao manual",
          } as TStop)
        : stop
    ),
    pendingVoiceStopIndex,
    changed: true,
  };
}
