-- Additive identity bridge and private EAIS project persistence.
-- Apply only after comparing the live schema, constraints, grants, and policies.

alter table public.agentech_accounts add column if not exists auth_user_id uuid;
alter table public.agentech_accounts alter column password_hash drop not null;
alter table public.agentech_accounts alter column salt drop not null;

alter table public.agentech_profiles add column if not exists auth_user_id uuid;
alter table public.agentech_account_profiles add column if not exists owner_user_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agentech_accounts_auth_user_id_fkey') then
    alter table public.agentech_accounts
      add constraint agentech_accounts_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agentech_profiles_auth_user_id_fkey') then
    alter table public.agentech_profiles
      add constraint agentech_profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agentech_account_profiles_owner_user_id_fkey') then
    alter table public.agentech_account_profiles
      add constraint agentech_account_profiles_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete restrict;
  end if;
end
$$;

create unique index if not exists agentech_accounts_auth_user_id_idx
on public.agentech_accounts (auth_user_id)
where auth_user_id is not null;

create unique index if not exists agentech_profiles_auth_user_id_idx
on public.agentech_profiles (auth_user_id)
where auth_user_id is not null;

create index if not exists agentech_account_profiles_owner_user_id_idx
on public.agentech_account_profiles (owner_user_id, created_at desc)
where owner_user_id is not null;

create or replace function public.agentech_link_auth_identity(
  p_email text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_email));
  provider_email text;
  linked_account_email text;
  existing_user_id uuid;
begin
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_identity_email' using errcode = '22023';
  end if;

  select lower(trim(email::text))
  into provider_email
  from auth.users
  where id = p_auth_user_id;

  if not found or provider_email is null or provider_email <> normalized_email then
    raise exception 'identity_conflict' using errcode = 'P0001';
  end if;

  select email
  into linked_account_email
  from public.agentech_accounts
  where auth_user_id = p_auth_user_id
    and email <> normalized_email
  limit 1;

  if found then
    raise exception 'identity_conflict' using errcode = 'P0001';
  end if;

  select auth_user_id
  into existing_user_id
  from public.agentech_accounts
  where email = normalized_email
  for update;

  if found then
    if existing_user_id is not null and existing_user_id <> p_auth_user_id then
      raise exception 'identity_conflict' using errcode = 'P0001';
    end if;

    update public.agentech_accounts
    set auth_user_id = p_auth_user_id
    where email = normalized_email;
  else
    insert into public.agentech_accounts (
      email,
      auth_user_id,
      password_hash,
      salt,
      first_name,
      last_name,
      phone,
      credit_balance,
      paid_credit_balance,
      bonus_credit_balance,
      created_at,
      verified_at
    ) values (
      normalized_email,
      p_auth_user_id,
      null,
      null,
      '',
      '',
      '',
      0,
      0,
      0,
      now(),
      now()
    );
  end if;

  if exists (
    select 1 from public.agentech_profiles
    where email = normalized_email
      and auth_user_id is not null
      and auth_user_id <> p_auth_user_id
  ) then
    raise exception 'profile_identity_conflict' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.agentech_account_profiles
    where account_email = normalized_email
      and owner_user_id is not null
      and owner_user_id <> p_auth_user_id
  ) then
    raise exception 'access_profile_identity_conflict' using errcode = 'P0001';
  end if;

  update public.agentech_profiles
  set auth_user_id = p_auth_user_id
  where email = normalized_email
    and (auth_user_id is null or auth_user_id = p_auth_user_id);

  update public.agentech_account_profiles
  set owner_user_id = p_auth_user_id
  where account_email = normalized_email
    and (owner_user_id is null or owner_user_id = p_auth_user_id);

  return jsonb_build_object('user_id', p_auth_user_id, 'email', normalized_email);
end;
$$;

revoke all on function public.agentech_link_auth_identity(text, uuid) from public, anon, authenticated;
grant execute on function public.agentech_link_auth_identity(text, uuid) to service_role;

create table if not exists public.agentech_projects (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text not null check (category in ('Humanoid', 'Robot dog', 'Navi', 'Robot arm', 'Other')),
  description text not null default '' check (char_length(description) <= 600),
  cover_object_path text,
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_user_id)
);

create index if not exists agentech_projects_owner_updated_idx
on public.agentech_projects (owner_user_id, updated_at desc)
where deleted_at is null;

create table if not exists public.agentech_project_edits (
  id bigint generated by default as identity primary key,
  project_id uuid not null,
  owner_user_id uuid not null,
  mutation_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  base_revision bigint not null check (base_revision >= 0),
  result_revision bigint not null check (result_revision > base_revision),
  patch jsonb not null default '{}'::jsonb check (jsonb_typeof(patch) = 'object'),
  result_project jsonb not null check (jsonb_typeof(result_project) = 'object'),
  created_at timestamptz not null default now(),
  constraint agentech_project_edits_project_owner_fkey
    foreign key (project_id, owner_user_id)
    references public.agentech_projects(id, owner_user_id)
    on delete cascade,
  unique (owner_user_id, mutation_id)
);

create index if not exists agentech_project_edits_project_created_idx
on public.agentech_project_edits (project_id, created_at desc);

create or replace function public.agentech_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agentech_projects_set_updated_at on public.agentech_projects;
create trigger agentech_projects_set_updated_at
before update on public.agentech_projects
for each row execute function public.agentech_set_updated_at();

create or replace function public.agentech_apply_project_mutation(
  p_project_id uuid,
  p_owner_user_id uuid,
  p_mutation_id uuid,
  p_action text,
  p_expected_revision bigint default null,
  p_title text default null,
  p_category text default null,
  p_description text default null,
  p_cover_object_path text default null,
  p_draft jsonb default null,
  p_progress jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_project public.agentech_projects%rowtype;
  prior_project_id uuid;
  prior_action text;
  prior_result_revision bigint;
  prior_result_project jsonb;
  previous_revision bigint;
  edit_patch jsonb;
begin
  if p_project_id is null or p_owner_user_id is null or p_mutation_id is null
    or p_action is null or p_action not in ('create', 'update', 'delete') then
    return jsonb_build_object('kind', 'invalid_action');
  end if;

  -- Serialize retries of the same owner-scoped mutation so concurrent requests
  -- observe the edit written by the winner instead of producing a false conflict.
  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::text || ':' || p_mutation_id::text, 0)
  );

  select project_id, action, result_revision, result_project
  into prior_project_id, prior_action, prior_result_revision, prior_result_project
  from public.agentech_project_edits
  where owner_user_id = p_owner_user_id
    and mutation_id = p_mutation_id;

  if found then
    if prior_project_id <> p_project_id then
      return jsonb_build_object('kind', 'conflict');
    end if;
    return jsonb_build_object(
      'kind', case when prior_action = 'delete' then 'deleted' else 'applied' end,
      'revision', prior_result_revision,
      'project', prior_result_project,
      'replayed', true
    );
  end if;

  if p_action = 'create' then
    if coalesce(p_expected_revision, 0) <> 0 then
      return jsonb_build_object('kind', 'conflict');
    end if;

    insert into public.agentech_projects (
      id, owner_user_id, title, category, description, cover_object_path,
      draft, progress, revision
    ) values (
      p_project_id, p_owner_user_id, trim(p_title), p_category,
      coalesce(trim(p_description), ''), p_cover_object_path,
      coalesce(p_draft, '{}'::jsonb), coalesce(p_progress, '{}'::jsonb), 1
    )
    on conflict (id) do nothing
    returning * into current_project;

    if current_project.id is null then
      return jsonb_build_object('kind', 'conflict');
    end if;

    previous_revision := 0;
  else
    select * into current_project
    from public.agentech_projects
    where id = p_project_id
      and owner_user_id = p_owner_user_id
      and deleted_at is null
    for update;

    if not found then
      return jsonb_build_object('kind', 'not_found');
    end if;

    if p_expected_revision is null or p_expected_revision <> current_project.revision then
      return jsonb_build_object('kind', 'conflict', 'project', to_jsonb(current_project));
    end if;

    previous_revision := current_project.revision;

    if p_action = 'update' then
      update public.agentech_projects
      set
        title = coalesce(trim(p_title), title),
        category = coalesce(p_category, category),
        description = coalesce(trim(p_description), description),
        cover_object_path = coalesce(p_cover_object_path, cover_object_path),
        draft = coalesce(p_draft, draft),
        progress = coalesce(p_progress, progress),
        revision = revision + 1
      where id = p_project_id and owner_user_id = p_owner_user_id
      returning * into current_project;
    else
      update public.agentech_projects
      set deleted_at = now(), revision = revision + 1
      where id = p_project_id and owner_user_id = p_owner_user_id
      returning * into current_project;
    end if;
  end if;

  edit_patch := jsonb_strip_nulls(jsonb_build_object(
    'title', p_title,
    'category', p_category,
    'description', p_description,
    'cover_object_path', p_cover_object_path,
    'draft', p_draft,
    'progress', p_progress
  ));

  insert into public.agentech_project_edits (
    project_id,
    owner_user_id,
    mutation_id,
    action,
    base_revision,
    result_revision,
    patch,
    result_project
  ) values (
    p_project_id,
    p_owner_user_id,
    p_mutation_id,
    p_action,
    previous_revision,
    current_project.revision,
    edit_patch,
    to_jsonb(current_project)
  );

  return jsonb_build_object(
    'kind', case when p_action = 'delete' then 'deleted' else 'applied' end,
    'revision', current_project.revision,
    'project', to_jsonb(current_project),
    'replayed', false
  );
end;
$$;

revoke all on function public.agentech_apply_project_mutation(uuid, uuid, uuid, text, bigint, text, text, text, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.agentech_apply_project_mutation(uuid, uuid, uuid, text, bigint, text, text, text, text, jsonb, jsonb)
to service_role;

alter table public.agentech_account_profiles enable row level security;
alter table public.agentech_projects enable row level security;
alter table public.agentech_project_edits enable row level security;

drop policy if exists agentech_profiles_owner_select on public.agentech_profiles;
create policy agentech_profiles_owner_select on public.agentech_profiles
for select to authenticated using (auth_user_id = auth.uid());

drop policy if exists agentech_account_profiles_owner_select on public.agentech_account_profiles;
create policy agentech_account_profiles_owner_select on public.agentech_account_profiles
for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists agentech_projects_owner_select on public.agentech_projects;
create policy agentech_projects_owner_select on public.agentech_projects
for select to authenticated using (owner_user_id = auth.uid() and deleted_at is null);

drop policy if exists agentech_projects_owner_insert on public.agentech_projects;
create policy agentech_projects_owner_insert on public.agentech_projects
for insert to authenticated with check (owner_user_id = auth.uid());

drop policy if exists agentech_projects_owner_update on public.agentech_projects;
create policy agentech_projects_owner_update on public.agentech_projects
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists agentech_projects_owner_delete on public.agentech_projects;
create policy agentech_projects_owner_delete on public.agentech_projects
for delete to authenticated using (owner_user_id = auth.uid());

drop policy if exists agentech_project_edits_owner_select on public.agentech_project_edits;
create policy agentech_project_edits_owner_select on public.agentech_project_edits
for select to authenticated using (owner_user_id = auth.uid());

revoke all on table public.agentech_accounts from anon, authenticated;
revoke all on table public.agentech_profiles from anon, authenticated;
revoke all on table public.agentech_account_profiles from anon, authenticated;
revoke all on table public.agentech_projects from anon, authenticated;
revoke all on table public.agentech_project_edits from anon, authenticated;

grant select on table public.agentech_profiles to authenticated;
grant select on table public.agentech_account_profiles to authenticated;
grant select on table public.agentech_projects to authenticated;
grant select on table public.agentech_project_edits to authenticated;

grant select, insert, update, delete on table public.agentech_projects to service_role;
grant select, insert, update, delete on table public.agentech_project_edits to service_role;
grant usage, select on sequence public.agentech_project_edits_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'eais-project-covers',
  'eais-project-covers',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists eais_project_covers_owner_select on storage.objects;
create policy eais_project_covers_owner_select on storage.objects
for select to authenticated
using (bucket_id = 'eais-project-covers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists eais_project_covers_owner_insert on storage.objects;
create policy eais_project_covers_owner_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'eais-project-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists eais_project_covers_owner_update on storage.objects;
create policy eais_project_covers_owner_update on storage.objects
for update to authenticated
using (bucket_id = 'eais-project-covers' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'eais-project-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists eais_project_covers_owner_delete on storage.objects;
create policy eais_project_covers_owner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'eais-project-covers' and (storage.foldername(name))[1] = auth.uid()::text);
