/// <reference lib="deno.ns" />

import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  createSupabaseRouteCache,
  directedRouteCacheKey,
  type RouteCacheRecord,
} from "../routing/cache.ts";
import {
  prepareRoutingInput,
  prepareTravelMatrix,
  type RoutingLocation,
} from "../routing/matrix.ts";
import { hashNormalizedAddress } from "../routing/location.ts";
import {
  createOpenRouteServiceProvider,
  type ProviderLocation,
  type RoutingProvider,
  RoutingProviderError,
} from "../routing/provider.ts";

const NOW = new Date("2026-07-16T12:00:00.000Z");

const studio: RoutingLocation = {
  key: "studio:a",
  source: "studio",
  latitude: 41.9028,
  longitude: 12.4964,
  addressHash: "aaaaaaaaaaaaaaaa",
};

const patientA: RoutingLocation = {
  key: "patient:b",
  source: "patient",
  latitude: 41.903,
  longitude: 12.497,
  addressHash: "bbbbbbbbbbbbbbbb",
};

const patientB: RoutingLocation = {
  key: "patient:c",
  source: "patient",
  latitude: 41.93,
  longitude: 12.53,
  addressHash: "cccccccccccccccc",
};

function cached(
  originHash: string,
  destinationHash: string,
  profile: "foot-walking" | "driving-car",
  seconds: number,
  expiresAt = "2026-08-15T12:00:00.000Z",
): RouteCacheRecord {
  return {
    business_id: "business-1",
    origin_hash: originHash,
    destination_hash: destinationHash,
    origin_latitude: 41.9028,
    origin_longitude: 12.4964,
    destination_latitude: 41.903,
    destination_longitude: 12.497,
    profile,
    duration_seconds: seconds,
    distance_meters: 500.125,
    provider: "openrouteservice",
    fetched_at: NOW.toISOString(),
    expires_at: expiresAt,
  };
}

Deno.test("route cache keys are directed and fresh Supabase hits are returned", async () => {
  assertNotEquals(
    directedRouteCacheKey("a", "b", "driving-car"),
    directedRouteCacheKey("b", "a", "driving-car"),
  );

  const row = cached("a", "b", "driving-car", 300);
  const queries: Array<{ table: string; filters: Record<string, unknown> }> =
    [];
  const supabase = fakeSupabase(row, queries);
  const cache = createSupabaseRouteCache(supabase);

  assertEquals(
    await cache.get({
      businessId: "business-1",
      originHash: "a",
      destinationHash: "b",
      profile: "driving-car",
      now: NOW,
    }),
    row,
  );
  assertEquals(queries[0], {
    table: "route_cache",
    filters: {
      business_id: "business-1",
      origin_hash: "a",
      destination_hash: "b",
      profile: "driving-car",
    },
  });
});

Deno.test("expired cache rows are ignored", async () => {
  const cache = createSupabaseRouteCache(
    fakeSupabase(cached(
      "a",
      "b",
      "driving-car",
      300,
      "2026-07-15T12:00:00.000Z",
    )),
  );

  assertEquals(
    await cache.get({
      businessId: "business-1",
      originHash: "a",
      destinationHash: "b",
      profile: "driving-car",
      now: NOW,
    }),
    null,
  );
});

Deno.test("route cache adapter reads schema coordinates and writes five-decimal decimal metrics", async () => {
  const upserts: RouteCacheRecord[] = [];
  const row = cached("a", "b", "driving-car", 300.25);
  const cache = createSupabaseRouteCache(
    fakeSupabase(row, [], upserts),
  );

  assertEquals(
    await cache.get({
      businessId: "business-1",
      originHash: "a",
      destinationHash: "b",
      profile: "driving-car",
      now: NOW,
    }),
    row,
  );

  await cache.put({
    ...row,
    origin_latitude: 41.9028123,
    origin_longitude: 12.4964123,
    destination_latitude: 41.9030456,
    destination_longitude: 12.4970789,
    duration_seconds: 300.375,
    distance_meters: 500.625,
  });

  assertEquals(upserts[0].origin_latitude, 41.90281);
  assertEquals(upserts[0].origin_longitude, 12.49641);
  assertEquals(upserts[0].destination_latitude, 41.90305);
  assertEquals(upserts[0].destination_longitude, 12.49708);
  assertEquals(upserts[0].duration_seconds, 300.375);
  assertEquals(upserts[0].distance_meters, 500.625);
});

Deno.test("matrix preparation uses a directed cache hit without calling ORS", async () => {
  let matrixCalls = 0;
  const cache = memoryCache([
    cached(
      studio.addressHash!,
      patientB.addressHash!,
      "driving-car",
      360,
    ),
    cached(
      patientB.addressHash!,
      studio.addressHash!,
      "driving-car",
      420,
    ),
  ]);
  const result = await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [patientB],
    cache,
    provider: {
      geocode: async () => null,
      matrix: async () => {
        matrixCalls++;
        throw new Error("should not call provider");
      },
    },
    config: defaults(),
    now: NOW,
  });

  assertEquals(matrixCalls, 0);
  assertEquals(result.matrix[studio.key][patientB.key].seconds, 360);
  assertEquals(result.matrix[patientB.key][studio.key].seconds, 420);
});

Deno.test("cached coordinates avoid repeated geocoding before provider routing", async () => {
  const cachedStudioToPatient = {
    ...cached(
      studio.addressHash!,
      patientA.addressHash!,
      "foot-walking",
      300,
    ),
    origin_latitude: studio.latitude!,
    origin_longitude: studio.longitude!,
    destination_latitude: patientA.latitude!,
    destination_longitude: patientA.longitude!,
  };
  const cachedPatientToStudio = {
    ...cached(
      patientA.addressHash!,
      studio.addressHash!,
      "foot-walking",
      320,
    ),
    origin_latitude: patientA.latitude!,
    origin_longitude: patientA.longitude!,
    destination_latitude: studio.latitude!,
    destination_longitude: studio.longitude!,
  };
  let geocodeCalls = 0;
  let matrixCalls = 0;
  const unresolvedStudio = {
    ...studio,
    latitude: null,
    longitude: null,
    address: "Studio private address",
  };
  const unresolvedPatient = {
    ...patientA,
    latitude: null,
    longitude: null,
    address: "Patient private address",
  };

  const result = await prepareTravelMatrix({
    businessId: "business-1",
    studio: unresolvedStudio,
    locations: [unresolvedPatient],
    cache: memoryCache([cachedStudioToPatient, cachedPatientToStudio]),
    provider: {
      geocode: async () => {
        geocodeCalls++;
        return null;
      },
      matrix: async () => {
        matrixCalls++;
        return {};
      },
    },
    config: defaults(),
    now: NOW,
  });

  assertEquals(geocodeCalls, 0);
  assertEquals(matrixCalls, 0);
  assertEquals(
    result.matrix[unresolvedStudio.key][unresolvedPatient.key].seconds,
    300,
  );
});

Deno.test("cache failures do not discard a valid provider route", async () => {
  const result = await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [patientA],
    cache: {
      async get() {
        throw new Error("temporary cache read failure");
      },
      async put() {
        throw new Error("temporary cache write failure");
      },
    },
    provider: providerStub({
      walkingSeconds: 300,
      drivingSeconds: 180,
    }),
    config: defaults(),
    now: NOW,
  });

  assertEquals(result.matrix[studio.key][patientA.key], {
    seconds: 300,
    meters: 500,
    mode: "foot-walking",
    verifiable: true,
  });
});

Deno.test("ORS provider geocodes and batches matrix requests without leaking secrets in errors", async () => {
  const requests: Request[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.includes("/geocode/search")) {
      return Response.json({
        features: [{ geometry: { coordinates: [12.5, 41.9] } }],
      });
    }
    return Response.json({
      durations: [[0, 420], [400, 0]],
      distances: [[0, 800], [750, 0]],
    });
  };
  const provider = createOpenRouteServiceProvider({
    apiKey: "super-secret",
    fetchFn,
  });

  assertEquals(await provider.geocode("Via privata 1"), {
    latitude: 41.9,
    longitude: 12.5,
  });
  const providerPoints = [studio, patientA].map((location) => ({
    key: location.key,
    latitude: location.latitude!,
    longitude: location.longitude!,
  }));
  const batch = await provider.matrix("foot-walking", providerPoints);
  assertEquals(batch[studio.key][patientA.key], {
    seconds: 420,
    meters: 800,
  });
  assertEquals(requests.length, 2);
  assertEquals(requests[1].url.includes("foot-walking"), true);
  assertEquals(requests[1].headers.get("authorization"), "super-secret");

  const quotaProvider = createOpenRouteServiceProvider({
    apiKey: "super-secret",
    fetchFn: async () => new Response("raw provider body", { status: 429 }),
  });
  const error = await assertRejects(
    () => quotaProvider.matrix("driving-car", providerPoints),
    RoutingProviderError,
    "routing provider quota unavailable",
  );
  assertEquals(error.message.includes("super-secret"), false);
  assertEquals(error.message.includes("raw provider body"), false);
});

Deno.test("ORS matrix splits more than 3500 directed routes and merges all batches", async () => {
  const routeCounts: number[] = [];
  const fetchFn: typeof fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as {
      locations: Array<[number, number]>;
      sources?: string[];
      destinations?: string[];
    };
    const sources = payload.sources ??
      payload.locations.map((_, index) => String(index));
    const destinations = payload.destinations ??
      payload.locations.map((_, index) => String(index));
    assert(sources.every((source) => typeof source === "string"));
    assert(
      destinations.every((destination) => typeof destination === "string"),
    );
    routeCounts.push(sources.length * destinations.length);
    return Response.json({
      durations: sources.map((source) =>
        destinations.map((destination) =>
          Number(source) * 1000 + Number(destination) + 0.5
        )
      ),
      distances: sources.map((source) =>
        destinations.map((destination) =>
          Number(source) * 100 + Number(destination) + 0.25
        )
      ),
    });
  };
  const provider = createOpenRouteServiceProvider({
    apiKey: "server-only-secret",
    fetchFn,
  });
  const locations = Array.from({ length: 60 }, (_, index) => ({
    key: `location-${index}`,
    latitude: 41 + index / 10_000,
    longitude: 12 + index / 10_000,
  }));

  const matrix = await provider.matrix("driving-car", locations);

  assert(routeCounts.length > 1);
  assert(routeCounts.every((count) => count <= 3500));
  assertEquals(matrix["location-0"]["location-59"], {
    seconds: 59.5,
    meters: 59.25,
  });
  assertEquals(matrix["location-59"]["location-0"], {
    seconds: 59000.5,
    meters: 5900.25,
  });
});

Deno.test("ORS ignores negative provider metrics and keeps errors address-safe", async () => {
  const privateAddress = "Via Segretissima 42";
  const provider = createOpenRouteServiceProvider({
    apiKey: "server-only-secret",
    fetchFn: async (input) => {
      const url = String(input);
      if (url.includes("/geocode/search")) {
        return new Response(privateAddress, { status: 503 });
      }
      return Response.json({
        durations: [[0, -1], [Number.NaN, 0]],
        distances: [[0, 50], [20, 0]],
      });
    },
  });

  const error = await assertRejects(
    () => provider.geocode(privateAddress),
    RoutingProviderError,
    "routing provider unavailable",
  );
  assertEquals(error.message.includes(privateAddress), false);

  const matrix = await provider.matrix("driving-car", [
    {
      key: "a",
      latitude: 41.9,
      longitude: 12.5,
    },
    {
      key: "b",
      latitude: 41.91,
      longitude: 12.51,
    },
  ]);
  assertEquals(matrix.a.b, undefined);
  assertEquals(matrix.b.a, undefined);
});

Deno.test("matrix preparation geocodes each unresolved address hash once", async () => {
  let geocodeCalls = 0;
  const unresolvedA: RoutingLocation = {
    key: "patient:u1",
    source: "patient",
    latitude: null,
    longitude: null,
    addressHash: "dddddddddddddddd",
    address: "Private input one",
  };
  const unresolvedB = { ...unresolvedA, key: "patient:u2" };
  const provider = providerStub({
    geocode: async () => {
      geocodeCalls++;
      return { latitude: 41.903, longitude: 12.497 };
    },
    walkingSeconds: 300,
  });

  await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [unresolvedA, unresolvedB],
    cache: memoryCache(),
    provider,
    config: defaults(),
    now: NOW,
  });

  assertEquals(geocodeCalls, 1);
});

Deno.test("plausibly close points walk at nine minutes and drive above it", async () => {
  const walking = await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [patientA],
    cache: memoryCache(),
    provider: providerStub({ walkingSeconds: 540, drivingSeconds: 180 }),
    config: defaults(),
    now: NOW,
  });
  assertEquals(walking.matrix[studio.key][patientA.key].mode, "foot-walking");

  const driving = await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [patientA],
    cache: memoryCache(),
    provider: providerStub({ walkingSeconds: 541, drivingSeconds: 180 }),
    config: defaults(),
    now: NOW,
  });
  assertEquals(driving.matrix[studio.key][patientA.key].mode, "driving-car");
});

Deno.test("fresh cache survives provider quota errors after an initial miss", async () => {
  const record = cached(
    studio.addressHash!,
    patientA.addressHash!,
    "driving-car",
    240,
  );
  let reads = 0;
  const cache = memoryCache([], () => {
    reads++;
    return reads >= 2 ? record : null;
  });
  const provider = providerStub({
    matrixError: new RoutingProviderError(
      "quota",
      "routing provider quota unavailable",
    ),
  });

  const result = await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [patientA],
    cache,
    provider,
    config: { ...defaults(), plausibleWalkingMeters: 0 },
    now: NOW,
  });

  assertEquals(result.matrix[studio.key][patientA.key].seconds, 240);
  assertEquals(result.matrix[studio.key][patientA.key].mode, "driving-car");
});

Deno.test("unknown studio legs use twenty minutes while unknown external routes block", async () => {
  const unknownStudio: RoutingLocation = {
    key: "studio:unknown",
    source: "studio",
    latitude: null,
    longitude: null,
    addressHash: null,
  };
  const fallback = await prepareTravelMatrix({
    businessId: "business-1",
    studio: unknownStudio,
    locations: [patientA],
    cache: memoryCache(),
    provider: providerStub({}),
    config: defaults(),
    now: NOW,
  });
  assertEquals(fallback.matrix[unknownStudio.key][patientA.key], {
    seconds: 1200,
    meters: 0,
    mode: "fallback",
    verifiable: true,
  });

  const blocked = await prepareTravelMatrix({
    businessId: "business-1",
    studio,
    locations: [patientA, patientB],
    cache: memoryCache(),
    provider: providerStub({
      matrixError: new RoutingProviderError(
        "unavailable",
        "routing provider unavailable",
      ),
    }),
    config: defaults(),
    now: NOW,
  });
  assertEquals(blocked.matrix[patientA.key][patientB.key].verifiable, false);
});

Deno.test("routing input resolves tenant business, appointment, and patient locations from the database", async () => {
  const input = {
    context: { business_id: "business-1" },
    appointments: [{
      id: "appointment-1",
      patient_id: "patient-1",
    }],
  };
  const queries: Array<{ table: string; filters: Record<string, unknown> }> =
    [];
  const supabase = locationSupabase({
    business: {
      id: "business-1",
      address: null,
      city: null,
      postal_code: null,
    },
    appointments: [{
      id: "appointment-1",
      patient_id: "patient-1",
      location_mode: "custom",
      location_address: "Via privata 10",
      location_city: "Roma",
      location_postal_code: "00100",
      location_latitude: 41.903,
      location_longitude: 12.497,
      location_address_hash: "dddddddddddddddd",
    }],
    patients: [{
      id: "patient-1",
      address: "Patient private address",
      city: "Roma",
      postal_code: "00100",
    }],
  }, queries);
  const routed = await prepareRoutingInput(
    supabase,
    input,
    defaults(),
  );

  assertEquals(routed.studio_location_key, "studio:unknown");
  assertEquals(
    routed.appointments[0].location_key,
    `custom:${hashNormalizedAddress("41.90300,12.49700")}`,
  );
  assertEquals(queries.map((query) => query.table), [
    "business",
    "appointments",
    "patients",
  ]);
  assertEquals(
    JSON.stringify(routed).includes("Via privata 10"),
    false,
  );
});

Deno.test("routing input uses approximate studio coordinates without a postal address", async () => {
  const queries: Array<{ table: string; filters: Record<string, unknown> }> =
    [];
  const selectedColumns: Record<string, string> = {};
  const matrixLocations: ProviderLocation[][] = [];
  let geocodeCalls = 0;
  const supabase = locationSupabase({
    business: {
      id: "business-1",
      address: null,
      city: null,
      postal_code: null,
      location_latitude: 41.90278,
      location_longitude: 12.49637,
    },
    appointments: [{
      id: "appointment-1",
      patient_id: "patient-1",
      location_mode: "custom",
      location_address: null,
      location_city: null,
      location_postal_code: null,
      location_latitude: 41.91,
      location_longitude: 12.5,
      location_address_hash: "dddddddddddddddd",
    }],
    patients: [{
      id: "patient-1",
      address: null,
      city: null,
      postal_code: null,
    }],
  }, queries, selectedColumns);

  const routed = await prepareRoutingInput(
    supabase,
    {
      context: { business_id: "business-1" },
      appointments: [{ id: "appointment-1" }],
    },
    defaults(),
    {
      cache: memoryCache(),
      provider: {
        geocode() {
          geocodeCalls++;
          return Promise.resolve(null);
        },
        matrix(_profile, locations) {
          matrixLocations.push(locations);
          return Promise.resolve(Object.fromEntries(locations.map((origin) => [
            origin.key,
            Object.fromEntries(locations.map((destination) => [
              destination.key,
              {
                seconds: origin.key === destination.key ? 0 : 300,
                meters: origin.key === destination.key ? 0 : 900,
              },
            ])),
          ])));
        },
      },
    },
  );

  assert(selectedColumns.business.includes("location_latitude"));
  assert(selectedColumns.business.includes("location_longitude"));
  assertEquals(geocodeCalls, 0);
  assert(matrixLocations.length > 0, "expected provider matrix routing");
  const studio = matrixLocations.flat().find((location) =>
    location.key === routed.studio_location_key
  );
  assertEquals(studio?.latitude, 41.90278);
  assertEquals(studio?.longitude, 12.49637);
  assertEquals(
    routed.travel_matrix[routed.studio_location_key][
      routed.appointments[0].location_key
    ].verifiable,
    true,
  );
});

Deno.test("changed explicit studio coordinates bypass stale address-keyed cache", async () => {
  const staleStudioHash = hashNormalizedAddress(
    "Via Studio 1, Roma, 00100",
  )!;
  const appointmentHash = "bbbbbbbbbbbbbbbb";
  const cacheReads: string[] = [];
  const providerLocations: ProviderLocation[][] = [];
  const staleRows = [
    cached(staleStudioHash, appointmentHash, "foot-walking", 60),
    cached(appointmentHash, staleStudioHash, "foot-walking", 60),
  ];
  const cache = memoryCache(staleRows, () => {
    cacheReads.push("miss");
    return null;
  });
  const supabase = locationSupabase({
    business: {
      id: "business-1",
      address: "Via Studio 1",
      city: "Roma",
      postal_code: "00100",
      location_latitude: 41.91278,
      location_longitude: 12.50637,
    },
    appointments: [{
      id: "appointment-1",
      patient_id: "patient-1",
      location_mode: "custom",
      location_address: "Via Cliente 2",
      location_city: "Roma",
      location_postal_code: "00100",
      location_latitude: 41.91,
      location_longitude: 12.5,
      location_address_hash: "bbbbbbbbbbbbbbbb",
    }],
    patients: [{
      id: "patient-1",
      address: null,
      city: null,
      postal_code: null,
    }],
  }, []);

  const routed = await prepareRoutingInput(
    supabase,
    {
      context: { business_id: "business-1" },
      appointments: [{ id: "appointment-1" }],
    },
    defaults(),
    {
      cache,
      provider: {
        geocode() {
          throw new Error("explicit coordinates must not be geocoded");
        },
        matrix(_profile, locations) {
          providerLocations.push(locations);
          return Promise.resolve(Object.fromEntries(locations.map((origin) => [
            origin.key,
            Object.fromEntries(locations.map((destination) => [
              destination.key,
              {
                seconds: origin.key === destination.key ? 0 : 420,
                meters: origin.key === destination.key ? 0 : 1_400,
              },
            ])),
          ])));
        },
      },
    },
  );

  assertNotEquals(routed.studio_location_key, `studio:${staleStudioHash}`);
  assert(cacheReads.length > 0, "expected stale address cache to miss");
  assert(providerLocations.length > 0, "expected provider routing after miss");
  const routedStudio = providerLocations.flat().find((location) =>
    location.key === routed.studio_location_key
  );
  assertEquals(routedStudio?.latitude, 41.91278);
  assertEquals(routedStudio?.longitude, 12.50637);
  assertEquals(
    routed.travel_matrix[routed.studio_location_key][
      routed.appointments[0].location_key
    ].seconds,
    420,
  );
});

Deno.test("routing input avoids an empty PostgREST in-filter", async () => {
  const queries: Array<{ table: string; filters: Record<string, unknown> }> =
    [];
  let geocodeCalls = 0;
  const supabase = locationSupabase({
    business: {
      id: "business-1",
      address: "Via studio 1",
      city: "Roma",
      postal_code: "00100",
    },
    appointments: [],
    patients: [],
  }, queries);

  const routed = await prepareRoutingInput(
    supabase,
    {
      context: { business_id: "business-1" },
      appointments: [],
    },
    defaults(),
    {
      provider: {
        async geocode() {
          geocodeCalls++;
          return { latitude: 41.9, longitude: 12.5 };
        },
        async matrix() {
          return {};
        },
      },
    },
  );

  assertEquals(routed.appointments, []);
  assertEquals(queries.map((query) => query.table), ["business"]);
  assertEquals(geocodeCalls, 0);
});

function defaults() {
  return {
    walkingThresholdMinutes: 9,
    unknownStudioLegMinutes: 20,
    plausibleWalkingMeters: 2_000,
    cacheTtlDays: 30,
  };
}

function providerStub(options: {
  geocode?: RoutingProvider["geocode"];
  walkingSeconds?: number;
  drivingSeconds?: number;
  matrixError?: Error;
}): RoutingProvider {
  return {
    geocode: options.geocode ?? (async () => null),
    matrix: async (profile, locations) => {
      if (options.matrixError) throw options.matrixError;
      const seconds = profile === "foot-walking"
        ? options.walkingSeconds ?? 600
        : options.drivingSeconds ?? 240;
      return Object.fromEntries(locations.map((origin) => [
        origin.key,
        Object.fromEntries(locations.map((destination) => [
          destination.key,
          {
            seconds: origin.key === destination.key ? 0 : seconds,
            meters: origin.key === destination.key ? 0 : 500,
          },
        ])),
      ]));
    },
  };
}

function memoryCache(
  rows: RouteCacheRecord[] = [],
  fallback?: () => RouteCacheRecord | null,
) {
  const stored = [...rows];
  return {
    async get(query: {
      businessId: string;
      originHash: string;
      destinationHash: string;
      profile: "foot-walking" | "driving-car";
      now: Date;
    }) {
      return stored.find((row) =>
        row.business_id === query.businessId &&
        row.origin_hash === query.originHash &&
        row.destination_hash === query.destinationHash &&
        row.profile === query.profile &&
        Date.parse(row.expires_at) > query.now.getTime()
      ) ?? fallback?.() ?? null;
    },
    async put(row: RouteCacheRecord) {
      stored.push(row);
    },
  };
}

function fakeSupabase(
  result: RouteCacheRecord | null,
  queries: Array<{ table: string; filters: Record<string, unknown> }> = [],
  upserts: RouteCacheRecord[] = [],
) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select() {
          return builder;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        maybeSingle() {
          queries.push({ table, filters });
          return Promise.resolve({ data: result, error: null });
        },
        upsert(value: RouteCacheRecord) {
          upserts.push(value);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };
}

function locationSupabase(
  rows: {
    business: Record<string, unknown>;
    appointments: Array<Record<string, unknown>>;
    patients: Array<Record<string, unknown>>;
  },
  queries: Array<{ table: string; filters: Record<string, unknown> }>,
  selectedColumns: Record<string, string> = {},
) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select(columns?: string) {
          if (columns) selectedColumns[table] = columns;
          return builder;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        is(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        in(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        maybeSingle() {
          queries.push({ table, filters });
          return Promise.resolve({
            data: table === "business" ? rows.business : null,
            error: null,
          });
        },
        then(
          resolve: (
            value: { data: unknown; error: null },
          ) => unknown,
        ) {
          queries.push({ table, filters });
          const data = table === "appointments"
            ? rows.appointments
            : table === "patients"
            ? rows.patients
            : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
        upsert() {
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };
}
