-- Demandes d'accès Pro (e-mail professionnel + entreprise).
-- L'auteur est forcé depuis la session : le client ne choisit pas le user_id.
-- Aucune lecture côté client : seul service_role consulte les demandes.

create table if not exists public.pro_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  entreprise text not null,
  created_at timestamptz not null default now(),
  constraint pro_requests_email_utile check (char_length(btrim(email)) between 3 and 320),
  constraint pro_requests_entreprise_utile check (char_length(btrim(entreprise)) between 1 and 200)
);

create index if not exists pro_requests_user_id_idx on public.pro_requests (user_id, created_at desc);

alter table public.pro_requests enable row level security;
alter table public.pro_requests force row level security;

revoke all on public.pro_requests from public, anon;
grant insert on public.pro_requests to authenticated;

create or replace function public.pro_requests_renseigner_auteur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'new row violates row-level security policy for table "pro_requests"'
      using errcode = '42501';
  end if;
  new.user_id := auth.uid();
  new.email := btrim(new.email);
  new.entreprise := btrim(new.entreprise);
  return new;
end;
$$;

revoke all on function public.pro_requests_renseigner_auteur() from public;
grant execute on function public.pro_requests_renseigner_auteur() to authenticated, service_role;

drop trigger if exists pro_requests_renseigner_auteur on public.pro_requests;

create trigger pro_requests_renseigner_auteur
  before insert on public.pro_requests
  for each row
  execute function public.pro_requests_renseigner_auteur();

drop policy if exists pro_requests_insert_own on public.pro_requests;

create policy pro_requests_insert_own
  on public.pro_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);
