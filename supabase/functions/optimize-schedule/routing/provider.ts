import type { TravelMode } from "./types.ts";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface ProviderLocation extends Coordinate {
  key: string;
}

export interface ProviderLeg {
  seconds: number;
  meters: number;
}

export type ProviderMatrix = Record<string, Record<string, ProviderLeg>>;

export interface RoutingProvider {
  geocode(address: string): Promise<Coordinate | null>;
  matrix(
    profile: TravelMode,
    locations: ProviderLocation[],
  ): Promise<ProviderMatrix>;
}

export class RoutingProviderError extends Error {
  readonly code: "quota" | "unavailable" | "invalid_response";

  constructor(
    code: RoutingProviderError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RoutingProviderError";
    this.code = code;
  }
}

interface ProviderOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

const MAX_MATRIX_ROUTES = 3500;

function validCoordinate(
  latitude: unknown,
  longitude: unknown,
): Coordinate | null {
  return typeof latitude === "number" &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      typeof longitude === "number" &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180
    ? { latitude, longitude }
    : null;
}

export function createOpenRouteServiceProvider(
  options: ProviderOptions = {},
): RoutingProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.openrouteservice.org";

  function apiKey(): string {
    const value = options.apiKey ?? Deno.env.get("OPENROUTESERVICE_API_KEY");
    if (!value) {
      throw new RoutingProviderError(
        "unavailable",
        "routing provider is not configured",
      );
    }
    return value;
  }

  async function request(
    url: string,
    init: RequestInit,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: apiKey(),
        },
      });
    } catch {
      throw new RoutingProviderError(
        "unavailable",
        "routing provider unavailable",
      );
    }
    if (!response.ok) {
      if (response.status === 429) {
        throw new RoutingProviderError(
          "quota",
          "routing provider quota unavailable",
        );
      }
      throw new RoutingProviderError(
        "unavailable",
        "routing provider unavailable",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new RoutingProviderError(
        "invalid_response",
        "routing provider returned an invalid response",
      );
    }
  }

  async function matrixBatch(
    profile: TravelMode,
    locations: ProviderLocation[],
    sourceIndexes: number[],
    destinationIndexes: number[],
    includeIndexes: boolean,
  ): Promise<ProviderMatrix> {
    const payload: Record<string, unknown> = {
      locations: locations.map((location) => [
        location.longitude,
        location.latitude,
      ]),
      metrics: ["duration", "distance"],
    };
    if (includeIndexes) {
      payload.sources = sourceIndexes.map(String);
      payload.destinations = destinationIndexes.map(String);
    }
    const body = await request(
      `${baseUrl}/v2/matrix/${profile}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ) as {
      durations?: Array<Array<number | null>>;
      distances?: Array<Array<number | null>>;
    };
    if (
      !Array.isArray(body.durations) ||
      !Array.isArray(body.distances)
    ) {
      throw new RoutingProviderError(
        "invalid_response",
        "routing provider returned an invalid response",
      );
    }

    const result: ProviderMatrix = {};
    for (
      let sourcePosition = 0;
      sourcePosition < sourceIndexes.length;
      sourcePosition++
    ) {
      const sourceIndex = sourceIndexes[sourcePosition];
      const origin = locations[sourceIndex];
      result[origin.key] ??= {};
      for (
        let destinationPosition = 0;
        destinationPosition < destinationIndexes.length;
        destinationPosition++
      ) {
        const destinationIndex = destinationIndexes[destinationPosition];
        const seconds = body.durations[sourcePosition]?.[destinationPosition];
        const meters = body.distances[sourcePosition]?.[destinationPosition];
        if (
          typeof seconds !== "number" ||
          !Number.isFinite(seconds) ||
          seconds < 0 ||
          typeof meters !== "number" ||
          !Number.isFinite(meters) ||
          meters < 0
        ) continue;
        result[origin.key][locations[destinationIndex].key] = {
          seconds,
          meters,
        };
      }
    }
    return result;
  }

  function mergeMatrix(
    target: ProviderMatrix,
    source: ProviderMatrix,
  ): void {
    for (const [origin, destinations] of Object.entries(source)) {
      target[origin] = { ...(target[origin] ?? {}), ...destinations };
    }
  }

  return {
    async geocode(address) {
      const body = await request(
        `${baseUrl}/geocode/search?text=${encodeURIComponent(address)}&size=1`,
        { method: "GET" },
      ) as {
        features?: Array<{ geometry?: { coordinates?: unknown[] } }>;
      };
      const coordinates = body.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordinates)) return null;
      return validCoordinate(coordinates[1], coordinates[0]);
    },

    async matrix(profile, locations) {
      if (locations.length === 0) return {};
      if (
        locations.some((location) =>
          validCoordinate(location.latitude, location.longitude) === null
        )
      ) {
        throw new RoutingProviderError(
          "invalid_response",
          "routing provider returned an invalid response",
        );
      }
      const indexes = locations.map((_, index) => index);
      if (locations.length * locations.length <= MAX_MATRIX_ROUTES) {
        return await matrixBatch(
          profile,
          locations,
          indexes,
          indexes,
          false,
        );
      }

      const result: ProviderMatrix = {};
      const destinationChunkSize = locations.length <= MAX_MATRIX_ROUTES
        ? locations.length
        : Math.floor(Math.sqrt(MAX_MATRIX_ROUTES));
      for (
        let destinationStart = 0;
        destinationStart < indexes.length;
        destinationStart += destinationChunkSize
      ) {
        const destinations = indexes.slice(
          destinationStart,
          destinationStart + destinationChunkSize,
        );
        const sourceChunkSize = Math.max(
          1,
          Math.floor(MAX_MATRIX_ROUTES / destinations.length),
        );
        for (
          let sourceStart = 0;
          sourceStart < indexes.length;
          sourceStart += sourceChunkSize
        ) {
          const sources = indexes.slice(
            sourceStart,
            sourceStart + sourceChunkSize,
          );
          mergeMatrix(
            result,
            await matrixBatch(
              profile,
              locations,
              sources,
              destinations,
              true,
            ),
          );
        }
      }
      return result;
    },
  };
}
