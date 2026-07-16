alter table public.optimization_runs
  add column if not exists batch_id uuid,
  add column if not exists scope_kind text not null default 'custom'
    check (scope_kind in ('day', 'week', 'month', 'custom')),
  add column if not exists scope_from date,
  add column if not exists scope_to date,
  add column if not exists week_key date,
  add column if not exists allow_cross_week boolean not null default false,
  add column if not exists schedule_snapshot jsonb not null default '{}'::jsonb;

alter table public.optimization_changes
  add column if not exists created_appointment_id uuid
    references public.appointments(id);

create table if not exists public.optimization_apply_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  idempotency_key uuid not null,
  action text not null check (action in ('apply', 'undo')),
  request_payload jsonb not null,
  response jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, idempotency_key)
);

alter table public.optimization_apply_requests enable row level security;
revoke all on table public.optimization_apply_requests from anon, authenticated;

create index if not exists optimization_runs_batch_idx
  on public.optimization_runs (business_id, batch_id, created_at);

create or replace function public.apply_optimization_batch(
  p_business_id uuid,
  p_run_ids uuid[],
  p_selected_change_ids uuid[],
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_payload jsonb;
  v_response jsonb;
  v_inserted integer;
  v_run public.optimization_runs%rowtype;
  v_change public.optimization_changes%rowtype;
  v_appointment public.appointments%rowtype;
  v_waiting public.waiting_list%rowtype;
  v_service public.services%rowtype;
  v_snapshot record;
  v_created_id uuid;
  v_duration integer;
  v_selected_count integer;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or coalesce(cardinality(p_run_ids), 0) = 0 then
    raise exception 'invalid optimization apply request' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.business
     where id = p_business_id
       and profile_id = auth.uid()
       and deleted_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object(
    'run_ids', to_jsonb(p_run_ids),
    'selected_change_ids', to_jsonb(coalesce(p_selected_change_ids, '{}'::uuid[]))
  );
  insert into public.optimization_apply_requests (
    business_id, idempotency_key, action, request_payload, created_by
  ) values (
    p_business_id, p_idempotency_key, 'apply', v_payload, auth.uid()
  )
  on conflict (business_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select response
      into v_response
      from public.optimization_apply_requests
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key
       and action = 'apply'
       and request_payload = v_payload
     for update;
    if not found then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    if v_response is null then
      raise exception 'optimization apply is still in progress'
        using errcode = '40001';
    end if;
    return v_response;
  end if;

  perform 1
    from public.optimization_runs
   where id = any(p_run_ids)
     and business_id = p_business_id
     and deleted_at is null
   for update;
  if (select count(*) from public.optimization_runs
       where id = any(p_run_ids)
         and business_id = p_business_id
         and deleted_at is null) <> cardinality(p_run_ids) then
    raise exception 'optimization run not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.optimization_runs
     where id = any(p_run_ids) and accepted
  ) then
    raise exception 'optimization run already applied' using errcode = '23505';
  end if;

  v_selected_count := coalesce(cardinality(p_selected_change_ids), 0);
  if (
    select count(*)
      from public.optimization_changes
     where id = any(coalesce(p_selected_change_ids, '{}'::uuid[]))
       and optimization_run_id = any(p_run_ids)
       and deleted_at is null
  ) <> v_selected_count then
    raise exception 'selected optimization change not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.appointments
   where id in (
     select distinct appointment_id
       from public.optimization_changes
      where optimization_run_id = any(p_run_ids)
        and appointment_id is not null
   )
   for update;

  for v_snapshot in
    select snapshot.key::uuid as appointment_id,
           snapshot.value::integer as expected_version
      from public.optimization_runs run
      cross join lateral jsonb_each_text(
        coalesce(run.schedule_snapshot -> 'appointments', '{}'::jsonb)
      ) snapshot
     where run.id = any(p_run_ids)
  loop
    select *
      into v_appointment
      from public.appointments
     where id = v_snapshot.appointment_id
       and business_id = p_business_id
       and deleted_at is null
     for update;
    if not found or v_appointment.version <> v_snapshot.expected_version then
      raise exception 'STALE_OPTIMIZATION_SNAPSHOT' using errcode = '40001';
    end if;
  end loop;

  if exists (
    select 1
      from public.optimization_changes selected
      join public.optimization_changes other
        on other.optimization_run_id = any(p_run_ids)
       and other.id = any(coalesce(p_selected_change_ids, '{}'::uuid[]))
       and other.id <> selected.id
       and other.new_date = selected.new_date
       and other.new_start_time < selected.new_end_time
       and other.new_end_time > selected.new_start_time
     where selected.id = any(coalesce(p_selected_change_ids, '{}'::uuid[]))
  ) then
    raise exception 'OPTIMIZATION_OVERLAP' using errcode = '23P01';
  end if;

  if exists (
    select 1
      from public.optimization_changes selected
      join public.appointments appointment
        on appointment.business_id = p_business_id
       and appointment.deleted_at is null
       and appointment.status in ('scheduled', 'confirmed')
       and appointment.appointment_date = selected.new_date
       and appointment.start_time < selected.new_end_time
       and appointment.end_time > selected.new_start_time
       and appointment.id not in (
         select coalesce(change.appointment_id, gen_random_uuid())
           from public.optimization_changes change
          where change.id = any(coalesce(p_selected_change_ids, '{}'::uuid[]))
       )
     where selected.id = any(coalesce(p_selected_change_ids, '{}'::uuid[]))
  ) then
    raise exception 'OPTIMIZATION_OVERLAP' using errcode = '23P01';
  end if;

  for v_change in
    select *
      from public.optimization_changes
     where id = any(coalesce(p_selected_change_ids, '{}'::uuid[]))
     order by created_at, id
     for update
  loop
    if v_change.new_date is null
       or v_change.new_start_time is null
       or v_change.new_end_time is null
       or v_change.new_end_time <= v_change.new_start_time then
      raise exception 'invalid optimization change' using errcode = '22023';
    end if;

    if v_change.appointment_id is not null then
      select *
        into v_appointment
        from public.appointments
       where id = v_change.appointment_id
         and business_id = p_business_id
         and deleted_at is null
       for update;
      if not found then
        raise exception 'appointment not found' using errcode = 'P0002';
      end if;

      update public.appointments
         set appointment_date = v_change.new_date,
             start_time = v_change.new_start_time,
             end_time = v_change.new_end_time,
             duration_minutes = greatest(
               1,
               extract(epoch from (v_change.new_end_time - v_change.new_start_time))::integer / 60
             ),
             version = version + 1,
             updated_by = auth.uid(),
             updated_at = now(),
             last_ai_update = now(),
             optimization_run_id = v_change.optimization_run_id
       where id = v_change.appointment_id;

      update public.waiting_list
         set active = false,
             matched_appointment_id = v_change.appointment_id,
             matched_at = now(),
             updated_at = now()
       where business_id = p_business_id
         and patient_id = v_change.patient_id
         and active
         and deleted_at is null
         and notes like '%' || v_change.appointment_id::text || '%';

      insert into public.audit_log (
        business_id, profile_id, table_name, record_id, action, old_data, new_data
      ) values (
        p_business_id, auth.uid(), 'appointments', v_change.appointment_id,
        'update'::public.audit_action, to_jsonb(v_appointment),
        jsonb_build_object(
          'appointment_date', v_change.new_date,
          'start_time', v_change.new_start_time,
          'end_time', v_change.new_end_time
        )
      );
    else
      v_service := null;
      select *
        into v_waiting
        from public.waiting_list
       where business_id = p_business_id
         and patient_id = v_change.patient_id
         and active
         and matched_appointment_id is null
         and deleted_at is null
       order by created_at
       limit 1
       for update;
      if not found then
        raise exception 'waiting-list entry not found' using errcode = 'P0002';
      end if;

      if v_waiting.preferred_service_id is not null then
        select * into v_service
          from public.services
         where id = v_waiting.preferred_service_id
           and business_id = p_business_id
           and deleted_at is null;
      end if;
      v_duration := greatest(
        1,
        extract(epoch from (v_change.new_end_time - v_change.new_start_time))::integer / 60
      );
      insert into public.appointments (
        business_id, patient_id, service_id, appointment_date,
        start_time, end_time, duration_minutes, price, status, source,
        generated_by_ai, optimization_run_id, created_by, updated_by
      ) values (
        p_business_id, v_change.patient_id, v_waiting.preferred_service_id,
        v_change.new_date, v_change.new_start_time, v_change.new_end_time,
        v_duration, coalesce(v_service.price, 0), 'scheduled', 'ai',
        true, v_change.optimization_run_id, auth.uid(), auth.uid()
      )
      returning id into v_created_id;

      update public.waiting_list
         set active = false,
             matched_appointment_id = v_created_id,
             matched_at = now(),
             updated_at = now()
       where id = v_waiting.id;

      update public.optimization_changes
         set created_appointment_id = v_created_id
       where id = v_change.id;

      insert into public.audit_log (
        business_id, profile_id, table_name, record_id, action, new_data
      ) values (
        p_business_id, auth.uid(), 'appointments', v_created_id,
        'create'::public.audit_action,
        jsonb_build_object(
          'appointment_date', v_change.new_date,
          'start_time', v_change.new_start_time,
          'end_time', v_change.new_end_time
        )
      );
    end if;

    update public.optimization_changes
       set accepted = true, updated_at = now()
     where id = v_change.id;
  end loop;

  update public.optimization_changes
     set deleted_at = now(), updated_at = now()
   where optimization_run_id = any(p_run_ids)
     and deleted_at is null
     and not (id = any(coalesce(p_selected_change_ids, '{}'::uuid[])));

  update public.optimization_runs
     set accepted = true, updated_at = now()
   where id = any(p_run_ids);

  v_response := jsonb_build_object(
    'ok', true,
    'runIds', to_jsonb(p_run_ids),
    'appliedChangeIds', to_jsonb(coalesce(p_selected_change_ids, '{}'::uuid[]))
  );
  update public.optimization_apply_requests
     set response = v_response, completed_at = now()
   where business_id = p_business_id
     and idempotency_key = p_idempotency_key;
  return v_response;
end;
$function$;

create or replace function public.undo_optimization_run(
  p_business_id uuid,
  p_run_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_payload jsonb;
  v_response jsonb;
  v_inserted integer;
  v_change public.optimization_changes%rowtype;
  v_appointment public.appointments%rowtype;
  v_expected_version integer;
  v_undone integer := 0;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business
     where id = p_business_id
       and profile_id = auth.uid()
       and deleted_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object('run_id', p_run_id);
  insert into public.optimization_apply_requests (
    business_id, idempotency_key, action, request_payload, created_by
  ) values (
    p_business_id, p_idempotency_key, 'undo', v_payload, auth.uid()
  )
  on conflict (business_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select response into v_response
      from public.optimization_apply_requests
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key
       and action = 'undo'
       and request_payload = v_payload
     for update;
    if not found then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = '22023';
    end if;
    if v_response is null then
      raise exception 'optimization undo is still in progress'
        using errcode = '40001';
    end if;
    return v_response;
  end if;

  perform 1 from public.optimization_runs
   where id = p_run_id
     and business_id = p_business_id
     and accepted
     and deleted_at is null
   for update;
  if not found then
    raise exception 'applied optimization run not found' using errcode = 'P0002';
  end if;

  for v_change in
    select * from public.optimization_changes
     where optimization_run_id = p_run_id
       and accepted
     order by created_at desc, id desc
     for update
  loop
    if v_change.appointment_id is not null then
      select coalesce(
        (run.schedule_snapshot -> 'appointments' ->> v_change.appointment_id::text)::integer,
        0
      )
        into v_expected_version
        from public.optimization_runs run
       where run.id = p_run_id;

      select * into v_appointment
        from public.appointments
       where id = v_change.appointment_id
         and business_id = p_business_id
         and deleted_at is null
       for update;
      if not found
         or v_appointment.version <> v_expected_version + 1
         or v_appointment.appointment_date <> v_change.new_date
         or v_appointment.start_time <> v_change.new_start_time
         or v_appointment.end_time <> v_change.new_end_time then
        raise exception 'STALE_OPTIMIZATION_UNDO' using errcode = '40001';
      end if;

      update public.appointments
         set appointment_date = v_change.old_date,
             start_time = v_change.old_start_time,
             end_time = v_change.old_end_time,
             duration_minutes = greatest(
               1,
               extract(epoch from (v_change.old_end_time - v_change.old_start_time))::integer / 60
             ),
             version = version + 1,
             updated_by = auth.uid(),
             updated_at = now()
       where id = v_change.appointment_id;

      update public.waiting_list
         set active = true,
             matched_appointment_id = null,
             matched_at = null,
             updated_at = now()
       where business_id = p_business_id
         and matched_appointment_id = v_change.appointment_id
         and deleted_at is null;
    else
      select * into v_appointment
        from public.appointments
       where id = v_change.created_appointment_id
         and business_id = p_business_id
         and deleted_at is null
       for update;
      if not found then
        raise exception 'STALE_OPTIMIZATION_UNDO' using errcode = '40001';
      end if;
      update public.appointments
         set deleted_at = now(),
             version = version + 1,
             updated_by = auth.uid(),
             updated_at = now()
       where id = v_change.created_appointment_id;
      update public.waiting_list
         set active = true,
             matched_appointment_id = null,
             matched_at = null,
             updated_at = now()
       where business_id = p_business_id
         and matched_appointment_id = v_change.created_appointment_id
         and deleted_at is null;
    end if;

    update public.optimization_changes
       set accepted = false, updated_at = now()
     where id = v_change.id;
    v_undone := v_undone + 1;
  end loop;

  update public.optimization_runs
     set accepted = false, updated_at = now()
   where id = p_run_id;
  v_response := jsonb_build_object(
    'ok', true, 'runId', p_run_id, 'undone', v_undone
  );
  update public.optimization_apply_requests
     set response = v_response, completed_at = now()
   where business_id = p_business_id
     and idempotency_key = p_idempotency_key;
  return v_response;
end;
$function$;

revoke all on function public.apply_optimization_batch(uuid, uuid[], uuid[], uuid)
  from public, anon;
grant execute on function public.apply_optimization_batch(uuid, uuid[], uuid[], uuid)
  to authenticated;
revoke all on function public.undo_optimization_run(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.undo_optimization_run(uuid, uuid, uuid)
  to authenticated;
