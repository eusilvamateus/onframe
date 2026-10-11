-- Os dados comerciais pertencem ao D1. Preserve o legado para auditoria/exportacao.
revoke all on table public.profiles, public.workspaces, public.workspace_members,
  public.workspace_invitations, public.seller_accounts, public.seller_account_members
  from anon, authenticated;
revoke usage on schema onframe_private from authenticated;
revoke execute on function onframe_private.is_workspace_member(uuid),
  onframe_private.is_workspace_admin(uuid), onframe_private.can_read_profile(uuid),
  onframe_private.can_access_seller_account(uuid), onframe_private.can_manage_seller_account_members(uuid)
  from authenticated;
drop trigger if exists auth_user_profile_sync on auth.users;
comment on table public.profiles is 'Legado do OnFrame; perfil operacional mantido no D1.';
comment on table public.workspaces is 'Legado do OnFrame; fonte canonica no D1.';
comment on table public.workspace_members is 'Legado do OnFrame; permissoes mantidas no D1.';
comment on table public.workspace_invitations is 'Legado do OnFrame; convites mantidos no D1.';
comment on table public.seller_accounts is 'Legado do OnFrame; contas mantidas no D1.';
comment on table public.seller_account_members is 'Legado do OnFrame; atribuicoes mantidas no D1.';

create table onframe_private.identity_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  changed_at timestamptz,
  reason text
);
revoke all on table onframe_private.identity_security from public, anon, authenticated;
alter table onframe_private.identity_security enable row level security;
insert into onframe_private.identity_security (user_id) select id from auth.users;

create function onframe_private.track_identity_security()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare
  change_reason text;
begin
  if tg_op = 'INSERT' then
    insert into onframe_private.identity_security (user_id) values (new.id);
    return new;
  end if;
  if new.email is distinct from old.email then
    change_reason := 'email_changed';
  elsif new.encrypted_password is distinct from old.encrypted_password then
    change_reason := 'password_changed';
  elsif new.banned_until is distinct from old.banned_until
      or new.deleted_at is distinct from old.deleted_at
      or new.email_confirmed_at is distinct from old.email_confirmed_at then
    change_reason := 'identity_access_changed';
  else
    return new;
  end if;
  update onframe_private.identity_security
    set version = version + 1, changed_at = clock_timestamp(), reason = change_reason
    where user_id = new.id;
  return new;
end;
$$;
revoke all on function onframe_private.track_identity_security() from public, anon, authenticated;
create trigger onframe_identity_security
after insert or update on auth.users
for each row execute function onframe_private.track_identity_security();

create function onframe_private.track_factor_security()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if old.status = 'verified' and (tg_op = 'DELETE' or new.status is distinct from old.status) then
    update onframe_private.identity_security
      set version = version + 1, changed_at = clock_timestamp(), reason = 'mfa_factor_removed'
      where user_id = old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function onframe_private.track_factor_security() from public, anon, authenticated;
create trigger onframe_factor_security
after update or delete on auth.mfa_factors
for each row execute function onframe_private.track_factor_security();

-- Esta RPC nunca devolve senhas, hashes, tokens ou dados de workspace.
create function public.onframe_identity_state(p_user_id uuid, p_session_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'subject', u.id,
    'email', lower(u.email),
    'version', s.version,
    'reason', s.reason,
    'sessionActive', exists (
      select 1 from auth.sessions a
      where a.id = p_session_id and a.user_id = u.id
        and (a.not_after is null or a.not_after > now())
        and (s.changed_at is null or a.created_at > s.changed_at)
    )
  )
  from auth.users u
  join onframe_private.identity_security s on s.user_id = u.id
  where u.id = p_user_id and u.deleted_at is null
    and u.email_confirmed_at is not null and u.email is not null
    and (u.banned_until is null or u.banned_until <= now());
$$;
revoke all on function public.onframe_identity_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.onframe_identity_state(uuid, uuid) to service_role;
comment on function public.onframe_identity_state(uuid, uuid)
  is 'Estado canonico de identidade para o Worker; acesso exclusivo de service_role.';
