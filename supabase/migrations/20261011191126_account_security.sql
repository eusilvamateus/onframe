-- O fator e a sessao do provedor sao canonicos, inclusive para JWTs antigos.
create or replace function onframe_private.track_factor_security()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'verified' then
      update onframe_private.identity_security set version = version + 1,
        changed_at = clock_timestamp(), reason = 'mfa_factor_added' where user_id = new.user_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'verified' and new.status = 'verified' then
      update onframe_private.identity_security set version = version + 1,
        changed_at = clock_timestamp(), reason = 'mfa_factor_added' where user_id = new.user_id;
    elsif old.status = 'verified' and new.status <> 'verified' then
      update onframe_private.identity_security set version = version + 1,
        changed_at = clock_timestamp(), reason = 'mfa_factor_removed' where user_id = old.user_id;
    end if;
  elsif old.status = 'verified' then
    update onframe_private.identity_security set version = version + 1,
      changed_at = clock_timestamp(), reason = 'mfa_factor_removed' where user_id = old.user_id;
  end if;
  return null;
end;
$$;
drop trigger onframe_factor_security on auth.mfa_factors;
create trigger onframe_factor_security after insert or update or delete on auth.mfa_factors
for each row execute function onframe_private.track_factor_security();

create or replace function public.onframe_identity_state(p_user_id uuid, p_session_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'subject', u.id, 'email', lower(u.email), 'version', s.version, 'reason', s.reason,
    'sessionActive', exists (
      select 1 from auth.sessions a
      where a.id = p_session_id and a.user_id = u.id
        and (a.not_after is null or a.not_after > now())
        and (s.changed_at is null or a.created_at > s.changed_at)
        and (a.aal::text = 'aal2' or not exists (
          select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'
        ))
    )
  )
  from auth.users u join onframe_private.identity_security s on s.user_id = u.id
  where u.id = p_user_id and u.deleted_at is null and u.email_confirmed_at is not null
    and u.email is not null and (u.banned_until is null or u.banned_until <= now());
$$;

create function public.onframe_security_overview(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'factors', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.friendly_name, 'type', f.factor_type, 'createdAt', f.created_at
    ) order by f.created_at) from auth.mfa_factors f
      where f.user_id = u.id and f.status = 'verified'), '[]'::jsonb),
    'passkeys', coalesce((select jsonb_agg(jsonb_build_object(
      'id', k.id, 'name', k.friendly_name, 'createdAt', k.created_at, 'lastUsedAt', k.last_used_at
    ) order by k.created_at) from auth.webauthn_credentials k where k.user_id = u.id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'userAgent', left(a.user_agent, 512), 'createdAt', a.created_at,
      'lastSeenAt', greatest(a.updated_at, a.refreshed_at, a.created_at)
    ) order by a.created_at desc) from auth.sessions a
      where a.user_id = u.id and (a.not_after is null or a.not_after > now())
        and (s.changed_at is null or a.created_at > s.changed_at)
        and (a.aal::text = 'aal2' or not exists (
          select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'
        ))), '[]'::jsonb)
  )
  from auth.users u join onframe_private.identity_security s on s.user_id = u.id
  where u.id = p_user_id and u.deleted_at is null and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= now());
$$;

create function public.onframe_revoke_sessions(p_user_id uuid, p_session_id uuid default null)
returns integer language plpgsql security definer set search_path = pg_catalog
as $$
declare revoked integer;
begin
  update auth.refresh_tokens set revoked = true, updated_at = now()
    where session_id in (select id from auth.sessions
      where user_id = p_user_id and (p_session_id is null or id = p_session_id));
  delete from auth.sessions where user_id = p_user_id and (p_session_id is null or id = p_session_id);
  get diagnostics revoked = row_count;
  return revoked;
end;
$$;

revoke all on function public.onframe_security_overview(uuid),
  public.onframe_revoke_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.onframe_security_overview(uuid),
  public.onframe_revoke_sessions(uuid, uuid) to service_role;
