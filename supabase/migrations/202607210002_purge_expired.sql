-- GDPR retention (audit 06/11): physically remove data past its retention.
-- purge_expired() deletes expired route cache, soft-deleted operational rows
-- older than 90 days, and optimizer history older than 90 days. Scheduled daily
-- via pg_cron when available; otherwise it stays callable (enable pg_cron in
-- Supabase, or call it from an external cron / Vercel Cron).

create or replace function public.purge_expired()
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp, public
as $function$
declare
  t text;
  soft_tables text[] := array[
    'patients', 'appointments', 'services', 'waiting_list', 'templates',
    'business_holidays', 'working_hours', 'patient_availability',
    'algorithm_settings'
  ];
begin
  -- Expired routing cache (retention: on expiry).
  begin
    delete from public.route_cache where expires_at < now();
  exception when undefined_table or undefined_column then null; end;

  -- Soft-deleted operational rows older than 90 days.
  foreach t in array soft_tables loop
    if to_regclass('public.' || t) is not null then
      begin
        execute format(
          'delete from public.%I where deleted_at is not null and deleted_at < now() - interval ''90 days''',
          t
        );
      exception when undefined_column or undefined_table then null; end;
    end if;
  end loop;

  -- Optimizer history older than 90 days (children first).
  begin
    delete from public.optimization_changes
     where optimization_run_id in (
       select id from public.optimization_runs
        where created_at < now() - interval '90 days');
  exception when undefined_table or undefined_column then null; end;
  begin
    delete from public.optimization_runs where created_at < now() - interval '90 days';
  exception when undefined_table or undefined_column then null; end;
  begin
    delete from public.optimization_apply_requests where created_at < now() - interval '90 days';
  exception when undefined_table or undefined_column then null; end;
  begin
    delete from public.calendar_mutation_requests where created_at < now() - interval '90 days';
  exception when undefined_table or undefined_column then null; end;
end;
$function$;

revoke all on function public.purge_expired() from public;

-- Schedule daily at 03:30 via pg_cron, best effort. If pg_cron is unavailable or
-- privileges are insufficient, this block is skipped and the function remains
-- callable (enable pg_cron in the Supabase dashboard, then run cron.schedule).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    begin
      perform cron.unschedule('cadence-purge-expired');
    exception when others then null; end;
    perform cron.schedule(
      'cadence-purge-expired', '30 3 * * *', 'select public.purge_expired();'
    );
  end if;
exception when others then null;
end $$;
