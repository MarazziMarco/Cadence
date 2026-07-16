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

Deno.test("walking is selected at nine minutes and driving above it", () => {
  assertEquals(chooseTravelMode(9 * 60, 9), "foot-walking");
  assertEquals(chooseTravelMode(9 * 60 + 1, 9), "driving-car");
  assertEquals(chooseTravelMode(null, 9), "driving-car");
});
