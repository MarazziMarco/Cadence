-- Atomic "create a client and their appointment in one transaction".
--
-- Voice/quick booking often needs to create a brand-new client AND their first
-- appointment together. Doing it in two round-trips can orphan a client when the
-- appointment is rejected (hard constraint) or the user cancels a soft-warning.
--
-- This SECURITY DEFINER function creates/updates the client and then delegates
-- the appointment to the existing calendar_validate_mutation (so all validation,
-- soft-warning, idempotency and audit rules are reused — never duplicated). The
-- client write lives in a plpgsql sub-transaction: if the appointment is NOT
-- applied (hard constraint or an unconfirmed warning), the sub-transaction rolls
-- back and the client is never persisted, while the validation response still
-- flows back to the caller so it can confirm and retry.

create or replace function public.create_appointment_with_client(
  p_business_id uuid,
  p_patient jsonb,           -- {"id": uuid} for existing, else {"first_name","last_name","address","city","postal_code"}
  p_values jsonb,            -- appointment values (patient_id is injected here)
  p_idempotency_key text,
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
  -- Ownership: only the business owner may create for it.
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
      -- Optional address update on the existing client.
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

    -- Not applied: roll back the client insert/update by aborting the block,
    -- carrying the validation response out via DETAIL.
    raise exception 'APPOINTMENT_NOT_APPLIED' using detail = v_result::text;
  exception
    when others then
      if sqlerrm = 'APPOINTMENT_NOT_APPLIED' then
        get stacked diagnostics v_detail = pg_exception_detail;
        return v_detail::jsonb; -- validation response; client rolled back
      end if;
      raise;
  end;
end;
$function$;

revoke all on function public.create_appointment_with_client(uuid, jsonb, jsonb, text, text[]) from public;
grant execute on function public.create_appointment_with_client(uuid, jsonb, jsonb, text, text[]) to authenticated;
