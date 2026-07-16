import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/202607160005_routing_and_free_period.sql',
  ),
  'utf8',
)

describe('routing and free-period schema contract', () => {
  it('creates a tenant-scoped directed route cache with bounded metrics', () => {
    expect(migration).toMatch(/create table if not exists public\.route_cache/i)
    expect(migration).toMatch(/business_id uuid not null references public\.business/i)
    expect(migration).toMatch(/origin_hash text not null/i)
    expect(migration).toMatch(/destination_hash text not null/i)
    expect(migration).toMatch(/profile text not null[\s\S]+foot-walking[\s\S]+driving-car/i)
    expect(migration).toMatch(/duration_seconds numeric\(12,\s*3\) not null[\s\S]+duration_seconds >= 0/i)
    expect(migration).toMatch(/distance_meters numeric\(14,\s*3\) not null[\s\S]+distance_meters >= 0/i)
    expect(migration).toMatch(/provider text not null/i)
    expect(migration).toMatch(/fetched_at timestamptz not null/i)
    expect(migration).toMatch(/expires_at timestamptz not null/i)
    expect(migration).toMatch(
      /unique\s*\(\s*business_id,\s*origin_hash,\s*destination_hash,\s*profile\s*\)/i,
    )
  })

  it('stores rounded endpoint coordinates without storing raw addresses', () => {
    expect(migration).toMatch(/origin_latitude double precision/)
    expect(migration).toMatch(/origin_longitude double precision/)
    expect(migration).toMatch(/destination_latitude double precision/)
    expect(migration).toMatch(/destination_longitude double precision/)
    for (const field of [
      'origin_latitude',
      'origin_longitude',
      'destination_latitude',
      'destination_longitude',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `${field} = round\\(${field}::numeric, 5\\)::double precision`,
          'i',
        ),
      )
    }
    expect(migration).not.toMatch(/origin_address|destination_address/i)
    expect(migration).not.toMatch(/updated_at timestamptz/i)
  })

  it('adds route strategy, goal, KPIs, excluded period, blockers, and exact-plan state', () => {
    expect(migration).toMatch(
      /add column if not exists strategy text not null default 'balanced'[\s\S]+balanced[\s\S]+smart_route/i,
    )
    expect(migration).toMatch(
      /add column if not exists goal text not null default 'optimize'[\s\S]+optimize[\s\S]+free_period/i,
    )
    expect(migration).toMatch(/travel_minutes_before integer not null default 0/i)
    expect(migration).toMatch(/travel_minutes_after integer not null default 0/i)
    expect(migration).toMatch(/distance_meters_before bigint not null default 0/i)
    expect(migration).toMatch(/distance_meters_after bigint not null default 0/i)
    expect(migration).toMatch(/excluded_period jsonb/)
    expect(migration).toMatch(
      /completion_state text not null default 'complete'[\s\S]+complete[\s\S]+partial[\s\S]+blocked/i,
    )
    expect(migration).toMatch(/blockers jsonb not null default '\[\]'::jsonb/i)
    expect(migration).toMatch(/exact_plan boolean not null default false/i)
    expect(migration).toMatch(/location_snapshot_hash text/i)
  })

  it('enables forced RLS and exposes only owner-scoped reads', () => {
    expect(migration).toMatch(
      /alter table public\.route_cache enable row level security/i,
    )
    expect(migration).toMatch(
      /alter table public\.route_cache force row level security/i,
    )
    expect(migration).toMatch(
      /create policy route_cache_owner_select[\s\S]+using\s*\([\s\S]+business\.profile_id = auth\.uid\(\)[\s\S]+business\.deleted_at is null/i,
    )
    expect(migration).toMatch(
      /revoke all on table public\.route_cache from public, anon, authenticated/i,
    )
    expect(migration).toMatch(
      /grant select on table public\.route_cache to authenticated/i,
    )
    expect(migration).toMatch(
      /grant all on table public\.route_cache to service_role/i,
    )
  })
})
