-- Account-owned receipts enter this path only after the server validates their original bytes.
alter table public.agentech_account_asset_submissions
  add column content_manifest jsonb,
  drop constraint agentech_account_asset_submissions_approval_basis_check,
  add constraint agentech_account_asset_submissions_approval_basis_check check ((
    approval_basis = 'account-certification-exemption'
    or (robot_model = 'Master' and content_manifest->>'version' = '1' and (
      (approval_basis = 'pcm-wav-v1' and asset_kind = 'Audio' and content_manifest #>> '{playback,mode}' = 'audio_only')
      or (approval_basis = 'master-policy-contract-v1' and asset_kind in ('Package','Motion')
          and content_manifest #>> '{playback,mode}' in ('movement_only','movement_with_audio')
          and content_manifest #>> '{movement,metadata,masterContract,evidence}' = 'static-interface'
          and content_manifest #>> '{movement,metadata,masterContract,controlHz}' = '50'
          and content_manifest #>> '{movement,metadata,masterContract,model}' in ('Master Ultra','Master Edu')
          and content_manifest #>> '{movement,metadata,masterContract,frameCount}' ~ '^[1-9][0-9]{0,8}$'))
    )) is true);

create function public.agentech_protect_validated_receipt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.approval_basis <> 'account-certification-exemption'
     or new.approval_basis = 'account-certification-exemption' then
    raise exception 'Only a one-time promotion of a legacy receipt is allowed';
  end if;
  return new;
end;
$$;
create trigger protect_validated_receipt before update of approval_basis, content_manifest
on public.agentech_account_asset_submissions for each row execute function public.agentech_protect_validated_receipt();
revoke all on public.agentech_account_asset_submissions from service_role;
grant select,insert,update(approval_basis,content_manifest) on public.agentech_account_asset_submissions to service_role;

-- Legacy bookings bind the original audited ZIP even after its owner revalidates the same bytes.
create or replace function public.agentech_happy_dance_asset(p_email text, p_asset uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.agentech_account_asset_submissions a
    where a.email = p_email and a.id = p_asset and a.robot_model = 'Master' and a.asset_kind = 'Package'
      and a.approval_basis in ('account-certification-exemption','master-policy-contract-v1')
      and a.byte_size = 5164116 and a.sha256 = '9096c47b127490112a23074e50623f472f2602a562ed3e87bf65a2e6ab2107db'
      and (a.native_motion_name is null or a.native_motion_name = 'linkcraft_resource_onnx_ffkuaile_0.0.1')
  )
$$;

alter table public.agentech_robot_sessions
  add column body_asset_id uuid references public.agentech_account_asset_submissions(id),
  add column body_attempt_id uuid unique;
-- A v1 reservation was created by the signed booking route. Recheck its original source and exact receipt.
create or replace function public.body_booking_starts_automatically(s public.agentech_robot_sessions)
returns boolean language sql stable security invoker set search_path = '' as $$
  select s.robot_model = 'Master' and s.approved_run_type = 'custom_code' and case
    when s.body_asset_id is not null then s.code_submission_id = 'master-body-v2-' || s.body_asset_id::text
    else exists (
      select 1 from public.agentech_code_submissions c join public.agentech_account_asset_submissions a
        on c.id = 'master-body-' || a.id::text and c.email = a.email
      where c.id = s.code_submission_id and c.email = s.email and c.robot_model = 'Master'
        and c.code = 'Agentech.play_body("linkcraft_resource_onnx_ffkuaile_0.0.1", audio_path="")'
        and c.ai_security_model = 'master-native-asset-v1' and c.run_mode = c.ai_security_model
        and c.physical_safety_status = 'passed' and c.ai_security_status = 'passed'
        and public.agentech_happy_dance_asset(s.email,a.id)
    ) end
$$;

create or replace function public.agentech_claim_body_booking(
  p_email text,p_session bigint,p_asset uuid,p_start timestamptz,p_end timestamptz,p_confirmed timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.agentech_robot_sessions s set session_status = 'running',body_start_authority = 'signed_booking'
    where p_confirmed is null and s.body_asset_id is null and s.id = p_session and s.email = p_email
      and s.code_submission_id = 'master-body-' || p_asset::text
      and s.scheduled_start = p_start and s.scheduled_end = p_end and now() between p_start and p_end - interval '80 seconds'
      and s.session_status in ('requested','approved','confirmed','scheduled','pending')
      and public.body_booking_starts_automatically(s);
  return found;
end;
$$;

-- Preserve historical check-ins for audit. The booking service no longer accepts or fabricates operator presence.
revoke all on function public.agentech_confirm_body_operator(text,bigint),public.agentech_pin_happy_dance(text,uuid)
  from public,anon,authenticated,service_role;
revoke all on public.agentech_body_operator_ready from public,anon,authenticated,service_role;
grant select on public.agentech_body_operator_ready to service_role;

create function public.agentech_body_runtime_seconds(manifest jsonb)
returns numeric language sql immutable strict security invoker set search_path = '' as $$
  select ceil(greatest((manifest #>> '{movement,metadata,masterContract,frameCount}')::numeric / 50,
                       coalesce((manifest #>> '{audio,durationSeconds}')::numeric,0))) + 10
$$;

-- Private stage lookup binds the original receipt, source, owner and reservation. Never trust client-supplied object paths.
create function public.agentech_get_booked_body_asset(
  p_email text, p_session bigint, p_submission text, p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',a.id,'email',a.email,'object_key',a.object_key,'file_name',a.file_name,
    'asset_kind',a.asset_kind,'byte_size',a.byte_size,'sha256',a.sha256,'content_manifest',a.content_manifest)
  from public.agentech_robot_sessions s
  join public.agentech_account_asset_submissions a on a.id = s.body_asset_id and a.email = s.email
  join public.agentech_code_submissions c on c.id = s.code_submission_id and c.email = s.email
  where s.id = p_session and s.email = p_email and s.scheduled_start = p_start and s.scheduled_end = p_end
    and s.code_submission_id = p_submission and c.id = 'master-body-v2-' || a.id::text
    and c.code = jsonb_build_object('asset_id',a.id,'asset_sha256',a.sha256)::text
    and c.robot_model = 'Master' and c.run_mode = 'master-native-asset-v2' and c.ai_security_model = c.run_mode
    and c.physical_safety_status = 'passed' and c.ai_security_status = 'passed'
    and s.robot_model = 'Master' and s.approved_run_type = 'custom_code'
    and a.approval_basis = 'master-policy-contract-v1' and a.robot_model = 'Master'
    and a.content_manifest #>> '{movement,metadata,masterContract,model}' = 'Master Ultra'
    and (s.access_profile_id is null or exists (select 1 from public.agentech_account_profiles p
         where p.id = s.access_profile_id and p.account_email = s.email))
    and s.session_status in ('requested','approved','confirmed','scheduled','pending') and p_end > now()
$$;

-- The pre-existing reservation implementation holds a committed sentinel row while saving other session types.
-- This transaction takes the table write lock before checking that sentinel and every shared-cell overlap.
create function public.agentech_reserve_validated_body(
  p_email text, p_asset uuid, p_profile bigint, p_start timestamptz, p_end timestamptz, p_credits integer, p_notes text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  asset public.agentech_account_asset_submissions%rowtype;
  profile public.agentech_account_profiles%rowtype;
  account public.agentech_accounts%rowtype;
  booked public.agentech_robot_sessions%rowtype;
  pin text := 'master-body-v2-' || p_asset::text;
  source_text text;
  paid integer;
  paid_used integer;
begin
  if p_start is null or p_end is null or p_start <= now() or p_end <= p_start or p_credits is null or p_credits < 0 then
    return jsonb_build_object('error','invalid_slot');
  end if;
  select * into asset from public.agentech_account_asset_submissions
    where id = p_asset and email = p_email and approval_basis = 'master-policy-contract-v1' and robot_model = 'Master';
  if not found then return jsonb_build_object('error','invalid_asset'); end if;
  -- The single schedulable Master resource is the Ultra target. Edu policies may be stored for their own model.
  if asset.content_manifest #>> '{movement,metadata,masterContract,model}' is distinct from 'Master Ultra' then
    return jsonb_build_object('error','target_mismatch');
  end if;
  if extract(epoch from p_end-p_start) < 20 + public.agentech_body_runtime_seconds(asset.content_manifest) then
    return jsonb_build_object('error','short_slot');
  end if;
  if p_profile is not null then
    select * into profile from public.agentech_account_profiles where id = p_profile and account_email = p_email;
    if not found then return jsonb_build_object('error','invalid_profile'); end if;
  end if;
  lock table public.agentech_robot_sessions in share row exclusive mode;
  select * into booked from public.agentech_robot_sessions where email = p_email and body_asset_id = p_asset
    and access_profile_id is not distinct from p_profile and code_submission_id = pin
    and robot_model = 'Master' and approved_run_type = 'custom_code'
    and scheduled_start = p_start and scheduled_end = p_end and session_status in ('requested','approved','confirmed','scheduled','pending');
  if found then
    return jsonb_build_object('session',to_jsonb(booked) || jsonb_build_object('body_booking_starts_automatically',true),'reused',true);
  end if;
  if exists(select 1 from public.agentech_robot_sessions
    where (id = -4175000002 and created_at >= now() - interval '5 minutes')
       or (scheduled_start < p_end and scheduled_end > p_start and lower(session_status) not in
           ('cancelled','canceled','voided','rejected','deleted'))) then
    return jsonb_build_object('error','conflict');
  end if;
  select * into strict account from public.agentech_accounts where email = p_email for update;
  paid := case when account.paid_credit_balance = 0 and account.bonus_credit_balance = 0 then account.credit_balance
               else account.paid_credit_balance end;
  if paid + account.bonus_credit_balance < p_credits then return jsonb_build_object('error','insufficient_credits'); end if;
  source_text := jsonb_build_object('asset_id',asset.id,'asset_sha256',asset.sha256)::text;
  insert into public.agentech_code_submissions(id,email,developer_name,robot_model,run_mode,source,uploaded_file_name,
    commands,code,physical_safety_status,ai_security_status,ai_security_model,ai_security_summary)
    values(pin,p_email,p_email,'Master','master-native-asset-v2','uploaded_file',asset.file_name,array['play_body'],
      source_text,'passed','passed','master-native-asset-v2','Automatic package and static policy interface checks passed. Runtime checks are required.')
    on conflict(id) do nothing;
  if not exists(select 1 from public.agentech_code_submissions c where c.id = pin and c.email = p_email
       and c.code = source_text and c.robot_model = 'Master' and c.run_mode = 'master-native-asset-v2'
       and c.ai_security_model = c.run_mode and c.physical_safety_status = 'passed' and c.ai_security_status = 'passed') then
    return jsonb_build_object('error','invalid_asset');
  end if;
  if p_credits > 0 then
    paid_used := least(paid,p_credits);
    update public.agentech_accounts set credit_balance = paid-paid_used, paid_credit_balance = paid-paid_used,
      bonus_credit_balance = account.bonus_credit_balance - (p_credits-paid_used) where email = p_email;
  end if;
  insert into public.agentech_robot_sessions(email,access_profile_id,profile_username,profile_type,session_title,robot_model,
    scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,
    code_submission_id,body_asset_id,price,notes)
    values(p_email,p_profile,profile.username,profile.profile_type,asset.file_name,'Master',p_start,p_end,'scheduled',
      'custom_code','custom_code',asset.file_name,'passed',pin,asset.id,p_credits/100.0,p_notes) returning * into booked;
  return jsonb_build_object('session',to_jsonb(booked) || jsonb_build_object('body_booking_starts_automatically',true));
end;
$$;

create function public.agentech_claim_validated_body_booking(
  p_email text,p_session bigint,p_submission text,p_start timestamptz,p_end timestamptz,p_attempt uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare receipt jsonb;
begin
  receipt := public.agentech_get_booked_body_asset(p_email,p_session,p_submission,p_start,p_end);
  if p_attempt is null then return false; end if;
  update public.agentech_robot_sessions s set session_status = 'running', body_start_authority = 'signed_booking',
    body_attempt_id = p_attempt
    where s.id = p_session and s.email = p_email and s.code_submission_id = p_submission
      and s.scheduled_start = p_start and s.scheduled_end = p_end
      and s.robot_model = 'Master' and s.approved_run_type = 'custom_code' and s.body_attempt_id is null
      and s.session_status in ('requested','approved','confirmed','scheduled','pending')
      and now() >= p_start and (
        (receipt is not null and s.body_asset_id = (receipt->>'id')::uuid
          and extract(epoch from p_end-now()) >= public.agentech_body_runtime_seconds(receipt->'content_manifest'))
        or (s.body_asset_id is null and public.body_booking_starts_automatically(s) and p_end-now() >= interval '80 seconds')
      );
  return found;
exception when unique_violation then return false;
end;
$$;

-- Recover a lost claim response or a crash before the runner intent was persisted. The row lock
-- serializes this terminal write with a still-running claim. Neither branch authorizes dispatch.
create function public.agentech_reconcile_unlaunched_body_booking(
  p_email text,p_session bigint,p_submission text,p_start timestamptz,p_end timestamptz,p_attempt uuid,p_error text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_attempt is null or p_error is null or length(p_error) not between 1 and 1800 then return false; end if;
  update public.agentech_robot_sessions s set session_status = 'failed', execution_error = p_error,
    execution_updated_at = now(), updated_at = now()
    where s.id = p_session and s.email = p_email and s.code_submission_id = p_submission
      and p_submission like 'master-body-%' and s.robot_model = 'Master' and s.approved_run_type = 'custom_code'
      and s.scheduled_start = p_start and s.scheduled_end = p_end and s.execution_result is null
      and (s.execution_error is null or s.execution_error = p_error)
      and ( (s.body_attempt_id is null and s.session_status in ('requested','approved','confirmed','scheduled','pending'))
         or (s.body_attempt_id = p_attempt and s.session_status = 'running')
         or (s.session_status = 'failed' and s.execution_error = p_error and (s.body_attempt_id is null or s.body_attempt_id = p_attempt)) );
  return found;
end;
$$;

revoke all on function public.agentech_protect_validated_receipt() from public,anon,authenticated;
revoke all on function public.body_booking_starts_automatically(public.agentech_robot_sessions),
  public.agentech_body_runtime_seconds(jsonb),
  public.agentech_get_booked_body_asset(text,bigint,text,timestamptz,timestamptz),
  public.agentech_reserve_validated_body(text,uuid,bigint,timestamptz,timestamptz,integer,text),
  public.agentech_claim_validated_body_booking(text,bigint,text,timestamptz,timestamptz,uuid),
  public.agentech_reconcile_unlaunched_body_booking(text,bigint,text,timestamptz,timestamptz,uuid,text)
  from public,anon,authenticated;
grant execute on function public.body_booking_starts_automatically(public.agentech_robot_sessions),
  public.agentech_body_runtime_seconds(jsonb),
  public.agentech_get_booked_body_asset(text,bigint,text,timestamptz,timestamptz),
  public.agentech_reserve_validated_body(text,uuid,bigint,timestamptz,timestamptz,integer,text),
  public.agentech_claim_validated_body_booking(text,bigint,text,timestamptz,timestamptz,uuid),
  public.agentech_reconcile_unlaunched_body_booking(text,bigint,text,timestamptz,timestamptz,uuid,text)
  to service_role;
notify pgrst,'reload schema';
