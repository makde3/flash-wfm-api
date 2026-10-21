-- Abonnements Stripe.
-- Un client authentifié peut lire sa ligne (auth.uid() = user_id).
-- Aucune policy d'écriture : insert, update et delete sont refusés au client.
-- service_role contourne la RLS et reste le seul écrivain (webhook).

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null,
  current_period_end timestamptz
);

create unique index if not exists subscriptions_stripe_subscription_id_key
  on public.subscriptions (stripe_subscription_id);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

drop policy if exists subscriptions_select_own on public.subscriptions;
drop policy if exists subscriptions_insert_own on public.subscriptions;
drop policy if exists subscriptions_update_own on public.subscriptions;
drop policy if exists subscriptions_delete_own on public.subscriptions;

create policy subscriptions_select_own
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);
