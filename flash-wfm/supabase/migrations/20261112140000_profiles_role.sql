-- Rôle applicatif. Seul service_role peut l'écrire.
-- Un client authentifié ne peut ni se créer admin, ni changer son rôle.

alter table public.profiles add column if not exists role text;

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
     or new.created_at is distinct from old.created_at
     or new.role is distinct from old.role then
    raise exception 'new row violates row-level security policy for table "profiles"'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop policy if exists profiles_insert_own on public.profiles;

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and plan = 'free'
    and role is null
  );
