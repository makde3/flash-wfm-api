-- Dernier lien d'import validé, propre à auth.uid().
-- La policy profiles_update_own autorise déjà la mise à jour
-- tant que plan, user_id, email et created_at ne changent pas.

alter table public.profiles add column if not exists last_source_url text;
