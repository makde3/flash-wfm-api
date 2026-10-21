-- Verrouille public.profiles.
-- La ligne appartient à auth.uid() = user_id (il n'y a pas de colonne id).
-- Un client authentifié peut modifier nom, prenom et entreprise.
-- La colonne plan ne change que si le rôle serveur est service_role.
--
-- RLS ne voit pas les colonnes d'un UPDATE. La policy UPDATE compare donc
-- le plan proposé au plan déjà stocké. Un BEFORE UPDATE rejette aussi le
-- changement quand le rôle contourne la RLS (propriétaire, service_role
-- mal configuré, etc.). service_role, qui a BYPASSRLS, passe le trigger.

alter table public.profiles add column if not exists nom text;
alter table public.profiles add column if not exists prenom text;
alter table public.profiles add column if not exists entreprise text;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to postgres, service_role, authenticated;

create or replace function private.profiles_current_plan(target_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select plan
  from public.profiles
  where user_id = target_user
    and (
      target_user = auth.uid()
      or coalesce(auth.role(), '') = 'service_role'
      or current_user = 'service_role'
    );
$$;

revoke all on function private.profiles_current_plan(uuid) from public;
grant execute on function private.profiles_current_plan(uuid) to authenticated, service_role;

create or replace function private.protect_profiles_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_user = 'service_role' then
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.user_id is distinct from old.user_id
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'new row violates row-level security policy for table "profiles"'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_profiles_plan() from public;
grant execute on function private.protect_profiles_plan() to authenticated, service_role;

drop trigger if exists profiles_protect_plan on public.profiles;

create trigger profiles_protect_plan
  before update on public.profiles
  for each row
  execute function private.protect_profiles_plan();

drop policy if exists profiles_own_rows on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and plan = 'free'
  );

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and plan is not distinct from private.profiles_current_plan(user_id)
  );

create policy profiles_delete_own
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);
