-- Master live tests reuse a negative reservation ID. Do not attach recordings
-- to these internal rows: their retention FK would prevent reservation reuse.
-- CREATE OR REPLACE preserves the existing service-role-only function grants.
create or replace function public.agentech_master_recording_candidates()
returns table(session_id bigint) language sql stable security invoker set search_path = '' as $$
  select s.id from public.agentech_robot_sessions s
  left join public.agentech_master_session_recordings r on r.session_id=s.id
  where s.id > 0 and s.robot_model='Master' and s.scheduled_start <= now() and s.scheduled_end > now()
    and replace(lower(s.session_status),' ','_') in ('requested','confirmed','approved','scheduled','pending','running')
    and (r.session_id is null or (r.capture_status in ('pending','recording','partial','failed') and r.storage_status <> 'deleted'))
  order by s.scheduled_start, s.id;
$$;

create or replace function public.agentech_claim_master_recording(p_session_id bigint,p_recorder_id uuid)
returns setof public.agentech_master_session_recordings
language plpgsql security invoker set search_path = '' as $$
declare s public.agentech_robot_sessions;
begin
  if p_recorder_id is null then raise exception 'Recorder ID is required'; end if;
  if p_session_id <= 0 then return; end if;
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
