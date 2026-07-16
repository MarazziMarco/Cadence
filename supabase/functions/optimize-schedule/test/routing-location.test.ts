/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  hashNormalizedAddress,
  resolveAppointmentLocation,
} from "../routing/location.ts";
import { chooseTravelMode } from "../routing/mode.ts";
import type {
  LocationCandidate,
  LocationResolutionInput,
} from "../routing/types.ts";

const studio: LocationCandidate = {
  address: "Via Studio 1, Roma",
  latitude: 41.9028,
  longitude: 12.4964,
};

const patient: LocationCandidate = {
  address: "Via Cliente 2, Roma",
  latitude: 41.91,
  longitude: 12.5,
};

const custom: LocationCandidate = {
  address: "Via Appuntamento 3, Roma",
  latitude: 41.92,
  longitude: 12.51,
};

function input(
  patch: Partial<LocationResolutionInput>,
): LocationResolutionInput {
  return {
    mode: "inherit",
    studio,
    patient,
    custom,
    ...patch,
  };
}

Deno.test("explicit location modes take precedence over every fallback", () => {
  assertEquals(
    resolveAppointmentLocation(input({ mode: "studio" })).source,
    "studio",
  );
  assertEquals(
    resolveAppointmentLocation(input({ mode: "patient" })).source,
    "patient",
  );
  assertEquals(
    resolveAppointmentLocation(input({ mode: "custom" })).source,
    "custom",
  );
});

Deno.test("inherit prefers appointment custom, then patient, then studio", () => {
  assertEquals(resolveAppointmentLocation(input({})).source, "custom");
  assertEquals(
    resolveAppointmentLocation(input({ custom: null })).source,
    "patient",
  );
  assertEquals(
    resolveAppointmentLocation(input({ custom: null, patient: null })).source,
    "studio",
  );
});

Deno.test("inherit with no address or coordinates remains a studio appointment", () => {
  const result = resolveAppointmentLocation(input({
    custom: { address: " ", latitude: null, longitude: null },
    patient: { address: null, latitude: null, longitude: null },
    studio: null,
  }));

  assertEquals(result, {
    key: "studio:unknown",
    source: "studio",
    latitude: null,
    longitude: null,
    addressHash: null,
  });
});

Deno.test("every appointment resolved to the same studio shares its key", () => {
  const first = resolveAppointmentLocation(input({
    mode: "studio",
    patient,
    custom,
  }));
  const second = resolveAppointmentLocation(input({
    mode: "inherit",
    patient: null,
    custom: null,
  }));

  assertEquals(first.key, second.key);
});

Deno.test("explicit missing patient and custom locations stay unresolved without falling back", () => {
  assertEquals(
    resolveAppointmentLocation(input({
      mode: "patient",
      patient: null,
    })),
    {
      key: "unresolved:patient",
      source: "patient",
      latitude: null,
      longitude: null,
      addressHash: null,
    },
  );

  assertEquals(
    resolveAppointmentLocation(input({
      mode: "custom",
      custom: null,
    })),
    {
      key: "unresolved:custom",
      source: "custom",
      latitude: null,
      longitude: null,
      addressHash: null,
    },
  );
});

Deno.test("address hashing normalizes equivalent text and does not expose it in the key", () => {
  const first = hashNormalizedAddress("  VÍA Roma, 10 ");
  const second = hashNormalizedAddress("via roma 10");
  const location = resolveAppointmentLocation(input({
    mode: "custom",
    custom: {
      address: "Vía Roma, 10",
      latitude: null,
      longitude: null,
    },
  }));

  assertEquals(first, second);
  assertEquals(location.addressHash, first);
  assertNotEquals(location.key.includes("roma"), true);
});

Deno.test("explicit coordinates take cache identity precedence over address text and hash", () => {
  const staleAddressHash = hashNormalizedAddress("Via Studio 1, Roma")!;
  const first = resolveAppointmentLocation(input({
    mode: "studio",
    studio: {
      addressHash: staleAddressHash,
      address: "Via Studio 1, Roma",
      latitude: 41.90278,
      longitude: 12.49637,
    },
  }));
  const changed = resolveAppointmentLocation(input({
    mode: "studio",
    studio: {
      addressHash: staleAddressHash,
      address: "Via Studio 1, Roma",
      latitude: 41.91278,
      longitude: 12.50637,
    },
  }));

  assertNotEquals(first.addressHash, staleAddressHash);
  assertNotEquals(first.key, changed.key);
  assertEquals(
    first.addressHash,
    hashNormalizedAddress("41.90278,12.49637"),
  );
  assertEquals(
    changed.addressHash,
    hashNormalizedAddress("41.91278,12.50637"),
  );
});

Deno.test("raw-looking persisted address hashes are converted to opaque tokens", () => {
  const rawLookingHash = "Via Segreta 99, Roma";
  const location = resolveAppointmentLocation(input({
    mode: "custom",
    custom: {
      addressHash: rawLookingHash,
      address: null,
      latitude: null,
      longitude: null,
    },
  }));

  assertNotEquals(location.addressHash, rawLookingHash);
  assertNotEquals(location.addressHash?.includes("Segreta"), true);
  assertNotEquals(location.key.includes("Segreta"), true);
  assertEquals(location.addressHash, hashNormalizedAddress(rawLookingHash));
});

Deno.test("already opaque persisted hashes remain stable across resolution", () => {
  const opaqueHash = hashNormalizedAddress("Via Stabile 5")!;
  const location = resolveAppointmentLocation(input({
    mode: "patient",
    patient: {
      addressHash: opaqueHash,
      address: null,
      latitude: null,
      longitude: null,
    },
  }));

  assertEquals(location.addressHash, opaqueHash);
  assertEquals(location.key, `patient:${opaqueHash}`);
});

Deno.test("out-of-range coordinate pairs stay unresolved and are returned as null", () => {
  const invalidPatient = resolveAppointmentLocation(input({
    mode: "patient",
    patient: {
      address: null,
      latitude: 91,
      longitude: 12.5,
    },
  }));
  const invalidCustom = resolveAppointmentLocation(input({
    mode: "custom",
    custom: {
      address: null,
      latitude: 41.9,
      longitude: -181,
    },
  }));

  assertEquals(invalidPatient, {
    key: "unresolved:patient",
    source: "patient",
    latitude: null,
    longitude: null,
    addressHash: null,
  });
  assertEquals(invalidCustom, {
    key: "unresolved:custom",
    source: "custom",
    latitude: null,
    longitude: null,
    addressHash: null,
  });
});

Deno.test("walking is selected at nine minutes and driving above it", () => {
  assertEquals(chooseTravelMode(9 * 60, 9), "foot-walking");
  assertEquals(chooseTravelMode(9 * 60 + 1, 9), "driving-car");
  assertEquals(chooseTravelMode(null, 9), "driving-car");
});
