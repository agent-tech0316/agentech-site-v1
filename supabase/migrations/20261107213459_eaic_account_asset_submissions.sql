create table public.agentech_account_asset_submissions (
  id uuid primary key,
  email text not null references public.agentech_accounts(email) on update cascade on delete cascade,
  object_key text not null unique,
  file_name text not null,
  robot_model text not null check (robot_model in ('Aegies','Navi','Master')),
  asset_kind text not null check (asset_kind in ('Package','Motion','Audio')),
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  native_motion_name text,
  approval_basis text not null default 'account-certification-exemption' check (approval_basis='account-certification-exemption'),
  submitted_at timestamptz not null default now()
);
create index agentech_account_asset_submissions_email_idx on public.agentech_account_asset_submissions(email,submitted_at desc);
alter table public.agentech_account_asset_submissions enable row level security;
revoke all on public.agentech_account_asset_submissions from public,anon,authenticated;
grant select,insert on public.agentech_account_asset_submissions to service_role;
