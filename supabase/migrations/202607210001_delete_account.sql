-- GDPR erasure (art. 17): hard-delete every row owned by the calling user, then
-- their business(es) and profile. The auth user itself is removed by the API
-- route via the Admin API afterwards. Ownership is enforced via auth.uid().

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp, public
as $function$
declare
  v_uid uuid := auth.uid();
  v_biz uuid[];
  b uuid;
  t text;
  -- business-scoped tables, deleted before `business`/`profiles`. patients is
  -- last so its child rows (deleted above/here) are already gone.
  tables text[] := array[
    'appointments', 'waiting_list', 'services', 'working_hours',
    'business_holidays', 'algorithm_settings', 'templates',
    'optimization_runs', 'calendar_mutation_requests',
    'optimization_apply_requests', 'route_cache', 'audit_log', 'patients'
  ];
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select array_agg(id) into v_biz from public.business where profile_id = v_uid;

  if v_biz is not null then
    foreach b in array v_biz loop
      -- children not scoped directly by business_id
      begin
        delete from public.patient_availability
         where patient_id in (select id from public.patients where business_id = b);
      exception when undefined_table or undefined_column then null; end;
      begin
        delete from public.optimization_changes
         where optimization_run_id in (select id from public.optimization_runs where business_id = b);
      exception when undefined_table or undefined_column then null; end;

      foreach t in array tables loop
        if to_regclass('public.' || t) is not null then
          begin
            execute format('delete from public.%I where business_id = $1', t) using b;
          exception when undefined_column or undefined_table then null; end;
        end if;
      end loop;
    end loop;
  end if;

  delete from public.business where profile_id = v_uid;
  delete from public.profiles where id = v_uid;
end;
$function$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
