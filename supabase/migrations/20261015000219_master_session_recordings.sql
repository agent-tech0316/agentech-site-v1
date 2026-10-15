-- Private Master telemetry. Existing signed account sessions remain the only
-- customer access path; neither usernames nor client-supplied profile IDs grant access.
create table public.agentech_master_session_recordings (
  session_id bigint primary key references public.agentech_robot_sessions(id) on delete restrict,
  recording_id uuid not null unique default gen_random_uuid(),
  account_email text not null,
  profile_id bigint not null references public.agentech_account_profiles(id) on delete restrict,
  profile_username text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  capture_status text not null default 'pending' check (capture_status in ('pending','recording','complete','partial','failed')),
  storage_status text not null default 'local' check (storage_status in ('local','uploading','available','upload_failed','deleted')),
  recorder_id uuid,
  lease_expires_at timestamptz,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (jsonb_typeof(manifest) = 'object')
);
alter table public.agentech_master_session_recordings enable row level security;
revoke all on public.agentech_master_session_recordings from public, anon, authenticated;
grant select, insert, update, delete on public.agentech_master_session_recordings to service_role;
create index agentech_master_recordings_profile_idx on public.agentech_master_session_recordings(profile_id, created_at desc);

create function public.agentech_master_recording_identity_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare s public.agentech_robot_sessions; p public.agentech_account_profiles;
begin
  if tg_op = 'UPDATE' then
    if row(new.session_id,new.recording_id,new.account_email,new.profile_id,new.profile_username,new.scheduled_start,new.scheduled_end)
       is distinct from row(old.session_id,old.recording_id,old.account_email,old.profile_id,old.profile_username,old.scheduled_start,old.scheduled_end) then
      raise exception 'Recording identity is immutable';
    end if;
  else
    select * into s from public.agentech_robot_sessions where id=new.session_id;
    select * into p from public.agentech_account_profiles where id=s.access_profile_id;
    if s.robot_model is distinct from 'Master' or p.id is null or lower(p.account_email) <> lower(s.email)
       or nullif(p.username,'') is null then
      raise exception 'Recording requires an owned Master session profile';
    end if;
    new.account_email=lower(s.email); new.profile_id=p.id; new.profile_username=p.username;
    new.scheduled_start=s.scheduled_start; new.scheduled_end=s.scheduled_end;
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function public.agentech_master_recording_identity_guard() from public,anon,authenticated;
create trigger agentech_master_recording_identity before insert or update
on public.agentech_master_session_recordings for each row execute function public.agentech_master_recording_identity_guard();

create function public.agentech_master_recording_candidates()
returns table(session_id bigint) language sql stable security invoker set search_path = '' as $$
  select s.id from public.agentech_robot_sessions s
  left join public.agentech_master_session_recordings r on r.session_id=s.id
  where s.robot_model='Master' and s.scheduled_start <= now() and s.scheduled_end > now()
    and replace(lower(s.session_status),' ','_') in ('requested','confirmed','approved','scheduled','pending','running')
    and (r.session_id is null or (r.capture_status in ('pending','recording','partial','failed') and r.storage_status <> 'deleted'))
  order by s.scheduled_start, s.id;
$$;
revoke all on function public.agentech_master_recording_candidates() from public,anon,authenticated;
grant execute on function public.agentech_master_recording_candidates() to service_role;

create function public.agentech_claim_master_recording(p_session_id bigint,p_recorder_id uuid)
returns setof public.agentech_master_session_recordings
language plpgsql security invoker set search_path = '' as $$
declare s public.agentech_robot_sessions;
begin
  if p_recorder_id is null then raise exception 'Recorder ID is required'; end if;
  -- Serialize claims for the single Master; never attach the same live robot
  -- stream to two customers, even if reservations overlap.
  perform pg_advisory_xact_lock(736130042);
  select * into s from public.agentech_robot_sessions where id=p_session_id for share;
  if s.robot_model is distinct from 'Master' or s.scheduled_start > clock_timestamp()
     or s.scheduled_end <= clock_timestamp()
     or coalesce(replace(lower(s.session_status),' ','_'),'') not in ('requested','confirmed','approved','scheduled','pending','running') then
    return;
  end if;
  if (select count(*) from public.agentech_robot_sessions x where x.robot_model='Master'
      and x.scheduled_start <= clock_timestamp() and x.scheduled_end > clock_timestamp()
      and replace(lower(x.session_status),' ','_') in ('requested','confirmed','approved','scheduled','pending','running')) <> 1 then
    return;
  end if;
  if exists(select 1 from public.agentech_master_session_recordings
      where session_id<>p_session_id and lease_expires_at>clock_timestamp()) then return; end if;
  if not exists(select 1 from public.agentech_account_profiles p
      where p.id=s.access_profile_id and lower(p.account_email)=lower(s.email)
      and nullif(p.username,'') is not null) then return; end if;
  insert into public.agentech_master_session_recordings(session_id,profile_id,profile_username,scheduled_start,scheduled_end)
    values(s.id,s.access_profile_id,coalesce(s.profile_username,''),s.scheduled_start,s.scheduled_end)
    on conflict(session_id) do nothing;
  return query update public.agentech_master_session_recordings r
    set recorder_id=p_recorder_id,lease_expires_at=least(s.scheduled_end,clock_timestamp()+interval '30 seconds'),capture_status='recording'
    where r.session_id=p_session_id and r.storage_status<>'deleted'
      and r.capture_status in ('pending','recording','partial','failed')
      and r.profile_id=s.access_profile_id and r.account_email=lower(s.email)
      and r.scheduled_start=s.scheduled_start and r.scheduled_end=s.scheduled_end
      and (r.recorder_id=p_recorder_id or r.lease_expires_at is null or r.lease_expires_at<=clock_timestamp())
    returning r.*;
end $$;
revoke all on function public.agentech_claim_master_recording(bigint,uuid) from public,anon,authenticated;
grant execute on function public.agentech_claim_master_recording(bigint,uuid) to service_role;

-- No authenticated/anon Storage policies: the existing server checks the
-- parent session owner and creates short-lived download URLs on request.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('master-session-recordings','master-session-recordings',false,52428800,
       array['application/gzip','application/json','application/zip'])
on conflict(id) do nothing;

do $$ begin
  if exists(select 1 from storage.buckets where id='master-session-recordings' and public) then
    raise exception 'Master recording bucket must be private';
  end if;
end $$;
