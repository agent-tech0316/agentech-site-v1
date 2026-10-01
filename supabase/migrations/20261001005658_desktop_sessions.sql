begin;
create schema if not exists desktop_private;
revoke all on schema desktop_private from public, anon, authenticated;
grant usage on schema desktop_private to service_role;
create table desktop_private.sessions (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 account_email text not null references public.agentech_accounts(email) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index desktop_sessions_account on desktop_private.sessions(account_email);
create index desktop_sessions_expiry on desktop_private.sessions(expires_at);
create table desktop_private.login_limits (
 bucket_hash text primary key check(bucket_hash ~ '^[0-9a-f]{64}$'),
 attempts integer not null,
 expires_at timestamptz not null
);
create index desktop_limits_expiry on desktop_private.login_limits(expires_at);
alter table desktop_private.sessions enable row level security;
alter table desktop_private.login_limits enable row level security;
revoke all on all tables in schema desktop_private from public, anon, authenticated;
grant select,insert,update,delete on all tables in schema desktop_private to service_role;

-- The existing server uses PostgREST. These service-role-only RPCs provide
-- access to unexposed tables without SECURITY DEFINER or user-facing policies.
create function public.desktop_session_create(p_hash text,p_email text,p_expires timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_expires <= now() or p_expires > now()+interval '30 days' then raise exception 'Invalid session expiry'; end if;
 insert into desktop_private.sessions(token_hash,account_email,expires_at) values(p_hash,p_email,p_expires);
end $$;
create function public.desktop_session_find(p_hash text)
returns table(email text,expires_at timestamptz) language sql security invoker set search_path='' as $$
 select s.account_email,s.expires_at from desktop_private.sessions s
 join public.agentech_accounts a on a.email=s.account_email
 where s.token_hash=p_hash and s.revoked_at is null and s.expires_at>now();
$$;
create function public.desktop_session_revoke(p_hash text)
returns void language sql security invoker set search_path='' as $$
 update desktop_private.sessions set revoked_at=coalesce(revoked_at,now()) where token_hash=p_hash;
$$;
create function public.desktop_login_attempt(p_hash text,p_limit integer)
returns table(allowed boolean,retry_after integer) language plpgsql security invoker set search_path='' as $$
declare r desktop_private.login_limits;
begin
 if p_limit not in (5,30) then raise exception 'Invalid limit'; end if;
 insert into desktop_private.login_limits as l(bucket_hash,attempts,expires_at) values(p_hash,1,now()+interval '15 minutes')
 on conflict(bucket_hash) do update set
 attempts=case when l.expires_at<=now() then 1 else least(l.attempts+1,1000000) end,
 expires_at=case when l.expires_at<=now() then now()+interval '15 minutes' else l.expires_at end
 returning * into r;
 return query select r.attempts<=p_limit,greatest(1,ceil(extract(epoch from r.expires_at-now()))::integer);
end $$;
create function public.desktop_session_cleanup()
returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from desktop_private.sessions where token_hash in (select token_hash from desktop_private.sessions where expires_at<now() or revoked_at<now()-interval '1 day' limit 1000);
 delete from desktop_private.login_limits where bucket_hash in (select bucket_hash from desktop_private.login_limits where expires_at<now() limit 1000);
end $$;
revoke all on function public.desktop_session_create(text,text,timestamptz),public.desktop_session_find(text),public.desktop_session_revoke(text),public.desktop_login_attempt(text,integer),public.desktop_session_cleanup() from public,anon,authenticated;
grant execute on function public.desktop_session_create(text,text,timestamptz),public.desktop_session_find(text),public.desktop_session_revoke(text),public.desktop_login_attempt(text,integer),public.desktop_session_cleanup() to service_role;
commit;
