import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202607160002_calendar_mutations_hardening.sql'),
  'utf8',
)
const locationMigrationPath = join(
  process.cwd(),
  'supabase/migrations/202607160004_client_locations_and_availability.sql',
)

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function requestHash(payload: unknown): string {
  return createHash('md5').update(canonicalJson(payload)).digest('hex')
}

function canonicalizeLegacyPayload(payload: Record<string, unknown>) {
  const warnings = Array.isArray(payload.confirm_warnings)
    ? [...new Set(payload.confirm_warnings.filter((warning): warning is string => typeof warning === 'string'))].sort()
    : []

  return { ...payload, confirm_warnings: warnings }
}

describe('calendar mutation SQL hardening contract', () => {
  it('binds an idempotency key to a canonical request', () => {
    expect(migration).toMatch(/request_hash/)
    expect(migration).toMatch(/IDEMPOTENCY_KEY_REUSE/)
    expect(migration).toMatch(/v_stored_payload\s+is\s+distinct\s+from\s+v_request_payload/i)
  })

  it('canonicalizes legacy warning arrays before backfilling their request hash', () => {
    const legacyPayload = {
      operation: 'move',
      appointment_id: 'appointment-1',
      expected_version: 3,
      values: { appointment_date: '2026-07-20', start_time: '10:00' },
      untouched: { source: 'legacy' },
      confirm_warnings: ['STALE_VERSION', 'OVERLAP', 'STALE_VERSION'],
    }
    const newRpcPayload = {
      ...legacyPayload,
      confirm_warnings: ['OVERLAP', 'STALE_VERSION'],
    }

    const canonicalLegacy = canonicalizeLegacyPayload(legacyPayload)

    expect(canonicalLegacy).toEqual(newRpcPayload)
    expect(requestHash(canonicalLegacy)).toBe(requestHash(newRpcPayload))
    expect(canonicalLegacy.untouched).toEqual({ source: 'legacy' })

    const payloadBackfill = migration.indexOf("jsonb_set")
    const hashBackfill = migration.indexOf("set request_hash = md5(request_payload::text)")
    expect(payloadBackfill).toBeGreaterThanOrEqual(0)
    expect(hashBackfill).toBeGreaterThan(payloadBackfill)
    expect(migration).toMatch(/jsonb_typeof\([^)]*confirm_warnings[^)]*\)\s*=\s*'array'/i)
    expect(migration).toMatch(/select distinct[\s\S]+jsonb_typeof\([^)]*\)\s*=\s*'string'/i)
    expect(migration).toMatch(/jsonb_agg\([^)]*order by[^)]*\)/i)
  })

  it('normalizes missing or non-array legacy warnings to an empty array', () => {
    expect(canonicalizeLegacyPayload({ operation: 'delete' })).toEqual({
      operation: 'delete',
      confirm_warnings: [],
    })
    expect(
      canonicalizeLegacyPayload({ operation: 'delete', confirm_warnings: 'OVERLAP' }),
    ).toEqual({
      operation: 'delete',
      confirm_warnings: [],
    })
  })

  it('mirrors operation value allowlists in the RPC', () => {
    expect(migration).toMatch(/v_allowed_keys/)
    expect(migration).toMatch(/calendar mutation contains fields not allowed for operation/)
  })

  it('uses recurring availability and date exceptions with override precedence', () => {
    expect(migration).toMatch(/patient_exceptions/)
    expect(migration).toMatch(/is_available\s*=\s*false/)
    expect(migration).toMatch(/is_available\s*=\s*true/)
    expect(migration).toMatch(/availability\.recurring/)
  })

  it('validates active relations only when creating or replacing them', () => {
    expect(migration).toContain("p_operation = 'create' or p_values ? 'patient_id'")
    expect(migration).toContain("p_operation = 'create' or p_values ? 'service_id'")
  })

  it('keeps the internal idempotency table behind forced RLS and the RPC boundary', () => {
    expect(migration).toMatch(
      /alter table public\.calendar_mutation_requests\s+owner to postgres/i,
    )
    expect(migration).toMatch(
      /alter function public\.calendar_validate_mutation\([\s\S]+owner to postgres/i,
    )
    expect(migration).toMatch(
      /alter table public\.calendar_mutation_requests\s+enable row level security/i,
    )
    expect(migration).toMatch(
      /alter table public\.calendar_mutation_requests\s+force row level security/i,
    )
    expect(migration).toMatch(
      /revoke all on table public\.calendar_mutation_requests from public, anon, authenticated/i,
    )
    expect(migration).toMatch(
      /grant all on table public\.calendar_mutation_requests to service_role/i,
    )
    expect(migration).toMatch(
      /revoke all on function public\.calendar_validate_mutation[\s\S]+from public, anon/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.calendar_validate_mutation[\s\S]+to authenticated/i,
    )
  })
})

describe('client location and availability schema contract', () => {
  it('authorizes the tenant before touching outer idempotency state', () => {
    const locationMigration = readFileSync(locationMigrationPath, 'utf8')
    const authorization = locationMigration.indexOf('from public.business')
    const idempotencyInsert = locationMigration.indexOf(
      'insert into public.calendar_mutation_requests',
    )

    expect(authorization).toBeGreaterThan(-1)
    expect(idempotencyInsert).toBeGreaterThan(authorization)
    expect(locationMigration).toMatch(
      /from public\.business[\s\S]+where id = p_business_id[\s\S]+profile_id = auth\.uid\(\)[\s\S]+deleted_at is null[\s\S]+raise exception 'forbidden'/i,
    )
  })

  it('invalidates geocoding when effective appointment location input changes', () => {
    const locationMigration = readFileSync(locationMigrationPath, 'utf8')

    expect(locationMigration).toMatch(
      /v_location_changed :=[\s\S]+v_location_mode is distinct from v_appointment\.location_mode[\s\S]+v_location_address is distinct from v_appointment\.location_address[\s\S]+v_location_city is distinct from v_appointment\.location_city[\s\S]+v_location_postal_code is distinct from v_appointment\.location_postal_code/i,
    )
    expect(locationMigration).toMatch(
      /set location_mode = v_location_mode[\s\S]+location_address = v_location_address[\s\S]+location_city = v_location_city[\s\S]+location_postal_code = v_location_postal_code[\s\S]+location_latitude = case[\s\S]+when v_location_changed then null else location_latitude[\s\S]+location_longitude = case[\s\S]+when v_location_changed then null else location_longitude[\s\S]+location_geocoding_status = case[\s\S]+when v_location_changed then null else location_geocoding_status[\s\S]+location_address_hash = case[\s\S]+when v_location_changed then null else location_address_hash[\s\S]+location_geocoded_at = case[\s\S]+when v_location_changed then null else location_geocoded_at/i,
    )
  })

  it('matches Zod location text types and limits at the SQL boundary', () => {
    const locationMigration = readFileSync(locationMigrationPath, 'utf8')

    for (const field of [
      'location_address',
      'location_city',
      'location_postal_code',
    ]) {
      expect(locationMigration).toMatch(
        new RegExp(
          `p_values \\? '${field}'[\\s\\S]+jsonb_typeof\\(p_values -> '${field}'\\) not in \\('string', 'null'\\)[\\s\\S]+char_length\\(btrim\\(p_values ->> '${field}'\\)\\) > 500`,
          'i',
        ),
      )
    }
  })

  it('keeps delegated requests transactional and rewrites the audit snapshot', () => {
    const locationMigration = readFileSync(locationMigrationPath, 'utf8')

    expect(locationMigration).toMatch(
      /v_response := public\.calendar_validate_mutation_without_locations\([\s\S]+delete from public\.calendar_mutation_requests[\s\S]+if coalesce\(\(v_response ->> 'ok'\)::boolean, false\)[\s\S]+update public\.audit_log[\s\S]+set new_data = to_jsonb\(v_appointment\)[\s\S]+update public\.calendar_mutation_requests[\s\S]+set response = v_response/i,
    )
  })

  it('adds appointment location mode, custom location data, and geocoding metadata', () => {
    const locationMigration = readFileSync(locationMigrationPath, 'utf8')

    expect(locationMigration).toMatch(
      /add column if not exists location_mode text not null default 'inherit'/i,
    )
    expect(locationMigration).toMatch(/location_mode in\s*\(\s*'inherit',\s*'studio',\s*'patient',\s*'custom'\s*\)/i)
    expect(locationMigration).toMatch(/add column if not exists location_address text/i)
    expect(locationMigration).toMatch(/add column if not exists location_city text/i)
    expect(locationMigration).toMatch(/add column if not exists location_postal_code text/i)
    expect(locationMigration).toMatch(/add column if not exists location_latitude double precision/i)
    expect(locationMigration).toMatch(/add column if not exists location_longitude double precision/i)
    expect(locationMigration).toMatch(/add column if not exists location_geocoding_status text/i)
    expect(locationMigration).toMatch(/add column if not exists location_address_hash text/i)
    expect(locationMigration).toMatch(/add column if not exists location_geocoded_at timestamptz/i)
    expect(locationMigration).toMatch(
      /location_mode <> 'custom'[\s\S]+nullif\(btrim\(location_address\), ''\) is not null/i,
    )
  })

  it('stores explicit recurring unavailability and keeps location indexes tenant scoped', () => {
    const locationMigration = readFileSync(locationMigrationPath, 'utf8')

    expect(locationMigration).toMatch(
      /alter table public\.patient_availability[\s\S]+add column if not exists is_available boolean not null default true/i,
    )
    expect(locationMigration).toMatch(
      /create index if not exists appointments_location_geocoding_idx[\s\S]+on public\.appointments \(business_id, location_geocoding_status\)/i,
    )
    expect(locationMigration).toMatch(
      /create index if not exists appointments_location_hash_idx[\s\S]+on public\.appointments \(business_id, location_address_hash\)/i,
    )
  })
})
