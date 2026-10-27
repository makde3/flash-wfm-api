-- Retours bêta, une ligne par envoi.
-- L'auteur est forcé depuis la session : le client ne choisit ni user_id ni email.

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text,
  type text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint feedbacks_type_valide check (
    type in ('Amélioration / Suggestion', 'Signalement de bug', 'Autre')
  ),
  constraint feedbacks_message_utile check (char_length(btrim(message)) between 1 and 4000)
);

create index if not exists feedbacks_user_id_idx on public.feedbacks (user_id);

alter table public.feedbacks enable row level security;
alter table public.feedbacks force row level security;

revoke all on public.feedbacks from public, anon;
grant insert on public.feedbacks to authenticated;

create or replace function public.feedbacks_renseigner_auteur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'new row violates row-level security policy for table "feedbacks"'
      using errcode = '42501';
  end if;
  new.user_id := auth.uid();
  new.user_email := nullif(auth.jwt() ->> 'email', '');
  return new;
end;
$$;

revoke all on function public.feedbacks_renseigner_auteur() from public;
grant execute on function public.feedbacks_renseigner_auteur() to authenticated, service_role;

drop trigger if exists feedbacks_renseigner_auteur on public.feedbacks;

create trigger feedbacks_renseigner_auteur
  before insert on public.feedbacks
  for each row
  execute function public.feedbacks_renseigner_auteur();

drop policy if exists feedbacks_insert_own on public.feedbacks;

create policy feedbacks_insert_own
  on public.feedbacks
  for insert
  to authenticated
  with check (auth.uid() = user_id);
