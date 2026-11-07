-- Only service-side routes can bind a privately submitted package or claim its supervised booking.
create function public.agentech_happy_dance_asset(p_email text, p_asset uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.agentech_account_asset_submissions a
    join public.agentech_code_review_exemptions e using (email)
    where a.email=p_email and a.id=p_asset and a.robot_model='Master' and a.asset_kind='Package'
      and a.approval_basis='account-certification-exemption' and a.byte_size=5164116
      and a.sha256='9096c47b127490112a23074e50623f472f2602a562ed3e87bf65a2e6ab2107db' and a.native_motion_name='linkcraft_resource_onnx_ffkuaile_0.0.1'
  )
$$;

create function public.agentech_pin_happy_dance(p_email text, p_asset uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare sid text := 'master-body-' || p_asset::text;
begin
  if not public.agentech_happy_dance_asset(p_email,p_asset) then return null; end if;
  insert into public.agentech_code_submissions
    (id,email,developer_name,robot_model,run_mode,source,uploaded_file_name,commands,code,
     physical_safety_status,ai_security_status,ai_security_model)
  select sid,p_email,p_email,'Master','master-native-asset-v1','uploaded_file',a.file_name,array['play_body'],
     'Agentech.play_body("linkcraft_resource_onnx_ffkuaile_0.0.1", audio_path="")','passed','passed','master-native-asset-v1'
  from public.agentech_account_asset_submissions a where a.id=p_asset
  on conflict (id) do nothing;
  return (select id from public.agentech_code_submissions where id=sid and email=p_email
    and robot_model='Master' and ai_security_model='master-native-asset-v1' and run_mode='master-native-asset-v1'
    and code='Agentech.play_body("linkcraft_resource_onnx_ffkuaile_0.0.1", audio_path="")' and physical_safety_status='passed' and ai_security_status='passed');
end;
$$;

create table public.agentech_body_operator_ready (
  session_id bigint primary key references public.agentech_robot_sessions(id) on delete cascade,
  email text not null, asset_id uuid not null references public.agentech_account_asset_submissions(id),
  booked_start timestamptz not null, booked_end timestamptz not null, confirmed_at timestamptz not null
);
alter table public.agentech_body_operator_ready enable row level security;
revoke all on public.agentech_body_operator_ready from public,anon,authenticated;
grant select,insert,update on public.agentech_body_operator_ready to service_role;

create function public.agentech_confirm_body_operator(p_email text, p_session bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.agentech_body_operator_ready as r
    (session_id,email,asset_id,booked_start,booked_end,confirmed_at)
  select s.id,s.email,a.id,s.scheduled_start,s.scheduled_end,now()
    from public.agentech_robot_sessions s join public.agentech_account_asset_submissions a
      on s.code_submission_id='master-body-'||a.id::text and s.email=a.email
    where s.id=p_session and s.email=p_email and s.robot_model='Master' and s.approved_run_type='custom_code'
      and s.session_status in ('approved','confirmed','scheduled','requested','pending')
      and now() between s.scheduled_start - interval '20 seconds' and s.scheduled_end - interval '80 seconds'
      and public.agentech_happy_dance_asset(p_email,a.id)
  on conflict(session_id) do update set confirmed_at=excluded.confirmed_at, booked_start=excluded.booked_start,
    booked_end=excluded.booked_end,email=excluded.email,asset_id=excluded.asset_id;
  return found;
end;
$$;
-- Recheck the grant, selected receipt, review, physical operator and slot together on the one-shot claim.
create function public.agentech_claim_body_booking(p_email text,p_session bigint,p_asset uuid,p_start timestamptz,p_end timestamptz,p_confirmed timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.agentech_robot_sessions s set session_status='running'
  from public.agentech_body_operator_ready r, public.agentech_code_submissions c
  where s.id=p_session and r.session_id=s.id and s.email=p_email and r.email=s.email and r.asset_id=p_asset
    and s.code_submission_id='master-body-'||p_asset::text and s.code_submission_id=c.id and c.email=s.email
    and c.code='Agentech.play_body("linkcraft_resource_onnx_ffkuaile_0.0.1", audio_path="")' and c.ai_security_model='master-native-asset-v1' and c.run_mode='master-native-asset-v1'
    and c.physical_safety_status='passed' and c.ai_security_status='passed'
    and s.approved_run_type='custom_code' and s.robot_model='Master'
    and s.scheduled_start=p_start and s.scheduled_end=p_end and r.booked_start=p_start and r.booked_end=p_end
    and s.session_status in ('approved','confirmed','scheduled','requested','pending')
    and now() between p_start and p_end - interval '80 seconds'
    and r.confirmed_at=p_confirmed and now() between r.confirmed_at and r.confirmed_at + interval '90 seconds'
    and public.agentech_happy_dance_asset(p_email,p_asset);
  return found;
end;
$$;
revoke all on function public.agentech_happy_dance_asset(text,uuid) from public, anon, authenticated;
grant execute on function public.agentech_happy_dance_asset(text,uuid) to service_role;
revoke all on function public.agentech_pin_happy_dance(text,uuid) from public, anon, authenticated;
grant execute on function public.agentech_pin_happy_dance(text,uuid) to service_role;
revoke all on function public.agentech_confirm_body_operator(text,bigint) from public, anon, authenticated;
grant execute on function public.agentech_confirm_body_operator(text,bigint) to service_role;
revoke all on function public.agentech_claim_body_booking(text,bigint,uuid,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.agentech_claim_body_booking(text,bigint,uuid,timestamptz,timestamptz,timestamptz) to service_role;
