-- Agentech: Data Collection Buyer + App / Website Client profiles.
-- Prepared for the existing agentech_accounts(email) account model.
-- REVIEW SCRIPT: not applied by Codex. Run in Supabase SQL Editor when ready.
-- No changes to passwords, existing profiles, credits, or robot permissions.
begin;

create table if not exists public.agentech_service_profiles (
  id uuid primary key default gen_random_uuid(),
  account_email text not null references public.agentech_accounts(email),
  profile_type text not null check (profile_type in ('data-buyer', 'development-client')),
  organization text not null check (char_length(btrim(organization)) between 1 and 120),
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 100),
  role text not null default '' check (char_length(role) <= 100),
  region text not null default '' check (char_length(region) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agentech_service_profiles_one_per_type unique (account_email, profile_type),
  constraint agentech_service_profiles_owner_key unique (id, account_email, profile_type)
);

create table if not exists public.agentech_collection_briefs (
  id uuid primary key default gen_random_uuid(),
  account_email text not null,
  profile_id uuid not null,
  profile_type text not null default 'data-buyer' check (profile_type = 'data-buyer'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  scenario text not null check (scenario in ('manufacturing', 'logistics', 'home', 'retail', 'robotics', 'custom')),
  modality text not null check (modality in ('Egocentric video', 'Multi-view video', 'RGB-D & spatial', 'Robot trajectories', 'Multimodal')),
  format text not null check (format in ('MP4 + JSON', 'LeRobot', 'RLDS', 'Custom format')),
  quantity integer not null check (quantity between 1 and 1000000),
  unit text not null check (unit in ('hours', 'episodes')),
  notes text not null default '' check (char_length(notes) <= 3000),
  status text not null default 'Draft' check (status = 'Draft'),
  created_at timestamptz not null default now(),
  constraint agentech_collection_briefs_buyer_owner
    foreign key (profile_id, account_email, profile_type)
    references public.agentech_service_profiles(id, account_email, profile_type)
);

create index if not exists agentech_collection_briefs_account_created_idx
  on public.agentech_collection_briefs (account_email, created_at desc);
create index if not exists agentech_collection_briefs_profile_idx
  on public.agentech_collection_briefs (profile_id, account_email, profile_type);

-- These tables are accessed through the existing signed Agentech server session.
-- The browser does not receive the service-role key or query these tables directly.
-- RLS is enabled with no browser policies; the server filters every request by
-- verified account_email. Do not add an allow-all authenticated policy.
alter table public.agentech_service_profiles enable row level security;
alter table public.agentech_collection_briefs enable row level security;
revoke all on table public.agentech_service_profiles from public, anon, authenticated, service_role;
revoke all on table public.agentech_collection_briefs from public, anon, authenticated, service_role;
grant select, insert, update on table public.agentech_service_profiles to service_role;
grant select, insert on table public.agentech_collection_briefs to service_role;

comment on table public.agentech_service_profiles is
  'Client context linked to an existing Agentech account. Does not grant developer, robot, education, or admin access.';
comment on table public.agentech_collection_briefs is
  'Draft collection requirements. Saving does not place an order or create a collection commitment.';

notify pgrst, 'reload schema';
commit;

-- Verify both tables exist, have RLS enabled, and are not readable by browser roles.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as browser_user_can_read,
  has_table_privilege('service_role', c.oid, 'SELECT') as server_can_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('agentech_service_profiles', 'agentech_collection_briefs');
-- Expected for both rows: true, false, false, true.
