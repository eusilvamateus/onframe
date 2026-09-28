create index workspaces_created_by_user_id_idx on public.workspaces(created_by_user_id);
create index workspace_invitations_invited_by_user_id_idx on public.workspace_invitations(invited_by_user_id);
create index workspace_invitations_accepted_by_user_id_idx on public.workspace_invitations(accepted_by_user_id);
create index seller_accounts_connected_by_user_id_idx on public.seller_accounts(connected_by_user_id);

create or replace function onframe_private.is_workspace_member(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = requested_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function onframe_private.is_workspace_admin(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = requested_workspace_id
      and user_id = auth.uid()
      and role in ('owner'::public.workspace_role, 'admin'::public.workspace_role)
  );
$$;

create or replace function onframe_private.can_read_profile(requested_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_profile_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members actor_membership
      inner join public.workspace_members target_membership
        on target_membership.workspace_id = actor_membership.workspace_id
      where actor_membership.user_id = auth.uid()
        and target_membership.user_id = requested_profile_id
    );
$$;

create or replace function onframe_private.can_access_seller_account(requested_seller_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seller_accounts seller_account
    where seller_account.id = requested_seller_account_id
      and (
        exists (
          select 1
          from public.workspace_members workspace_member
          where workspace_member.workspace_id = seller_account.workspace_id
            and workspace_member.user_id = auth.uid()
            and workspace_member.role in ('owner'::public.workspace_role, 'admin'::public.workspace_role)
        )
        or exists (
          select 1
          from public.seller_account_members seller_account_member
          where seller_account_member.seller_account_id = seller_account.id
            and seller_account_member.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function onframe_private.can_manage_seller_account_members(requested_seller_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seller_accounts seller_account
    where seller_account.id = requested_seller_account_id
      and (
        exists (
          select 1
          from public.workspace_members workspace_member
          where workspace_member.workspace_id = seller_account.workspace_id
            and workspace_member.user_id = auth.uid()
            and workspace_member.role in ('owner'::public.workspace_role, 'admin'::public.workspace_role)
        )
        or exists (
          select 1
          from public.seller_account_members seller_account_member
          where seller_account_member.seller_account_id = seller_account.id
            and seller_account_member.user_id = auth.uid()
            and seller_account_member.role = 'admin'::public.seller_account_role
        )
      )
  );
$$;

revoke all on function onframe_private.is_workspace_member(uuid) from public;
revoke all on function onframe_private.is_workspace_admin(uuid) from public;
revoke all on function onframe_private.can_read_profile(uuid) from public;
revoke all on function onframe_private.can_access_seller_account(uuid) from public;
revoke all on function onframe_private.can_manage_seller_account_members(uuid) from public;

grant usage on schema onframe_private to authenticated;
grant execute on function onframe_private.is_workspace_member(uuid) to authenticated;
grant execute on function onframe_private.is_workspace_admin(uuid) to authenticated;
grant execute on function onframe_private.can_read_profile(uuid) to authenticated;
grant execute on function onframe_private.can_access_seller_account(uuid) to authenticated;
grant execute on function onframe_private.can_manage_seller_account_members(uuid) to authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select on table public.workspace_invitations to authenticated;
grant select on table public.seller_accounts to authenticated;
grant select on table public.seller_account_members to authenticated;

create policy profiles_read_shared_workspace
on public.profiles
for select
to authenticated
using ((select onframe_private.can_read_profile(id)));

create policy workspaces_read_membership
on public.workspaces
for select
to authenticated
using ((select onframe_private.is_workspace_member(id)));

create policy workspace_members_read_membership
on public.workspace_members
for select
to authenticated
using ((select onframe_private.is_workspace_member(workspace_id)));

create policy workspace_invitations_read_admin
on public.workspace_invitations
for select
to authenticated
using ((select onframe_private.is_workspace_admin(workspace_id)));

create policy seller_accounts_read_authorized
on public.seller_accounts
for select
to authenticated
using ((select onframe_private.can_access_seller_account(id)));

create policy seller_account_members_read_authorized
on public.seller_account_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select onframe_private.can_manage_seller_account_members(seller_account_id))
);
