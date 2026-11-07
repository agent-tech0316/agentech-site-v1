create table public.agentech_code_review_exemptions (
  email text primary key references public.agentech_accounts(email) on update cascade on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.agentech_code_review_exemptions enable row level security;
revoke all on public.agentech_code_review_exemptions from public, anon, authenticated;
grant select on public.agentech_code_review_exemptions to service_role;

-- Both gate flags are consumed by existing trusted gateways. The exemption
-- marker and NULL review timestamps distinguish this approval from an actual scan.
create function public.agentech_save_exempt_submission(
  p_email text, p_robot_model text, p_code text, p_commands text[], p_filename text, p_developer_name text
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  submission_id text := 'agentech-' || gen_random_uuid()::text;
begin
  if not exists(select 1 from public.agentech_code_review_exemptions where email = p_email) then
    raise exception 'Account exemption required' using errcode = '42501';
  end if;
  if p_robot_model is null or p_robot_model not in ('Aegies','Navi','Master') or coalesce(btrim(p_code),'') = '' then
    raise exception 'A robot model and program are required' using errcode = '22023';
  end if;
  perform 1 from public.agentech_accounts where email = p_email for update;
  insert into public.agentech_code_submissions
    (id,email,developer_name,robot_model,run_mode,source,uploaded_file_name,commands,code,
     physical_safety_status,ai_security_status,ai_security_model,ai_security_summary,credits_charged)
  values (submission_id,p_email,p_developer_name,p_robot_model,'Account-exempt program',
    case when p_filename is null then 'pasted_code' else 'uploaded_file' end,p_filename,p_commands,p_code,
    'passed','passed','account-certification-exemption','Both submission gates approved by account exemption; no command, hardware, or AI review performed.',0);
  update public.agentech_accounts set developer_latest_code_submission_id=submission_id,
    developer_physical_safety_status='passed', developer_ai_security_status='passed',
    developer_physical_safety_passed_at=null, developer_ai_security_passed_at=null where email=p_email;
  return submission_id;
end;
$$;
revoke all on function public.agentech_save_exempt_submission(text,text,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.agentech_save_exempt_submission(text,text,text,text[],text,text) to service_role;
