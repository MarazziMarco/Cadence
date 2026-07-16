import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202607160002_calendar_mutations_hardening.sql'),
  'utf8',
)

describe('calendar mutation SQL hardening contract', () => {
  it('binds an idempotency key to a canonical request', () => {
    expect(migration).toMatch(/request_hash/)
    expect(migration).toMatch(/IDEMPOTENCY_KEY_REUSE/)
    expect(migration).toMatch(/v_stored_payload\s+is\s+distinct\s+from\s+v_request_payload/i)
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
