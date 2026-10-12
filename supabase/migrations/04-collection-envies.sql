-- Krikrou collection · Phase 3 : collection partagée en lecture et liste d'envies
-- 1. Une seule ligne par carte et par personne dans la collection (la quantité compte les exemplaires).
-- 2. Lecture croisée : chaque membre connecté voit toutes les collections. L'écriture reste
--    réservée au propriétaire (ajout, modification, suppression inchangés).
-- 3. Nouvelle table des envies, même règle : lisible par les membres, modifiable par son propriétaire.
-- Retour arrière : drop table public.wishlist_items; puis remettre la politique « Lire sa collection ».
--
-- 1) Lance tel quel (ROLLBACK à la fin) : l'aperçu liste les règles attendues.
-- 2) Remplace le dernier ROLLBACK par COMMIT et relance.

begin;

-- 1. Une ligne par carte et par personne
alter table public.collection_items
  add constraint collection_items_user_card_key unique (user_id, card_id);

-- 2. Lecture croisée des collections
drop policy "Lire sa collection" on public.collection_items;
create policy "Collections visibles par les membres" on public.collection_items
  for select to authenticated using (true);

-- 3. Envies
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 très envie, 2 envie, 3 un jour
  note text check (char_length(note) <= 500),
  added_at timestamptz not null default now(),
  unique (user_id, card_id)
);
create index wishlist_items_card_id_idx on public.wishlist_items (card_id);

alter table public.wishlist_items enable row level security;
create policy "Envies visibles par les membres" on public.wishlist_items
  for select to authenticated using (true);
create policy "Ajouter à ses envies" on public.wishlist_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Modifier ses envies" on public.wishlist_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Retirer de ses envies" on public.wishlist_items
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.wishlist_items from public, anon, authenticated;
grant select, insert, update, delete on public.wishlist_items to authenticated;

-- Aperçu : les règles des deux tables.
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('collection_items', 'wishlist_items')
order by tablename, cmd;

rollback;
