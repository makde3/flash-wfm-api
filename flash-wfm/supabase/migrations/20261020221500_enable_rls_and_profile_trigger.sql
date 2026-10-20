-- Active la RLS et limite chaque ligne à son propriétaire (auth.uid() = user_id).

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists public.forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists user_id uuid;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
create unique index if not exists profiles_user_id_key on public.profiles (user_id);

alter table public.forecasts add column if not exists user_id uuid;
alter table public.schedules add column if not exists user_id uuid;

do $$
declare
  table_record record;
  policy_name text;
begin
  for table_record in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_record.tablename);
  end loop;

  for table_record in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
  loop
    policy_name := table_record.table_name || '_own_rows';
    execute format('drop policy if exists %I on public.%I', policy_name, table_record.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      policy_name,
      table_record.table_name
    );
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
