import type {
  LocationCandidate,
  LocationResolutionInput,
  ResolvedLocation,
  ResolvedLocationSource,
} from "./types.ts";

function normalizeAddress(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("und")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * A deterministic non-reversible cache token for normalized addresses.
 * Routing code must never log the normalized source string.
 */
export function hashNormalizedAddress(value: string): string | null {
  const normalized = normalizeAddress(value);
  if (!normalized) return null;

  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(normalized)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function finiteCoordinate(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function candidateHash(candidate: LocationCandidate): string | null {
  const supplied = candidate.addressHash?.trim();
  if (supplied) return supplied;
  if (candidate.address) return hashNormalizedAddress(candidate.address);

  const latitude = finiteCoordinate(candidate.latitude);
  const longitude = finiteCoordinate(candidate.longitude);
  if (latitude === null || longitude === null) return null;
  return hashNormalizedAddress(
    `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
  );
}

function hasLocationIdentity(candidate: LocationCandidate | null): boolean {
  if (!candidate) return false;
  return candidateHash(candidate) !== null;
}

function unresolved(
  source: Exclude<ResolvedLocationSource, "studio">,
): ResolvedLocation {
  return {
    key: `unresolved:${source}`,
    source,
    latitude: null,
    longitude: null,
    addressHash: null,
  };
}

function resolved(
  source: ResolvedLocationSource,
  candidate: LocationCandidate | null,
): ResolvedLocation {
  if (!candidate) {
    if (source === "studio") {
      return {
        key: "studio:unknown",
        source,
        latitude: null,
        longitude: null,
        addressHash: null,
      };
    }
    return unresolved(source);
  }

  const addressHash = candidateHash(candidate);
  if (!addressHash) {
    if (source === "studio") {
      return {
        key: "studio:unknown",
        source,
        latitude: null,
        longitude: null,
        addressHash: null,
      };
    }
    return unresolved(source);
  }

  return {
    key: `${source}:${addressHash}`,
    source,
    latitude: finiteCoordinate(candidate.latitude),
    longitude: finiteCoordinate(candidate.longitude),
    addressHash,
  };
}

export function resolveAppointmentLocation(
  input: LocationResolutionInput,
): ResolvedLocation {
  if (input.mode === "studio") return resolved("studio", input.studio);
  if (input.mode === "patient") return resolved("patient", input.patient);
  if (input.mode === "custom") return resolved("custom", input.custom);

  if (hasLocationIdentity(input.custom)) {
    return resolved("custom", input.custom);
  }
  if (hasLocationIdentity(input.patient)) {
    return resolved("patient", input.patient);
  }
  return resolved("studio", input.studio);
}
