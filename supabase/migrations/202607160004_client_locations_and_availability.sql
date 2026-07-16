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

-- Keep the hardened scheduler implementation as an internal primitive. The
-- public wrapper below owns idempotency for the complete request, delegates the
-- existing scheduling checks, then applies appointment location fields inside
-- the same transaction.
alter function public.calendar_validate_mutation(
  uuid, text, uuid, integer, uuid, jsonb, text[]
) rename to calendar_validate_mutation_without_locations;

revoke all on function public.calendar_validate_mutation_without_locations(
  uuid, text, uuid, integer, uuid, jsonb, text[]
) from public, anon, authenticated;

create or replace function public.calendar_validate_mutation(
  p_business_id uuid,
  p_operation text,
  p_appointment_id uuid default null,
  p_expected_version integer default null,
  p_idempotency_key uuid default null,
  p_values jsonb default '{}'::jsonb,
  p_confirm_warnings text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_inserted integer := 0;
  v_request_payload jsonb;
  v_request_hash text;
  v_stored_payload jsonb;
  v_stored_hash text;
  v_response jsonb;
  v_values jsonb := p_values;
  v_base_values jsonb;
  v_confirm_warnings jsonb;
  v_internal_idempotency_key uuid;
  v_appointment_id uuid;
  v_appointment public.appointments%rowtype;
  v_location_mode text;
  v_location_address text;
  v_location_city text;
  v_location_postal_code text;
begin
  if p_operation is null
     or p_operation not in ('create', 'update', 'move', 'resize', 'delete', 'lock', 'unlock') then
    raise exception 'invalid calendar mutation operation' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'calendar mutation values must be an object' using errcode = '22023';
  end if;

  if p_operation not in ('create', 'update')
     and p_values ?| array[
       'location_mode',
       'location_address',
       'location_city',
       'location_postal_code'
     ] then
    raise exception 'calendar mutation contains location fields not allowed for operation'
      using errcode = '22023';
  end if;

  if p_values ? 'location_mode' then
    v_location_mode := nullif(btrim(p_values ->> 'location_mode'), '');
    if v_location_mode is null
       or v_location_mode not in ('inherit', 'studio', 'patient', 'custom') then
      raise exception 'invalid appointment location mode' using errcode = '22023';
    end if;
    v_values := jsonb_set(v_values, '{location_mode}', to_jsonb(v_location_mode), true);
  end if;
  if p_values ? 'location_address' then
    v_location_address := nullif(btrim(p_values ->> 'location_address'), '');
    v_values := jsonb_set(
      v_values,
      '{location_address}',
      coalesce(to_jsonb(v_location_address), 'null'::jsonb),
      true
    );
  end if;
  if p_values ? 'location_city' then
    v_location_city := nullif(btrim(p_values ->> 'location_city'), '');
    v_values := jsonb_set(
      v_values,
      '{location_city}',
      coalesce(to_jsonb(v_location_city), 'null'::jsonb),
      true
    );
  end if;
  if p_values ? 'location_postal_code' then
    v_location_postal_code := nullif(btrim(p_values ->> 'location_postal_code'), '');
    v_values := jsonb_set(
      v_values,
      '{location_postal_code}',
      coalesce(to_jsonb(v_location_postal_code), 'null'::jsonb),
      true
    );
  end if;

  select coalesce(jsonb_agg(code order by code), '[]'::jsonb)
    into v_confirm_warnings
    from (
      select distinct warning_code as code
        from unnest(coalesce(p_confirm_warnings, '{}'::text[])) warning_code
    ) sorted_warnings;

  v_request_payload := jsonb_build_object(
    'operation', p_operation,
    'appointment_id', p_appointment_id,
    'expected_version', p_expected_version,
    'values', v_values,
    'confirm_warnings', v_confirm_warnings
  );
  v_request_hash := md5(v_request_payload::text);

  insert into public.calendar_mutation_requests (
    business_id,
    idempotency_key,
    operation,
    appointment_id,
    request_payload,
    request_hash,
    created_by
  )
  values (
    p_business_id,
    p_idempotency_key,
    p_operation,
    p_appointment_id,
    v_request_payload,
    v_request_hash,
    auth.uid()
  )
  on conflict (business_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select request_payload, request_hash, response
      into v_stored_payload, v_stored_hash, v_response
      from public.calendar_mutation_requests
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key
     for update;
    if v_stored_payload is distinct from v_request_payload
       or v_stored_hash is distinct from v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSE'
        using errcode = '22023',
              detail = 'The idempotency key belongs to a different calendar mutation request.';
    end if;
    if v_response is null then
      raise exception 'calendar mutation is still in progress' using errcode = '40001';
    end if;
    return v_response;
  end if;

  v_base_values := v_values - array[
    'location_mode',
    'location_address',
    'location_city',
    'location_postal_code'
  ];
  v_internal_idempotency_key := gen_random_uuid();
  v_response := public.calendar_validate_mutation_without_locations(
    p_business_id,
    p_operation,
    p_appointment_id,
    p_expected_version,
    v_internal_idempotency_key,
    v_base_values,
    p_confirm_warnings
  );

  delete from public.calendar_mutation_requests
   where business_id = p_business_id
     and idempotency_key = v_internal_idempotency_key;

  if coalesce((v_response ->> 'ok')::boolean, false)
     and p_operation in ('create', 'update') then
    v_appointment_id := nullif(v_response #>> '{appointment,id}', '')::uuid;
    select *
      into v_appointment
      from public.appointments
     where id = v_appointment_id
       and business_id = p_business_id
       and deleted_at is null
     for update;

    v_location_mode := case
      when v_values ? 'location_mode' then v_values ->> 'location_mode'
      else v_appointment.location_mode
    end;
    v_location_address := case
      when v_values ? 'location_address'
        then nullif(btrim(v_values ->> 'location_address'), '')
      else v_appointment.location_address
    end;
    v_location_city := case
      when v_values ? 'location_city'
        then nullif(btrim(v_values ->> 'location_city'), '')
      else v_appointment.location_city
    end;
    v_location_postal_code := case
      when v_values ? 'location_postal_code'
        then nullif(btrim(v_values ->> 'location_postal_code'), '')
      else v_appointment.location_postal_code
    end;

    if v_location_mode = 'custom' and v_location_address is null then
      raise exception 'CUSTOM_LOCATION_REQUIRED'
        using errcode = '23514',
              detail = 'Custom appointment locations require a non-empty address.';
    end if;
    if v_location_mode = 'patient'
       and not exists (
         select 1
           from public.patients patient
          where patient.id = v_appointment.patient_id
            and patient.business_id = p_business_id
            and patient.deleted_at is null
            and nullif(btrim(patient.address), '') is not null
       ) then
      raise exception 'PATIENT_LOCATION_REQUIRED'
        using errcode = '23514',
              detail = 'Patient appointment locations require a stored patient address.';
    end if;

    update public.appointments
       set location_mode = v_location_mode,
           location_address = v_location_address,
           location_city = v_location_city,
           location_postal_code = v_location_postal_code
     where id = v_appointment.id
     returning * into v_appointment;

    update public.audit_log
       set new_data = to_jsonb(v_appointment)
     where business_id = p_business_id
       and record_id = v_appointment.id
       and new_data ->> 'version' = v_appointment.version::text;

    v_response := jsonb_set(
      v_response,
      '{appointment}',
      to_jsonb(v_appointment),
      true
    );
  end if;

  update public.calendar_mutation_requests
     set response = v_response,
         completed_at = clock_timestamp()
   where business_id = p_business_id
     and idempotency_key = p_idempotency_key;
  return v_response;
end;
$function$;

alter function public.calendar_validate_mutation(
  uuid, text, uuid, integer, uuid, jsonb, text[]
) owner to postgres;

revoke all on function public.calendar_validate_mutation(
  uuid, text, uuid, integer, uuid, jsonb, text[]
) from public, anon;
grant execute on function public.calendar_validate_mutation(
  uuid, text, uuid, integer, uuid, jsonb, text[]
) to authenticated;
