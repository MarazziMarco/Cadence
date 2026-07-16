import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202607160002_calendar_mutations_hardening.sql'),
  'utf8',
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
