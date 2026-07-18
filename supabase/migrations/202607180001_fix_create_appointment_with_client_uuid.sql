-- Align the atomic voice-booking RPC with calendar_validate_mutation.
--
-- The original wrapper accepted p_idempotency_key as text, then passed it to
-- calendar_validate_mutation whose corresponding argument is uuid. PostgreSQL
-- therefore attempted to resolve a non-existent (..., text, jsonb, text[])
-- overload. Recreate the wrapper with the correct UUID argument type.

drop function if exists public.create_appointment_with_client(
  uuid, jsonb, jsonb, text, text[]
);

create or replace function public.create_appointment_with_client(
  p_business_id uuid,
  p_patient jsonb,
  p_values jsonb,
  p_idempotency_key uuid,
  p_confirm_warnings text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_patient_id uuid;
  v_values jsonb;
  v_result jsonb;
  v_patient public.patients;
  v_detail text;
begin
  if not exists (
    select 1 from public.business b
     where b.id = p_business_id
       and b.profile_id = auth.uid()
       and b.deleted_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    if p_patient ? 'id' and nullif(p_patient ->> 'id', '') is not null then
      v_patient_id := (p_patient ->> 'id')::uuid;
      if not exists (
        select 1 from public.patients p
         where p.id = v_patient_id
           and p.business_id = p_business_id
           and p.deleted_at is null
      ) then
        raise exception 'patient not found' using errcode = 'P0002';
      end if;

      if p_patient ? 'address' then
        update public.patients
           set address = nullif(p_patient ->> 'address', ''),
               city = nullif(p_patient ->> 'city', ''),
               postal_code = nullif(p_patient ->> 'postal_code', ''),
               updated_at = clock_timestamp()
         where id = v_patient_id;
      end if;
    else
      insert into public.patients (
        business_id, first_name, last_name, address, city, postal_code
      )
      values (
        p_business_id,
        nullif(p_patient ->> 'first_name', ''),
        nullif(p_patient ->> 'last_name', ''),
        nullif(p_patient ->> 'address', ''),
        nullif(p_patient ->> 'city', ''),
        nullif(p_patient ->> 'postal_code', '')
      )
      returning id into v_patient_id;
    end if;

    v_values := coalesce(p_values, '{}'::jsonb)
      || jsonb_build_object('patient_id', v_patient_id::text);

    v_result := public.calendar_validate_mutation(
      p_business_id,
      'create',
      null,
      null,
      p_idempotency_key,
      v_values,
      p_confirm_warnings
    );

    if coalesce((v_result ->> 'ok')::boolean, false) then
      select * into v_patient from public.patients where id = v_patient_id;
      return jsonb_build_object(
        'ok', true,
        'appointment', v_result -> 'appointment',
        'patient', to_jsonb(v_patient),
        'warnings', coalesce(v_result -> 'warnings', '[]'::jsonb)
      );
    end if;

    raise exception 'APPOINTMENT_NOT_APPLIED' using detail = v_result::text;
  exception
    when others then
      if sqlerrm = 'APPOINTMENT_NOT_APPLIED' then
        get stacked diagnostics v_detail = pg_exception_detail;
        return v_detail::jsonb;
      end if;
      raise;
  end;
end;
$function$;

revoke all on function public.create_appointment_with_client(
  uuid, jsonb, jsonb, uuid, text[]
) from public, anon;
grant execute on function public.create_appointment_with_client(
  uuid, jsonb, jsonb, uuid, text[]
) to authenticated;

notify pgrst, 'reload schema';
