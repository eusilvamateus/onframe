create schema if not exists onframe_private;

revoke all on schema onframe_private from public;

create type public.workspace_role as enum ('owner', 'admin', 'operator', 'viewer');
create type public.seller_account_role as enum ('admin', 'operator', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email) and char_length(email) <= 320),
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 80
  ),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 320),
  role public.workspace_role not null check (role <> 'owner'),
  invited_by_user_id uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or accepted_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create table public.seller_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  meli_user_id text not null unique check (meli_user_id ~ '^[0-9]+$'),
  nickname text,
  site_id text,
  profile_url text,
  logo_url text,
  enabled boolean not null default true,
  connected_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seller_account_members (
  seller_account_id uuid not null references public.seller_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.seller_account_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (seller_account_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members(user_id, workspace_id);
create index workspace_invitations_workspace_id_idx on public.workspace_invitations(workspace_id, created_at desc);
create unique index workspace_invitations_open_email_idx
  on public.workspace_invitations(workspace_id, email)
  where accepted_at is null and revoked_at is null;
create index seller_accounts_workspace_id_idx on public.seller_accounts(workspace_id, created_at);
create index seller_account_members_user_id_idx on public.seller_account_members(user_id, seller_account_id);

create or replace function onframe_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function onframe_private.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

create or replace function onframe_private.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by_user_id, 'owner');

  return new;
end;
$$;

create or replace function onframe_private.validate_seller_account_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.seller_accounts seller_account
    inner join public.workspace_members workspace_member
      on workspace_member.workspace_id = seller_account.workspace_id
    where seller_account.id = new.seller_account_id
      and workspace_member.user_id = new.user_id
  ) then
    raise exception 'seller account member must belong to its workspace';
  end if;

  return new;
end;
$$;

revoke all on function onframe_private.set_updated_at() from public;
revoke all on function onframe_private.sync_auth_user() from public;
revoke all on function onframe_private.add_workspace_owner() from public;
revoke all on function onframe_private.validate_seller_account_member() from public;
grant usage on schema onframe_private to supabase_auth_admin;
grant execute on function onframe_private.sync_auth_user() to supabase_auth_admin;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function onframe_private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function onframe_private.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function onframe_private.set_updated_at();

create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function onframe_private.set_updated_at();

create trigger seller_accounts_set_updated_at
before update on public.seller_accounts
for each row execute function onframe_private.set_updated_at();

create trigger seller_account_members_set_updated_at
before update on public.seller_account_members
for each row execute function onframe_private.set_updated_at();

create trigger auth_user_profile_sync
after insert or update of email on auth.users
for each row execute function onframe_private.sync_auth_user();

create trigger workspace_owner_membership
after insert on public.workspaces
for each row execute function onframe_private.add_workspace_owner();

create trigger seller_account_member_workspace_check
before insert or update of seller_account_id, user_id on public.seller_account_members
for each row execute function onframe_private.validate_seller_account_member();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.seller_account_members enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.workspace_members from anon, authenticated;
revoke all on table public.workspace_invitations from anon, authenticated;
revoke all on table public.seller_accounts from anon, authenticated;
revoke all on table public.seller_account_members from anon, authenticated;
