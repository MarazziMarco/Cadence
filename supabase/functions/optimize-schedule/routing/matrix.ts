import {
  createSupabaseRouteCache,
  type RouteCache,
  type RouteCacheGet,
  type RouteCacheRecord,
} from "./cache.ts";
import { chooseTravelMode } from "./mode.ts";
import {
  type Coordinate,
  createOpenRouteServiceProvider,
  type ProviderLeg,
  type ProviderLocation,
  type RoutingProvider,
} from "./provider.ts";
import { resolveAppointmentLocation } from "./location.ts";
import type {
  AppointmentLocationMode,
  LocationCandidate,
  ResolvedLocation,
  TravelMode,
} from "./types.ts";

export interface TravelLeg {
  seconds: number;
  meters: number;
  mode:
    | "studio"
    | "fallback"
    | "foot-walking"
    | "driving-car";
  verifiable: boolean;
}

export type TravelMatrix = Record<string, Record<string, TravelLeg>>;

export interface RoutingLocation extends ResolvedLocation {
  address?: string | null;
}

export interface RoutingConfig {
  walkingThresholdMinutes: number;
  unknownStudioLegMinutes: number;
  plausibleWalkingMeters: number;
  cacheTtlDays: number;
}

export interface PreparedTravelMatrix {
  studioLocation: RoutingLocation;
  locations: RoutingLocation[];
  matrix: TravelMatrix;
}

interface PrepareMatrixArgs {
  businessId: string;
  studio: RoutingLocation;
  locations: RoutingLocation[];
  cache: RouteCache;
  provider: RoutingProvider;
  config: RoutingConfig;
  now?: Date;
}

interface Pair {
  origin: RoutingLocation;
  destination: RoutingLocation;
}

const BLOCKED_LEG: TravelLeg = {
  seconds: 0,
  meters: 0,
  mode: "driving-car",
  verifiable: false,
};

function hasCoordinates(
  location: RoutingLocation,
): location is RoutingLocation & Coordinate {
  return location.latitude !== null && location.longitude !== null;
}

function haversineMeters(
  origin: RoutingLocation & Coordinate,
  destination: RoutingLocation & Coordinate,
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(destination.latitude - origin.latitude);
  const dLng = radians(destination.longitude - origin.longitude);
  const lat1 = radians(origin.latitude);
  const lat2 = radians(destination.latitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function uniqueLocations(locations: RoutingLocation[]): RoutingLocation[] {
  return [...new Map(locations.map((location) => [location.key, location]))
    .values()];
}

async function geocodeLocations(
  locations: RoutingLocation[],
  provider: RoutingProvider,
): Promise<RoutingLocation[]> {
  const byHash = new Map<string, Promise<Coordinate | null>>();
  return await Promise.all(locations.map(async (location) => {
    if (
      hasCoordinates(location) ||
      !location.addressHash ||
      !location.address
    ) return location;
    let pending = byHash.get(location.addressHash);
    if (!pending) {
      pending = provider.geocode(location.address).catch(() => null);
      byHash.set(location.addressHash, pending);
    }
    const coordinate = await pending;
    return coordinate ? { ...location, ...coordinate } : location;
  }));
}

function cacheQuery(
  businessId: string,
  pair: Pair,
  profile: TravelMode,
  now: Date,
) {
  if (!pair.origin.addressHash || !pair.destination.addressHash) return null;
  return {
    businessId,
    originHash: pair.origin.addressHash,
    destinationHash: pair.destination.addressHash,
    profile,
    now,
  };
}

function legFromCache(
  row: RouteCacheRecord,
): TravelLeg {
  return {
    seconds: row.duration_seconds,
    meters: row.distance_meters,
    mode: row.profile,
    verifiable: true,
  };
}

function legFromProvider(
  profile: TravelMode,
  leg: ProviderLeg,
): TravelLeg {
  return {
    seconds: leg.seconds,
    meters: leg.meters,
    mode: profile,
    verifiable: true,
  };
}

async function safeCacheGet(
  cache: RouteCache,
  query: RouteCacheGet,
): Promise<RouteCacheRecord | null> {
  try {
    return await cache.get(query);
  } catch {
    return null;
  }
}

async function safeCachePut(
  cache: RouteCache,
  record: RouteCacheRecord,
): Promise<void> {
  try {
    await cache.put(record);
  } catch {
    // Route results remain usable even when the best-effort cache write fails.
  }
}

function cacheRecord(
  businessId: string,
  pair: Pair,
  profile: TravelMode,
  leg: ProviderLeg,
  now: Date,
  ttlDays: number,
): RouteCacheRecord | null {
  if (
    !pair.origin.addressHash ||
    !pair.destination.addressHash ||
    !hasCoordinates(pair.origin) ||
    !hasCoordinates(pair.destination)
  ) return null;
  return {
    business_id: businessId,
    origin_hash: pair.origin.addressHash,
    destination_hash: pair.destination.addressHash,
    origin_latitude: pair.origin.latitude,
    origin_longitude: pair.origin.longitude,
    destination_latitude: pair.destination.latitude,
    destination_longitude: pair.destination.longitude,
    profile,
    duration_seconds: leg.seconds,
    distance_meters: leg.meters,
    provider: "openrouteservice",
    fetched_at: now.toISOString(),
    expires_at: new Date(
      now.getTime() + ttlDays * 24 * 60 * 60 * 1_000,
    ).toISOString(),
  };
}

function pairKey(pair: Pair): string {
  return `${pair.origin.key}>${pair.destination.key}`;
}

function hydrateCachedCoordinates(
  locations: Map<string, RoutingLocation>,
  pair: Pair,
  row: RouteCacheRecord,
): void {
  locations.set(pair.origin.key, {
    ...pair.origin,
    latitude: row.origin_latitude,
    longitude: row.origin_longitude,
  });
  locations.set(pair.destination.key, {
    ...pair.destination,
    latitude: row.destination_latitude,
    longitude: row.destination_longitude,
  });
}

async function preloadUnresolvedCache(
  businessId: string,
  rawLocations: RoutingLocation[],
  cache: RouteCache,
  config: RoutingConfig,
  now: Date,
): Promise<{
  locations: RoutingLocation[];
  legs: Map<string, TravelLeg>;
}> {
  const locations = new Map(
    rawLocations.map((location) => [location.key, { ...location }]),
  );
  const legs = new Map<string, TravelLeg>();

  for (const originValue of rawLocations) {
    for (const destinationValue of rawLocations) {
      if (
        originValue.key === destinationValue.key ||
        (hasCoordinates(originValue) && hasCoordinates(destinationValue))
      ) continue;
      const origin = locations.get(originValue.key) ?? originValue;
      const destination = locations.get(destinationValue.key) ??
        destinationValue;
      const pair = { origin, destination };
      const walkingQuery = cacheQuery(
        businessId,
        pair,
        "foot-walking",
        now,
      );
      if (!walkingQuery) continue;

      const walking = await safeCacheGet(cache, walkingQuery);
      if (walking) {
        hydrateCachedCoordinates(locations, pair, walking);
        if (
          chooseTravelMode(
            walking.duration_seconds,
            config.walkingThresholdMinutes,
          ) === "foot-walking"
        ) {
          legs.set(pairKey(pair), legFromCache(walking));
          continue;
        }
      }

      const driving = await safeCacheGet(cache, {
        ...walkingQuery,
        profile: "driving-car",
      });
      if (driving) {
        hydrateCachedCoordinates(locations, pair, driving);
        legs.set(pairKey(pair), legFromCache(driving));
      }
    }
  }

  return { locations: [...locations.values()], legs };
}

function providerLocations(pairs: Pair[]): ProviderLocation[] {
  return uniqueLocations(
    pairs.flatMap((pair) => [pair.origin, pair.destination]),
  ).filter(hasCoordinates).map((location) => ({
    key: location.key,
    latitude: location.latitude,
    longitude: location.longitude,
  }));
}

async function resolveProfile(
  args: PrepareMatrixArgs,
  pairs: Pair[],
  profile: TravelMode,
  result: Map<string, TravelLeg>,
  now: Date,
): Promise<Pair[]> {
  const missing: Pair[] = [];
  for (const pair of pairs) {
    const query = cacheQuery(args.businessId, pair, profile, now);
    const hit = query ? await safeCacheGet(args.cache, query) : null;
    if (hit) {
      result.set(
        `${pair.origin.key}>${pair.destination.key}`,
        legFromCache(hit),
      );
    } else missing.push(pair);
  }
  if (missing.length === 0) return [];

  let batch: Awaited<ReturnType<RoutingProvider["matrix"]>> | null = null;
  try {
    batch = await args.provider.matrix(profile, providerLocations(missing));
  } catch {
    batch = null;
  }

  const unresolved: Pair[] = [];
  for (const pair of missing) {
    const key = `${pair.origin.key}>${pair.destination.key}`;
    const providerLeg = batch?.[pair.origin.key]?.[pair.destination.key];
    if (providerLeg) {
      result.set(key, legFromProvider(profile, providerLeg));
      const row = cacheRecord(
        args.businessId,
        pair,
        profile,
        providerLeg,
        now,
        args.config.cacheTtlDays,
      );
      if (row) await safeCachePut(args.cache, row);
      continue;
    }
    // A concurrent worker may have populated the cache while the provider was
    // failing or rate-limited. Re-read before declaring the leg unavailable.
    const query = cacheQuery(args.businessId, pair, profile, now);
    const retry = query ? await safeCacheGet(args.cache, query) : null;
    if (retry) result.set(key, legFromCache(retry));
    else unresolved.push(pair);
  }
  return unresolved;
}

export async function prepareTravelMatrix(
  args: PrepareMatrixArgs,
): Promise<PreparedTravelMatrix> {
  const now = args.now ?? new Date();
  const cached = await preloadUnresolvedCache(
    args.businessId,
    uniqueLocations([args.studio, ...args.locations]),
    args.cache,
    args.config,
    now,
  );
  const geocoded = await geocodeLocations(
    cached.locations,
    args.provider,
  );
  const studioLocation =
    geocoded.find((location) => location.key === args.studio.key) ??
      args.studio;
  const locations = geocoded.filter((location) =>
    location.key !== studioLocation.key
  );
  const all = [studioLocation, ...locations];
  const matrix: TravelMatrix = Object.fromEntries(
    all.map((origin) => [origin.key, {}]),
  );
  const routeResults = new Map(cached.legs);
  const walkingPairs: Pair[] = [];
  const drivingPairs: Pair[] = [];

  for (const origin of all) {
    for (const destination of all) {
      if (origin.key === destination.key) {
        matrix[origin.key][destination.key] = {
          seconds: 0,
          meters: 0,
          mode: "studio",
          verifiable: true,
        };
        continue;
      }
      if (
        origin.source === "studio" &&
        destination.source === "studio"
      ) {
        matrix[origin.key][destination.key] = {
          seconds: 0,
          meters: 0,
          mode: "studio",
          verifiable: true,
        };
        continue;
      }
      const cachedLeg = routeResults.get(`${origin.key}>${destination.key}`);
      if (cachedLeg) {
        matrix[origin.key][destination.key] = cachedLeg;
        continue;
      }
      if (!hasCoordinates(origin) || !hasCoordinates(destination)) {
        const studioLeg = origin.source === "studio" ||
          destination.source === "studio";
        matrix[origin.key][destination.key] = studioLeg
          ? {
            seconds: args.config.unknownStudioLegMinutes * 60,
            meters: 0,
            mode: "fallback",
            verifiable: true,
          }
          : BLOCKED_LEG;
        continue;
      }
      const pair = { origin, destination };
      if (
        haversineMeters(origin, destination) <=
          args.config.plausibleWalkingMeters
      ) walkingPairs.push(pair);
      else drivingPairs.push(pair);
    }
  }

  const unresolvedWalking = await resolveProfile(
    args,
    walkingPairs,
    "foot-walking",
    routeResults,
    now,
  );
  for (const pair of walkingPairs) {
    const key = `${pair.origin.key}>${pair.destination.key}`;
    const walking = routeResults.get(key);
    if (
      walking &&
      chooseTravelMode(
          walking.seconds,
          args.config.walkingThresholdMinutes,
        ) === "foot-walking"
    ) {
      matrix[pair.origin.key][pair.destination.key] = walking;
    } else {
      drivingPairs.push(pair);
      routeResults.delete(key);
    }
  }
  // Walking provider failures also proceed to driving. If driving fails and no
  // fresh cache appeared, the external leg remains blocked.
  for (const pair of unresolvedWalking) {
    if (!drivingPairs.includes(pair)) drivingPairs.push(pair);
  }

  const unresolvedDriving = await resolveProfile(
    args,
    drivingPairs,
    "driving-car",
    routeResults,
    now,
  );
  const unresolvedKeys = new Set(
    unresolvedDriving.map((pair) =>
      `${pair.origin.key}>${pair.destination.key}`
    ),
  );
  for (const pair of drivingPairs) {
    const key = `${pair.origin.key}>${pair.destination.key}`;
    matrix[pair.origin.key][pair.destination.key] = unresolvedKeys.has(key)
      ? BLOCKED_LEG
      : routeResults.get(key) ?? BLOCKED_LEG;
  }

  return { studioLocation, locations, matrix };
}

interface RoutingInputShape {
  context: {
    business_id: string;
  };
  appointments: Array<{ id: string }>;
}

interface BusinessLocationRow {
  id: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
}

interface AppointmentLocationRow {
  id: string;
  patient_id: string;
  location_mode: string | null;
  location_address: string | null;
  location_city: string | null;
  location_postal_code: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  location_address_hash: string | null;
}

interface PatientLocationRow {
  id: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
}

interface QueryResult<T> {
  data: T | null;
  error: unknown;
}

interface LocationQueryBuilder<T> extends PromiseLike<QueryResult<T[]>> {
  eq(key: string, value: unknown): LocationQueryBuilder<T>;
  is(key: string, value: unknown): LocationQueryBuilder<T>;
  in(key: string, value: unknown[]): LocationQueryBuilder<T>;
  maybeSingle(): Promise<QueryResult<T>>;
}

interface RoutingDependencies {
  cache?: RouteCache;
  provider?: RoutingProvider;
}

function composeAddress(
  address: string | null | undefined,
  city: string | null | undefined,
  postalCode: string | null | undefined,
): string | null {
  const parts = [address, city, postalCode]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function locationMode(value: string | null): AppointmentLocationMode {
  return value === "studio" ||
      value === "patient" ||
      value === "custom"
    ? value
    : "inherit";
}

function withAddress(
  resolved: ResolvedLocation,
  candidates: {
    studio: LocationCandidate | null;
    patient: LocationCandidate | null;
    custom: LocationCandidate | null;
  },
): RoutingLocation {
  const candidate = candidates[resolved.source];
  return {
    ...resolved,
    address: candidate?.address ?? null,
  };
}

export async function prepareRoutingInput<T extends RoutingInputShape>(
  supabase: Parameters<typeof createSupabaseRouteCache>[0],
  input: T,
  config: RoutingConfig,
  dependencies: RoutingDependencies = {},
): Promise<
  T & {
    studio_location_key: string;
    travel_matrix: TravelMatrix;
    appointments: Array<
      T["appointments"][number] & { location_key: string }
    >;
  }
> {
  const businessQuery = supabase
    .from("business")
    .select(
      "id, address, city, postal_code, location_latitude, location_longitude",
    ) as LocationQueryBuilder<
      BusinessLocationRow
    >;
  const { data: business, error: businessError } = await businessQuery
    .eq("id", input.context.business_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (businessError || !business) {
    throw new Error("routing business location unavailable");
  }

  const studioAddress = composeAddress(
    business.address,
    business.city,
    business.postal_code,
  );
  const studioCandidate: LocationCandidate = {
    address: studioAddress,
    latitude: business.location_latitude,
    longitude: business.location_longitude,
  };
  const studio = withAddress(
    resolveAppointmentLocation({
      mode: "studio",
      studio: studioCandidate,
      patient: null,
      custom: null,
    }),
    { studio: studioCandidate, patient: null, custom: null },
  );

  const appointmentIds = input.appointments.map((appointment) =>
    appointment.id
  );
  if (appointmentIds.length === 0) {
    return {
      ...input,
      appointments: [],
      studio_location_key: studio.key,
      travel_matrix: {
        [studio.key]: {
          [studio.key]: {
            seconds: 0,
            meters: 0,
            mode: "studio",
            verifiable: true,
          },
        },
      },
    };
  }

  const appointmentQuery = supabase
    .from("appointments")
    .select(
      "id, patient_id, location_mode, location_address, location_city, location_postal_code, location_latitude, location_longitude, location_address_hash",
    ) as LocationQueryBuilder<AppointmentLocationRow>;
  const { data: appointmentRows, error: appointmentError } =
    await appointmentQuery
      .eq("business_id", input.context.business_id)
      .in("id", appointmentIds)
      .is("deleted_at", null);
  if (
    appointmentError ||
    (appointmentRows?.length ?? 0) !== appointmentIds.length
  ) {
    throw new Error("routing appointment locations unavailable");
  }

  const patientIds = [
    ...new Set(
      (appointmentRows ?? []).map((appointment) => appointment.patient_id),
    ),
  ];
  const patientQuery = supabase
    .from("patients")
    .select("id, address, city, postal_code") as LocationQueryBuilder<
      PatientLocationRow
    >;
  const { data: patientRows, error: patientError } = patientIds.length > 0
    ? await patientQuery
      .eq("business_id", input.context.business_id)
      .in("id", patientIds)
      .is("deleted_at", null)
    : { data: [], error: null };
  if (patientError) {
    throw new Error("routing patient locations unavailable");
  }

  const patientsById = new Map(
    (patientRows ?? []).map((patient) => [patient.id, patient]),
  );
  const appointmentsById = new Map(
    (appointmentRows ?? []).map((appointment) => [
      appointment.id,
      appointment,
    ]),
  );
  const appointmentLocations = new Map<string, RoutingLocation>();
  for (const appointment of appointmentRows ?? []) {
    const patient = patientsById.get(appointment.patient_id);
    const patientCandidate: LocationCandidate | null = patient
      ? {
        address: composeAddress(
          patient.address,
          patient.city,
          patient.postal_code,
        ),
        latitude: null,
        longitude: null,
      }
      : null;
    const customCandidate: LocationCandidate = {
      address: composeAddress(
        appointment.location_address,
        appointment.location_city,
        appointment.location_postal_code,
      ),
      addressHash: appointment.location_address_hash,
      latitude: appointment.location_latitude,
      longitude: appointment.location_longitude,
    };
    const candidates = {
      studio: studioCandidate,
      patient: patientCandidate,
      custom: customCandidate,
    };
    appointmentLocations.set(
      appointment.id,
      withAddress(
        resolveAppointmentLocation({
          mode: locationMode(appointment.location_mode),
          ...candidates,
        }),
        candidates,
      ),
    );
  }

  const locations = input.appointments.map((appointment) => {
    const row = appointmentsById.get(appointment.id);
    return row ? appointmentLocations.get(row.id) ?? studio : studio;
  });
  const prepared = await prepareTravelMatrix({
    businessId: input.context.business_id,
    studio,
    locations,
    cache: dependencies.cache ?? createSupabaseRouteCache(supabase),
    provider: dependencies.provider ?? createOpenRouteServiceProvider(),
    config,
  });
  return {
    ...input,
    appointments: input.appointments.map((appointment) => ({
      ...appointment,
      location_key: (appointmentLocations.get(appointment.id) ?? studio).key,
    })),
    studio_location_key: prepared.studioLocation.key,
    travel_matrix: prepared.matrix,
  };
}
