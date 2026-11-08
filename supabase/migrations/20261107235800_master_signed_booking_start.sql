-- A service-managed grant permits a signed booking to start a pinned Master dance.
-- It is independent of code review exemptions and never creates an operator check-in.
create table public.agentech_master_booking_start_grants (
  profile_id bigint primary key references public.agentech_account_profiles(id) on delete cascade,
  account_email text not null references public.agentech_accounts(email) on delete cascade
);
alter table public.agentech_master_booking_start_grants enable row level security;
revoke all on public.agentech_master_booking_start_grants from public, anon, authenticated, service_role;
grant select on public.agentech_master_booking_start_grants to service_role;

create function public.body_booking_starts_automatically(s public.agentech_robot_sessions)
returns boolean language sql stable security invoker set search_path = '' as $$
  select s.robot_model = 'Master' and s.approved_run_type = 'custom_code'
    and s.code_submission_id like 'master-body-%' and exists (
      select 1 from public.agentech_master_booking_start_grants g
      join public.agentech_account_profiles p on p.id = g.profile_id and p.account_email = g.account_email
      where g.profile_id = s.access_profile_id and g.account_email = s.email and p.profile_type = 'developer'
    )
$$;
revoke all on function public.body_booking_starts_automatically(public.agentech_robot_sessions) from public, anon, authenticated;
grant execute on function public.body_booking_starts_automatically(public.agentech_robot_sessions) to service_role;

alter table public.agentech_robot_sessions add column body_start_authority text
  check (body_start_authority in ('signed_booking','onsite_check_in'));

create or replace function public.agentech_claim_body_booking(
  p_email text,p_session bigint,p_asset uuid,p_start timestamptz,p_end timestamptz,p_confirmed timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.agentech_robot_sessions s
  set session_status = 'running', body_start_authority = case when p_confirmed is null then 'signed_booking' else 'onsite_check_in' end
  from public.agentech_code_submissions c
  where s.id = p_session and s.email = p_email
    and s.code_submission_id = 'master-body-' || p_asset::text and s.code_submission_id = c.id and c.email = s.email
    and c.code = 'Agentech.play_body("linkcraft_resource_onnx_ffkuaile_0.0.1", audio_path="")'
    and c.ai_security_model = 'master-native-asset-v1' and c.run_mode = 'master-native-asset-v1'
    and c.physical_safety_status = 'passed' and c.ai_security_status = 'passed'
    and s.approved_run_type = 'custom_code' and s.robot_model = 'Master'
    and s.scheduled_start = p_start and s.scheduled_end = p_end
    and s.session_status in ('approved','confirmed','scheduled','requested','pending')
    and now() between p_start and p_end - interval '80 seconds'
    and public.agentech_happy_dance_asset(p_email,p_asset)
    and (
      (p_confirmed is null and public.body_booking_starts_automatically(s))
      or (p_confirmed is not null and exists (
        select 1 from public.agentech_body_operator_ready r
        where r.session_id = s.id and r.email = s.email and r.asset_id = p_asset
          and r.booked_start = p_start and r.booked_end = p_end and r.confirmed_at = p_confirmed
          and now() between r.confirmed_at and r.confirmed_at + interval '90 seconds'
      ))
    );
  return found;
end;
$$;
notify pgrst, 'reload schema';
