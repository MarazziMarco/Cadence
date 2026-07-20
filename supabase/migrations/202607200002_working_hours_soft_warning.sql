-- Moving/creating an appointment outside working hours is now a confirmable
-- warning instead of a hard block (calendar_validate_mutation).

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
  v_response jsonb;
  v_stored_payload jsonb;
  v_stored_hash text;
  v_request_payload jsonb;
  v_request_hash text;
  v_confirm_warnings jsonb;
  v_allowed_keys text[];
  v_old public.appointments%rowtype;
  v_new public.appointments%rowtype;
  v_business public.business%rowtype;
  v_working public.working_hours%rowtype;
  v_date date;
  v_start time;
  v_end time;
  v_duration integer;
  v_patient_id uuid;
  v_service_id uuid;
  v_title text;
  v_description text;
  v_price numeric;
  v_status public.appointment_status;
  v_source public.booking_source;
  v_confirmed boolean;
  v_locked boolean;
  v_color text;
  v_internal_notes text;
  v_buffer_before integer := 0;
  v_buffer_after integer := 0;
  v_service_max integer;
  v_weekday text;
  v_hard jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_missing_warning boolean := false;
  v_manual_override boolean := false;
  v_audit_action public.audit_action;
  v_schedule_validation boolean := false;
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
  if exists (
    select 1
      from unnest(coalesce(p_confirm_warnings, '{}'::text[])) warning_code
     where warning_code is null
        or warning_code not in (
       'OVERLAP', 'LOCKED', 'CLOSED_DAY', 'HOLIDAY',
       'OUTSIDE_WORKING_HOURS', 'INVALID_DURATION', 'SERVICE_DAILY_LIMIT',
       'PATIENT_WEEKDAY_PREFERENCE', 'PATIENT_TIME_PREFERENCE',
       'BUSINESS_DAILY_TARGET', 'STALE_VERSION'
     )
  ) then
    raise exception 'invalid calendar warning code' using errcode = '22023';
  end if;

  v_allowed_keys := case p_operation
    when 'create' then array[
      'patient_id', 'service_id', 'title', 'description', 'appointment_date',
      'start_time', 'end_time', 'duration_minutes', 'price', 'status', 'source',
      'confirmed', 'locked', 'color', 'internal_notes'
    ]
    when 'update' then array[
      'patient_id', 'service_id', 'title', 'description', 'appointment_date',
      'start_time', 'end_time', 'duration_minutes', 'price', 'status', 'source',
      'confirmed', 'locked', 'color', 'internal_notes'
    ]
    when 'move' then array['appointment_date', 'start_time', 'end_time']
    when 'resize' then array['duration_minutes', 'end_time']
    else '{}'::text[]
  end;
  if exists (
    select 1
      from jsonb_object_keys(p_values) value_key
     where not (value_key = any(v_allowed_keys))
  ) then
    raise exception 'calendar mutation contains fields not allowed for operation'
      using errcode = '22023';
  end if;

  if p_operation <> 'create' then
    if p_appointment_id is null or p_expected_version is null then
      raise exception 'appointment id and expected version are required' using errcode = '22023';
    end if;
  elsif p_appointment_id is not null or p_expected_version is not null then
    raise exception 'create cannot target an appointment' using errcode = '22023';
  end if;
  if p_operation = 'create'
     and (
       not (p_values ? 'patient_id')
       or not (p_values ? 'appointment_date')
       or not (p_values ? 'start_time')
       or not (p_values ? 'duration_minutes')
     ) then
    raise exception 'create is missing required appointment values' using errcode = '22023';
  end if;
  if p_operation = 'move'
     and (not (p_values ? 'appointment_date') or not (p_values ? 'start_time')) then
    raise exception 'move requires appointment_date and start_time' using errcode = '22023';
  end if;
  if p_operation = 'resize' and not (p_values ? 'duration_minutes') then
    raise exception 'resize requires duration_minutes' using errcode = '22023';
  end if;

  select *
    into v_business
    from public.business
   where id = p_business_id
     and profile_id = auth.uid()
     and deleted_at is null;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
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
    'values', p_values,
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

  if p_operation <> 'create' then
    select *
      into v_old
      from public.appointments
     where id = p_appointment_id
       and business_id = p_business_id
       and deleted_at is null
     for update;
    if not found then
      raise exception 'appointment not found' using errcode = 'P0002';
    end if;

    if v_old.version <> p_expected_version then
      v_hard := jsonb_build_array(jsonb_build_object(
        'code', 'STALE_VERSION',
        'level', 'hard',
        'message', 'The appointment changed since it was loaded.'
      ));
      v_response := jsonb_build_object(
        'ok', false,
        'code', 'STALE_VERSION',
        'constraints', v_hard
      );
      update public.calendar_mutation_requests
         set response = v_response,
             completed_at = clock_timestamp()
       where business_id = p_business_id
         and idempotency_key = p_idempotency_key;
      return v_response;
    end if;
  end if;

  if p_operation = 'create' then
    v_patient_id := nullif(p_values ->> 'patient_id', '')::uuid;
    v_service_id := nullif(p_values ->> 'service_id', '')::uuid;
    v_date := nullif(p_values ->> 'appointment_date', '')::date;
    v_start := nullif(p_values ->> 'start_time', '')::time;
    v_duration := nullif(p_values ->> 'duration_minutes', '')::integer;
    if p_values ? 'end_time' then
      v_end := nullif(p_values ->> 'end_time', '')::time;
    elsif v_start is not null and v_duration is not null then
      v_end := v_start + make_interval(mins => v_duration);
    end if;
    v_title := p_values ->> 'title';
    v_description := p_values ->> 'description';
    v_price := coalesce(nullif(p_values ->> 'price', '')::numeric, 0);
    v_status := coalesce(
      nullif(p_values ->> 'status', '')::public.appointment_status,
      'scheduled'::public.appointment_status
    );
    v_source := coalesce(
      nullif(p_values ->> 'source', '')::public.booking_source,
      'manual'::public.booking_source
    );
    v_confirmed := coalesce(nullif(p_values ->> 'confirmed', '')::boolean, false);
    v_locked := coalesce(nullif(p_values ->> 'locked', '')::boolean, false);
    v_color := p_values ->> 'color';
    v_internal_notes := p_values ->> 'internal_notes';
    v_manual_override := false;
  else
    v_patient_id := case when p_values ? 'patient_id'
      then nullif(p_values ->> 'patient_id', '')::uuid else v_old.patient_id end;
    v_service_id := case when p_values ? 'service_id'
      then nullif(p_values ->> 'service_id', '')::uuid else v_old.service_id end;
    v_date := case when p_values ? 'appointment_date'
      then nullif(p_values ->> 'appointment_date', '')::date else v_old.appointment_date end;
    v_start := case when p_values ? 'start_time'
      then nullif(p_values ->> 'start_time', '')::time else v_old.start_time end;
    v_duration := case when p_values ? 'duration_minutes'
      then nullif(p_values ->> 'duration_minutes', '')::integer else v_old.duration_minutes end;
    if p_values ? 'end_time' then
      v_end := nullif(p_values ->> 'end_time', '')::time;
    elsif p_values ? 'start_time' or p_values ? 'duration_minutes' then
      v_end := v_start + make_interval(mins => v_duration);
    else
      v_end := v_old.end_time;
    end if;
    v_title := case when p_values ? 'title' then p_values ->> 'title' else v_old.title end;
    v_description := case when p_values ? 'description'
      then p_values ->> 'description' else v_old.description end;
    v_price := case when p_values ? 'price'
      then nullif(p_values ->> 'price', '')::numeric else v_old.price end;
    v_status := case when p_values ? 'status'
      then nullif(p_values ->> 'status', '')::public.appointment_status else v_old.status end;
    v_source := case when p_values ? 'source'
      then nullif(p_values ->> 'source', '')::public.booking_source else v_old.source end;
    v_confirmed := case when p_values ? 'confirmed'
      then nullif(p_values ->> 'confirmed', '')::boolean else v_old.confirmed end;
    v_locked := case
      when p_operation = 'lock' then true
      when p_operation = 'unlock' then false
      when p_values ? 'locked' then nullif(p_values ->> 'locked', '')::boolean
      else v_old.locked
    end;
    v_color := case when p_values ? 'color' then p_values ->> 'color' else v_old.color end;
    v_internal_notes := case when p_values ? 'internal_notes'
      then p_values ->> 'internal_notes' else v_old.internal_notes end;
    v_manual_override := v_old.manual_override;
  end if;

  if (p_operation = 'create' or p_values ? 'patient_id')
     and (
       v_patient_id is null
       or not exists (
         select 1
           from public.patients
          where id = v_patient_id
            and business_id = p_business_id
            and deleted_at is null
       )
     ) then
    raise exception 'patient not found' using errcode = '23503';
  end if;
  if (p_operation = 'create' or p_values ? 'service_id')
     and v_service_id is not null
     and not exists (
       select 1
         from public.services
        where id = v_service_id
          and business_id = p_business_id
          and deleted_at is null
     ) then
    raise exception 'service not found' using errcode = '23503';
  end if;

  v_schedule_validation := p_operation in ('create', 'move', 'resize')
    or (
      p_operation = 'update'
      and (
        p_values ? 'patient_id'
        or p_values ? 'service_id'
        or p_values ? 'appointment_date'
        or p_values ? 'start_time'
        or p_values ? 'end_time'
        or p_values ? 'duration_minutes'
      )
    );

  if v_schedule_validation then
    if v_date is null
       or v_start is null
       or v_end is null
       or v_duration is null
       or v_duration <= 0
       or v_end <= v_start
       or extract(epoch from (v_end - v_start))::integer <> v_duration * 60 then
      v_hard := v_hard || jsonb_build_array(jsonb_build_object(
        'code', 'INVALID_DURATION',
        'level', 'hard',
        'message', 'The appointment must have a positive duration and end after it starts.'
      ));
    end if;

    if p_operation <> 'create'
       and v_old.locked
       and (
         v_date is distinct from v_old.appointment_date
         or v_start is distinct from v_old.start_time
         or v_end is distinct from v_old.end_time
         or v_duration is distinct from v_old.duration_minutes
       ) then
      v_hard := v_hard || jsonb_build_array(jsonb_build_object(
        'code', 'LOCKED',
        'level', 'hard',
        'message', 'Unlock the appointment before moving or resizing it.'
      ));
    end if;

    if v_date is not null and v_start is not null and v_end is not null and v_duration > 0 then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_business_id::text || ':' || v_date::text, 0)
      );

      select
        coalesce(s.buffer_before_minutes, v_business.default_buffer_minutes, 0),
        coalesce(s.buffer_after_minutes, v_business.default_buffer_minutes, 0),
        s.max_daily_bookings
        into v_buffer_before, v_buffer_after, v_service_max
        from (select 1) seed
        left join public.services s on s.id = v_service_id;

      if exists (
        select 1
          from public.appointments a
          left join public.services existing_service on existing_service.id = a.service_id
         where a.business_id = p_business_id
           and a.deleted_at is null
           and a.status::text <> 'cancelled'
           and a.appointment_date = v_date
           and (p_appointment_id is null or a.id <> p_appointment_id)
           and (
             (v_date + v_start) - make_interval(mins => v_buffer_before)
             < (a.appointment_date + a.end_time)
               + make_interval(mins => coalesce(
                 existing_service.buffer_after_minutes,
                 v_business.default_buffer_minutes,
                 0
               ))
           )
           and (
             (v_date + v_end) + make_interval(mins => v_buffer_after)
             > (a.appointment_date + a.start_time)
               - make_interval(mins => coalesce(
                 existing_service.buffer_before_minutes,
                 v_business.default_buffer_minutes,
                 0
               ))
           )
      ) then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code', 'OVERLAP',
          'level', 'hard',
          'message', 'The appointment overlaps another active appointment or its service buffer.'
        ));
      end if;

      if exists (
        select 1
          from public.business_holidays holiday
         where holiday.business_id = p_business_id
           and holiday.deleted_at is null
           and holiday.is_closed
           and holiday.affects_scheduler
           and v_date between holiday.start_date and holiday.end_date
      ) then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code', 'HOLIDAY',
          'level', 'hard',
          'message', 'The business is closed for a holiday or closure.'
        ));
      end if;

      v_weekday := lower(trim(to_char(v_date, 'FMDay')));
      select *
        into v_working
        from public.working_hours
       where business_id = p_business_id
         and weekday::text = v_weekday
       limit 1;
      if not found or not v_working.is_open then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code', 'CLOSED_DAY',
          'level', 'hard',
          'message', 'The business is closed on this weekday.'
        ));
      elsif not (
        (
          v_working.morning_start is not null
          and v_working.morning_end is not null
          and v_start >= v_working.morning_start
          and v_end <= v_working.morning_end
        )
        or (
          v_working.afternoon_start is not null
          and v_working.afternoon_end is not null
          and v_start >= v_working.afternoon_start
          and v_end <= v_working.afternoon_end
        )
      )
      or (
        v_business.lunch_break_enabled
        and v_business.lunch_start is not null
        and v_business.lunch_end is not null
        and v_start < v_business.lunch_end
        and v_end > v_business.lunch_start
      ) then
        -- Outside working hours is a soft warning (confirmable), not a block:
        -- the user may deliberately place an appointment off-hours.
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'code', 'OUTSIDE_WORKING_HOURS',
          'level', 'warning',
          'message', 'The appointment is outside an available working-hours window.'
        ));
      end if;

      if v_service_id is not null
         and v_service_max is not null
         and (
           select count(*)
             from public.appointments a
            where a.business_id = p_business_id
              and a.service_id = v_service_id
              and a.appointment_date = v_date
              and a.deleted_at is null
              and a.status::text <> 'cancelled'
              and (p_appointment_id is null or a.id <> p_appointment_id)
         ) >= v_service_max then
        v_hard := v_hard || jsonb_build_array(jsonb_build_object(
          'code', 'SERVICE_DAILY_LIMIT',
          'level', 'hard',
          'message', 'This service has reached its daily booking limit.'
        ));
      end if;

      -- Match the optimizer's effectiveAvailability precedence:
      -- full-day exception blackout, timed exception override, then recurring
      -- weekday windows. No recurring rule for this weekday is permissive.
      if exists (
        select 1
          from public.patient_exceptions patient_exception
         where patient_exception.patient_id = v_patient_id
           and patient_exception.exception_date = v_date
           and patient_exception.deleted_at is null
           and patient_exception.is_available = false
           and patient_exception.start_time is null
           and patient_exception.end_time is null
      ) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'code', 'PATIENT_WEEKDAY_PREFERENCE',
          'level', 'warning',
          'message', 'The patient is unavailable on this date.'
        ));
      elsif exists (
        select 1
          from public.patient_exceptions patient_exception
         where patient_exception.patient_id = v_patient_id
           and patient_exception.exception_date = v_date
           and patient_exception.deleted_at is null
           and patient_exception.is_available = true
           and patient_exception.start_time is not null
           and patient_exception.end_time is not null
      ) then
        if not exists (
          select 1
            from public.patient_exceptions patient_exception
           where patient_exception.patient_id = v_patient_id
             and patient_exception.exception_date = v_date
             and patient_exception.deleted_at is null
             and patient_exception.is_available = true
             and patient_exception.start_time is not null
             and patient_exception.end_time is not null
             and v_start >= patient_exception.start_time
             and v_end <= patient_exception.end_time
        ) then
          v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
            'code', 'PATIENT_TIME_PREFERENCE',
            'level', 'warning',
            'message', 'This time is outside the patient date-specific availability.'
          ));
        end if;
      elsif exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_weekday
           and (availability.valid_from is null or availability.valid_from <= v_date)
           and (availability.valid_until is null or availability.valid_until >= v_date)
      ) and not exists (
        select 1
          from public.patient_availability availability
         where availability.patient_id = v_patient_id
           and availability.deleted_at is null
           and availability.recurring
           and availability.weekday::text = v_weekday
           and (availability.valid_from is null or availability.valid_from <= v_date)
           and (availability.valid_until is null or availability.valid_until >= v_date)
           and v_start >= availability.start_time
           and v_end <= availability.end_time
      ) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'code', 'PATIENT_TIME_PREFERENCE',
          'level', 'warning',
          'message', 'This time is outside the patient recurring availability.'
        ));
      end if;

      if v_business.max_daily_appointments is not null
         and (
           select count(*)
             from public.appointments a
            where a.business_id = p_business_id
              and a.appointment_date = v_date
              and a.deleted_at is null
              and a.status::text <> 'cancelled'
              and (p_appointment_id is null or a.id <> p_appointment_id)
         ) >= v_business.max_daily_appointments then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'code', 'BUSINESS_DAILY_TARGET',
          'level', 'warning',
          'message', 'The business daily appointment target has been reached.'
        ));
      end if;
    end if;
  end if;

  if jsonb_array_length(v_hard) > 0 then
    v_response := jsonb_build_object(
      'ok', false,
      'code', 'HARD_CONSTRAINT',
      'constraints', v_hard
    );
    update public.calendar_mutation_requests
       set response = v_response,
           completed_at = clock_timestamp()
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key;
    return v_response;
  end if;

  select exists (
    select 1
      from jsonb_array_elements(v_warnings) warning
     where not ((warning ->> 'code') = any(coalesce(p_confirm_warnings, '{}'::text[])))
  )
  into v_missing_warning;
  if v_missing_warning then
    v_response := jsonb_build_object(
      'ok', false,
      'code', 'WARNING_CONFIRMATION',
      'constraints', v_warnings
    );
    update public.calendar_mutation_requests
       set response = v_response,
           completed_at = clock_timestamp()
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key;
    return v_response;
  end if;

  if jsonb_array_length(v_warnings) > 0 then
    v_manual_override := true;
  end if;

  if p_operation = 'create' then
    insert into public.appointments (
      business_id, patient_id, service_id, title, description, appointment_date,
      start_time, end_time, duration_minutes, price, status, source, confirmed,
      locked, color, internal_notes, manual_override, version, created_by, updated_by
    )
    values (
      p_business_id, v_patient_id, v_service_id, v_title, v_description, v_date,
      v_start, v_end, v_duration, v_price, v_status, v_source, v_confirmed,
      v_locked, v_color, v_internal_notes, v_manual_override, 1, auth.uid(), auth.uid()
    )
    returning * into v_new;
    v_audit_action := 'create'::public.audit_action;
  elsif p_operation = 'delete' then
    update public.appointments
       set deleted_at = clock_timestamp(),
           updated_at = clock_timestamp(),
           updated_by = auth.uid(),
           version = version + 1
     where id = p_appointment_id
     returning * into v_new;
    v_audit_action := 'delete'::public.audit_action;
  else
    update public.appointments
       set patient_id = v_patient_id,
           service_id = v_service_id,
           title = v_title,
           description = v_description,
           appointment_date = v_date,
           start_time = v_start,
           end_time = v_end,
           duration_minutes = v_duration,
           price = v_price,
           status = v_status,
           source = v_source,
           confirmed = v_confirmed,
           locked = v_locked,
           color = v_color,
           internal_notes = v_internal_notes,
           manual_override = v_manual_override,
           updated_at = clock_timestamp(),
           updated_by = auth.uid(),
           version = version + 1
     where id = p_appointment_id
     returning * into v_new;
    v_audit_action := 'update'::public.audit_action;
  end if;

  insert into public.audit_log (
    business_id, profile_id, table_name, record_id, action, old_data, new_data
  )
  values (
    p_business_id,
    auth.uid(),
    'appointments',
    v_new.id,
    v_audit_action,
    case when p_operation = 'create' then null else to_jsonb(v_old) end,
    case when p_operation = 'delete' then null else to_jsonb(v_new) end
  );

  v_response := jsonb_build_object(
    'ok', true,
    'appointment', case when p_operation = 'delete' then null else to_jsonb(v_new) end,
    'warnings', v_warnings
  );
  update public.calendar_mutation_requests
     set response = v_response,
         completed_at = clock_timestamp()
   where business_id = p_business_id
     and idempotency_key = p_idempotency_key;
  return v_response;
end;
$function$;

