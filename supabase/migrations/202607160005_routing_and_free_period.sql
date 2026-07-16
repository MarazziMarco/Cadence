create table if not exists public.route_cache (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  origin_hash text not null
    check (origin_hash ~ '^[0-9a-f]{16,64}$'),
  destination_hash text not null
    check (destination_hash ~ '^[0-9a-f]{16,64}$'),
  origin_latitude double precision not null
    check (origin_latitude between -90 and 90),
  origin_longitude double precision not null
    check (origin_longitude between -180 and 180),
  destination_latitude double precision not null
    check (destination_latitude between -90 and 90),
  destination_longitude double precision not null
    check (destination_longitude between -180 and 180),
  profile text not null
    check (profile in ('foot-walking', 'driving-car')),
  duration_seconds integer not null
    check (duration_seconds >= 0),
  distance_meters integer not null
    check (distance_meters >= 0),
  provider text not null,
  fetched_at timestamptz not null,
  expires_at timestamptz not null
    check (expires_at > fetched_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, origin_hash, destination_hash, profile)
);

create index if not exists route_cache_expiry_idx
  on public.route_cache (business_id, expires_at);

create index if not exists route_cache_destination_idx
  on public.route_cache (business_id, destination_hash, origin_hash);

alter table public.route_cache owner to postgres;
alter table public.route_cache enable row level security;
alter table public.route_cache force row level security;

drop policy if exists route_cache_owner_select on public.route_cache;
create policy route_cache_owner_select
  on public.route_cache
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.business
       where business.id = route_cache.business_id
         and business.profile_id = auth.uid()
         and business.deleted_at is null
    )
  );

revoke all on table public.route_cache from public, anon, authenticated;
grant select on table public.route_cache to authenticated;
grant all on table public.route_cache to service_role;

alter table public.optimization_runs
  add column if not exists strategy text not null default 'balanced'
    check (strategy in ('balanced', 'smart_route')),
  add column if not exists goal text not null default 'optimize'
    check (goal in ('optimize', 'free_period')),
  add column if not exists travel_minutes_before integer not null default 0
    check (travel_minutes_before >= 0),
  add column if not exists travel_minutes_after integer not null default 0
    check (travel_minutes_after >= 0),
  add column if not exists distance_meters_before bigint not null default 0
    check (distance_meters_before >= 0),
  add column if not exists distance_meters_after bigint not null default 0
    check (distance_meters_after >= 0),
  add column if not exists excluded_period jsonb,
  add column if not exists completion_state text not null default 'complete'
    check (completion_state in ('complete', 'partial', 'blocked')),
  add column if not exists blockers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(blockers) = 'array'),
  add column if not exists exact_plan boolean not null default false,
  add column if not exists location_snapshot_hash text;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'optimization_runs_excluded_period_check'
       and conrelid = 'public.optimization_runs'::regclass
  ) then
    alter table public.optimization_runs
      add constraint optimization_runs_excluded_period_check
      check (
        excluded_period is null
        or jsonb_typeof(excluded_period) = 'object'
      );
  end if;
end
$$;
