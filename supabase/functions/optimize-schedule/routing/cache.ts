import type { TravelMode } from "./types.ts";

export interface RouteCacheRecord {
  business_id: string;
  origin_hash: string;
  destination_hash: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  profile: TravelMode;
  duration_seconds: number;
  distance_meters: number;
  provider: string;
  fetched_at: string;
  expires_at: string;
}

export interface RouteCacheGet {
  businessId: string;
  originHash: string;
  destinationHash: string;
  profile: TravelMode;
  now: Date;
}

export interface RouteCache {
  get(query: RouteCacheGet): Promise<RouteCacheRecord | null>;
  put(record: RouteCacheRecord): Promise<void>;
}

export function directedRouteCacheKey(
  originHash: string,
  destinationHash: string,
  profile: TravelMode,
): string {
  return `${originHash}>${destinationHash}:${profile}`;
}

interface SupabaseLike {
  from(table: string): {
    select(columns: string): unknown;
    upsert(
      values: RouteCacheRecord,
      options: { onConflict: string },
    ): PromiseLike<{ error: unknown }>;
  };
}

interface CacheQueryBuilder {
  eq(key: string, value: unknown): CacheQueryBuilder;
  maybeSingle(): Promise<{ data: RouteCacheRecord | null; error: unknown }>;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function validMetric(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validCoordinate(
  latitude: number,
  longitude: number,
): boolean {
  return Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;
}

function validRecord(record: RouteCacheRecord): boolean {
  return validCoordinate(record.origin_latitude, record.origin_longitude) &&
    validCoordinate(
      record.destination_latitude,
      record.destination_longitude,
    ) &&
    validMetric(record.duration_seconds) &&
    validMetric(record.distance_meters) &&
    Number.isFinite(Date.parse(record.fetched_at)) &&
    Number.isFinite(Date.parse(record.expires_at)) &&
    Date.parse(record.expires_at) > Date.parse(record.fetched_at);
}

function normalizedRecord(record: RouteCacheRecord): RouteCacheRecord {
  if (!validRecord(record)) throw new Error("invalid route cache record");
  return {
    ...record,
    origin_latitude: roundCoordinate(record.origin_latitude),
    origin_longitude: roundCoordinate(record.origin_longitude),
    destination_latitude: roundCoordinate(record.destination_latitude),
    destination_longitude: roundCoordinate(record.destination_longitude),
  };
}

export function createSupabaseRouteCache(
  supabase: SupabaseLike,
): RouteCache {
  return {
    async get(query) {
      const builder = supabase
        .from("route_cache")
        .select(
          "business_id, origin_hash, destination_hash, origin_latitude, origin_longitude, destination_latitude, destination_longitude, profile, duration_seconds, distance_meters, provider, fetched_at, expires_at",
        ) as CacheQueryBuilder;
      const { data, error } = await builder
        .eq("business_id", query.businessId)
        .eq("origin_hash", query.originHash)
        .eq("destination_hash", query.destinationHash)
        .eq("profile", query.profile)
        .maybeSingle();
      if (error) throw new Error("route cache read failed");
      if (
        !data ||
        !validRecord(data) ||
        Date.parse(data.expires_at) <= query.now.getTime()
      ) {
        return null;
      }
      return data;
    },

    async put(record) {
      const { error } = await supabase.from("route_cache").upsert(
        normalizedRecord(record),
        {
          onConflict: "business_id,origin_hash,destination_hash,profile",
        },
      );
      if (error) throw new Error("route cache write failed");
    },
  };
}
