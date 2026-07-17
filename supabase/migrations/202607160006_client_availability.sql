-- Additions intentionally live after 004/005 because 004 is already applied.
alter table public.business
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_accuracy_meters double precision,
  add column if not exists location_source text,
  add column if not exists location_captured_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'business_location_latitude_check'
       and conrelid = 'public.business'::regclass
  ) then
    alter table public.business add constraint business_location_latitude_check
      check (location_latitude is null or (
        location_latitude between -90 and 90
        and location_latitude = round(location_latitude::numeric, 5)::double precision
      ));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'business_location_longitude_check'
       and conrelid = 'public.business'::regclass
  ) then
    alter table public.business add constraint business_location_longitude_check
      check (location_longitude is null or (
        location_longitude between -180 and 180
        and location_longitude = round(location_longitude::numeric, 5)::double precision
      ));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'business_location_source_check'
       and conrelid = 'public.business'::regclass
  ) then
    alter table public.business add constraint business_location_source_check
      check (location_source is null or location_source in ('device_geolocation'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'business_location_capture_check'
       and conrelid = 'public.business'::regclass
  ) then
    alter table public.business add constraint business_location_capture_check
      check (
        (
          location_latitude is null
          and location_longitude is null
          and location_accuracy_meters is null
          and location_source is null
          and location_captured_at is null
        )
        or (
          location_latitude is not null
          and location_longitude is not null
          and location_accuracy_meters is not null
          and location_accuracy_meters between 0 and 1000000
          and location_accuracy_meters = round(location_accuracy_meters::numeric, 0)::double precision
          and location_source = 'device_geolocation'
          and location_captured_at is not null
        )
      );
  end if;
end
$$;

create or replace function public.replace_patient_weekly_availability(
  p_patient_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select patient.business_id
    into v_business_id
    from public.patients patient
    join public.business business on business.id = patient.business_id
   where patient.id = p_patient_id
     and patient.deleted_at is null
     and business.profile_id = auth.uid()
     and business.deleted_at is null;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or (jsonb_array_length(p_rows) > 0 and jsonb_array_length(p_rows) < 7)
     or jsonb_array_length(p_rows) > 14
     or exists (
       select 1
         from jsonb_array_elements(p_rows) payload(row_value)
        where jsonb_typeof(row_value) <> 'object'
           or exists (
             select 1
               from jsonb_object_keys(row_value) as object_key(key)
              where key <> all(array[
                'weekday', 'start_time', 'end_time', 'priority',
                'is_available', 'valid_from', 'valid_until', 'recurring'
              ])
           )
     ) then
    raise exception 'invalid weekly availability payload' using errcode = '22023';
  end if;

  -- Cast the whole payload before deleting anything. Any invalid enum, time or
  -- scalar aborts here and leaves the previous recurring schedule untouched.
  perform count(*)
    from jsonb_populate_recordset(null::public.patient_availability, p_rows);

  if jsonb_array_length(p_rows) > 0 and exists (
    with decoded as (
      select *
        from jsonb_populate_recordset(null::public.patient_availability, p_rows)
    )
    select 1
      from decoded
     where weekday is null
        or start_time is null
        or end_time is null
        or start_time >= end_time
        or priority::text not in ('normal', 'high')
        or is_available is null
        or valid_from is not null
        or valid_until is not null
        or recurring is distinct from true
        or (priority::text = 'high' and not is_available)
  ) then
    raise exception 'invalid weekly availability row' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 0 and exists (
    with decoded as (
      select *
        from jsonb_populate_recordset(null::public.patient_availability, p_rows)
    ), weekdays(weekday) as (
      values ('monday'), ('tuesday'), ('wednesday'), ('thursday'),
             ('friday'), ('saturday'), ('sunday')
    )
    select 1
      from weekdays expected
      left join decoded decoded_row
        on decoded_row.weekday::text = expected.weekday
     group by expected.weekday
    having count(decoded_row.weekday) < 1
       or count(*) filter (where decoded_row.priority::text = 'normal') <> 1
       or count(*) filter (where decoded_row.priority::text = 'high') > 1
       or count(*) filter (where decoded_row.is_available = false) > 1
       or (
         count(*) filter (where decoded_row.is_available = false) = 1
         and count(decoded_row.weekday) <> 1
       )
  ) then
    raise exception 'invalid weekly availability shape' using errcode = '22023';
  end if;

  if exists (
    with decoded as (
      select *
        from jsonb_populate_recordset(null::public.patient_availability, p_rows)
    )
    select 1
      from decoded preferred
     where preferred.priority::text = 'high'
       and not exists (
         select 1
           from decoded normal
          where normal.weekday = preferred.weekday
            and normal.priority::text = 'normal'
            and normal.is_available
            and preferred.start_time >= normal.start_time
            and preferred.end_time <= normal.end_time
       )
  ) then
    raise exception 'preference window must be inside normal availability'
      using errcode = '22023';
  end if;

  update public.patient_availability
     set deleted_at = clock_timestamp()
   where patient_id = p_patient_id
     and recurring
     and deleted_at is null;

  insert into public.patient_availability (
    patient_id, weekday, start_time, end_time, priority, is_available,
    valid_from, valid_until, recurring
  )
  select
    p_patient_id, row.weekday, row.start_time, row.end_time, row.priority,
    row.is_available, null, null, true
  from jsonb_populate_recordset(
    null::public.patient_availability,
    p_rows
  ) row;
end;
$function$;

alter function public.replace_patient_weekly_availability(uuid, jsonb)
  owner to postgres;
revoke all on function public.replace_patient_weekly_availability(uuid, jsonb)
  from public, anon;
grant execute on function public.replace_patient_weekly_availability(uuid, jsonb)
  to authenticated;

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
  v_location_changed boolean := false;
  v_current_appointment public.appointments%rowtype;
  v_effective_patient_id uuid;
  v_effective_date date;
  v_effective_start time;
  v_effective_end time;
  v_effective_duration integer;
  v_effective_weekday text;
  v_availability_warnings jsonb := '[]'::jsonb;
  v_missing_availability_warning boolean := false;
  v_internal_confirm_warnings text[];
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

  -- This check must precede every access to the outer idempotency record.
  -- Otherwise a caller who guesses another tenant's canonical request could
  -- replay the stored response through this SECURITY DEFINER wrapper.
  perform 1
    from public.business
   where id = p_business_id
     and profile_id = auth.uid()
     and deleted_at is null;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
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
    if jsonb_typeof(p_values -> 'location_address') not in ('string', 'null')
       or (
         jsonb_typeof(p_values -> 'location_address') = 'string'
         and char_length(btrim(p_values ->> 'location_address')) > 500
       ) then
      raise exception 'invalid appointment location address' using errcode = '22023';
    end if;
    v_location_address := nullif(btrim(p_values ->> 'location_address'), '');
    v_values := jsonb_set(
      v_values,
      '{location_address}',
      coalesce(to_jsonb(v_location_address), 'null'::jsonb),
      true
    );
  end if;
  if p_values ? 'location_city' then
    if jsonb_typeof(p_values -> 'location_city') not in ('string', 'null')
       or (
         jsonb_typeof(p_values -> 'location_city') = 'string'
         and char_length(btrim(p_values ->> 'location_city')) > 500
       ) then
      raise exception 'invalid appointment location city' using errcode = '22023';
    end if;
    v_location_city := nullif(btrim(p_values ->> 'location_city'), '');
    v_values := jsonb_set(
      v_values,
      '{location_city}',
      coalesce(to_jsonb(v_location_city), 'null'::jsonb),
      true
    );
  end if;
  if p_values ? 'location_postal_code' then
    if jsonb_typeof(p_values -> 'location_postal_code') not in ('string', 'null')
       or (
         jsonb_typeof(p_values -> 'location_postal_code') = 'string'
         and char_length(btrim(p_values ->> 'location_postal_code')) > 500
       ) then
      raise exception 'invalid appointment location postal code' using errcode = '22023';
    end if;
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

  if p_operation in ('create', 'update', 'move', 'resize') then
    if p_operation = 'create' then
      v_effective_patient_id := nullif(v_base_values ->> 'patient_id', '')::uuid;
      v_effective_date := nullif(v_base_values ->> 'appointment_date', '')::date;
      v_effective_start := nullif(v_base_values ->> 'start_time', '')::time;
      v_effective_duration := nullif(v_base_values ->> 'duration_minutes', '')::integer;
      if v_base_values ? 'end_time' then
        v_effective_end := nullif(v_base_values ->> 'end_time', '')::time;
      elsif v_effective_start is not null and v_effective_duration is not null then
        v_effective_end := v_effective_start
          + make_interval(mins => v_effective_duration);
      end if;
    else
      select *
        into v_current_appointment
        from public.appointments
       where id = p_appointment_id
         and business_id = p_business_id
         and deleted_at is null;

      if found then
        v_effective_patient_id := case
          when v_base_values ? 'patient_id'
            then nullif(v_base_values ->> 'patient_id', '')::uuid
          else v_current_appointment.patient_id
        end;
        v_effective_date := case
          when v_base_values ? 'appointment_date'
            then nullif(v_base_values ->> 'appointment_date', '')::date
          else v_current_appointment.appointment_date
        end;
        v_effective_start := case
          when v_base_values ? 'start_time'
            then nullif(v_base_values ->> 'start_time', '')::time
          else v_current_appointment.start_time
        end;
        v_effective_duration := case
          when v_base_values ? 'duration_minutes'
            then nullif(v_base_values ->> 'duration_minutes', '')::integer
          else v_current_appointment.duration_minutes
        end;
        if v_base_values ? 'end_time' then
          v_effective_end := nullif(v_base_values ->> 'end_time', '')::time;
        elsif v_base_values ?| array['start_time', 'duration_minutes'] then
          v_effective_end := v_effective_start
            + make_interval(mins => v_effective_duration);
        else
          v_effective_end := v_current_appointment.end_time;
        end if;
      end if;
    end if;

    if v_effective_patient_id is not null
       and v_effective_date is not null
       and v_effective_start is not null
       and v_effective_end is not null then
      v_effective_weekday := lower(to_char(v_effective_date, 'FMDay'));

      if exists (
        select 1
          from public.patient_exceptions patient_exception
         where patient_exception.patient_id = v_effective_patient_id
           and patient_exception.exception_date = v_effective_date
           and patient_exception.deleted_at is null
           and patient_exception.is_available = false
           and patient_exception.start_time is null
           and patient_exception.end_time is null
      ) then
        v_availability_warnings := v_availability_warnings
          || jsonb_build_array(jsonb_build_object(
            'code', 'PATIENT_WEEKDAY_PREFERENCE',
            'level', 'warning',
            'message', 'The patient is unavailable on this date.'
          ));
      elsif exists (
        select 1
          from public.patient_exceptions patient_exception
         where patient_exception.patient_id = v_effective_patient_id
           and patient_exception.exception_date = v_effective_date
           and patient_exception.deleted_at is null
           and patient_exception.is_available = true
           and patient_exception.start_time is not null
           and patient_exception.end_time is not null
      ) then
        if not exists (
          select 1
            from public.patient_exceptions patient_exception
           where patient_exception.patient_id = v_effective_patient_id
             and patient_exception.exception_date = v_effective_date
             and patient_exception.deleted_at is null
             and patient_exception.is_available = true
             and patient_exception.start_time is not null
             and patient_exception.end_time is not null
             and v_effective_start >= patient_exception.start_time
             and v_effective_end <= patient_exception.end_time
        ) then
          v_availability_warnings := v_availability_warnings
            || jsonb_build_array(jsonb_build_object(
              'code', 'PATIENT_TIME_PREFERENCE',
              'level', 'warning',
              'message', 'This time is outside the patient date-specific availability.'
            ));
        end if;
      elsif exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_effective_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_effective_weekday
           and (availability.valid_from is null or availability.valid_from <= v_effective_date)
           and (availability.valid_until is null or availability.valid_until >= v_effective_date)
           and availability.is_available = false
      ) then
        v_availability_warnings := v_availability_warnings
          || jsonb_build_array(jsonb_build_object(
            'code', 'PATIENT_WEEKDAY_PREFERENCE',
            'level', 'warning',
            'message', 'The patient is unavailable on this weekday.'
          ));
      elsif exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_effective_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_effective_weekday
           and (availability.valid_from is null or availability.valid_from <= v_effective_date)
           and (availability.valid_until is null or availability.valid_until >= v_effective_date)
           and availability.is_available = true
           and availability.priority::text = 'normal'
      ) and not exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_effective_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_effective_weekday
           and (availability.valid_from is null or availability.valid_from <= v_effective_date)
           and (availability.valid_until is null or availability.valid_until >= v_effective_date)
           and availability.is_available = true
           and availability.priority::text = 'normal'
           and v_effective_start >= availability.start_time
           and v_effective_end <= availability.end_time
      ) then
        v_availability_warnings := v_availability_warnings
          || jsonb_build_array(jsonb_build_object(
            'code', 'PATIENT_TIME_PREFERENCE',
            'level', 'warning',
            'message', 'This time is outside the patient recurring availability.'
          ));
      elsif exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_effective_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_effective_weekday
           and (availability.valid_from is null or availability.valid_from <= v_effective_date)
           and (availability.valid_until is null or availability.valid_until >= v_effective_date)
           and availability.is_available = true
           and availability.priority::text = 'high'
      ) and not exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_effective_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_effective_weekday
           and (availability.valid_from is null or availability.valid_from <= v_effective_date)
           and (availability.valid_until is null or availability.valid_until >= v_effective_date)
           and availability.is_available = true
           and availability.priority::text = 'high'
           and v_effective_start >= availability.start_time
           and v_effective_end <= availability.end_time
      ) then
          v_availability_warnings := v_availability_warnings
          || jsonb_build_array(jsonb_build_object(
            'code', 'PATIENT_TIME_PREFERENCE',
            'level', 'warning',
            'message', 'This time is outside the patient preferred window.'
          ));
      end if;
    end if;
  end if;

  select exists (
    select 1
      from jsonb_array_elements(v_availability_warnings) warning
     where not ((warning ->> 'code') = any(coalesce(p_confirm_warnings, '{}'::text[])))
  )
  into v_missing_availability_warning;
  if v_missing_availability_warning then
    v_response := jsonb_build_object(
      'ok', false,
      'code', 'WARNING_CONFIRMATION',
      'constraints', v_availability_warnings
    );
    update public.calendar_mutation_requests
       set response = v_response,
           completed_at = clock_timestamp()
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key;
    return v_response;
  end if;

  select coalesce(array_agg(distinct warning_code), '{}'::text[])
    into v_internal_confirm_warnings
    from (
      select warning_code
        from unnest(coalesce(p_confirm_warnings, '{}'::text[])) warning_code
      union all
      select 'PATIENT_WEEKDAY_PREFERENCE'
      union all
      select 'PATIENT_TIME_PREFERENCE'
    ) internal_warnings;

  v_internal_idempotency_key := gen_random_uuid();
  v_response := public.calendar_validate_mutation_without_locations(
    p_business_id,
    p_operation,
    p_appointment_id,
    p_expected_version,
    v_internal_idempotency_key,
    v_base_values,
    v_internal_confirm_warnings
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
    v_location_changed :=
      v_location_mode is distinct from v_appointment.location_mode
      or v_location_address is distinct from v_appointment.location_address
      or v_location_city is distinct from v_appointment.location_city
      or v_location_postal_code is distinct from v_appointment.location_postal_code;

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
           location_postal_code = v_location_postal_code,
           location_latitude = case
             when v_location_changed then null else location_latitude
           end,
           location_longitude = case
             when v_location_changed then null else location_longitude
           end,
           location_geocoding_status = case
             when v_location_changed then null else location_geocoding_status
           end,
           location_address_hash = case
             when v_location_changed then null else location_address_hash
           end,
           location_geocoded_at = case
             when v_location_changed then null else location_geocoded_at
           end
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

  if coalesce((v_response ->> 'ok')::boolean, false)
     and p_operation in ('create', 'update', 'move', 'resize')
     and jsonb_array_length(v_availability_warnings) > 0 then
    v_appointment_id := nullif(v_response #>> '{appointment,id}', '')::uuid;
    update public.appointments
       set manual_override = true
     where id = v_appointment_id
       and business_id = p_business_id
       and deleted_at is null
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
