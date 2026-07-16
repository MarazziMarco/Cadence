alter table public.appointments
  add column if not exists location_mode text not null default 'inherit',
  add column if not exists location_address text,
  add column if not exists location_city text,
  add column if not exists location_postal_code text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_geocoding_status text,
  add column if not exists location_address_hash text,
  add column if not exists location_geocoded_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'appointments_location_mode_check'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_location_mode_check
      check (location_mode in ('inherit', 'studio', 'patient', 'custom'));
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'appointments_custom_location_address_check'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_custom_location_address_check
      check (
        location_mode <> 'custom'
        or nullif(btrim(location_address), '') is not null
      );
  end if;
end
$$;

alter table public.patient_availability
  add column if not exists is_available boolean not null default true;

create index if not exists appointments_location_geocoding_idx
  on public.appointments (business_id, location_geocoding_status)
  where deleted_at is null
    and location_geocoding_status is not null;

create index if not exists appointments_location_hash_idx
  on public.appointments (business_id, location_address_hash)
  where deleted_at is null
    and location_address_hash is not null;
