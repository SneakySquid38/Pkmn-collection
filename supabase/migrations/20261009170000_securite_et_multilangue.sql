-- =============================================================================
-- Migration : sécurité (RLS), comptes utilisateurs et langues KR / SC / TC
-- Projet     : Pkmn-collection
-- Date       : 2026-10-09
--
-- À exécuter en une seule fois dans le SQL Editor de Supabase.
-- Tout est dans une transaction : si une étape échoue, rien n'est modifié.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Garde-fous : on s'arrête si la base n'est pas dans l'état attendu
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.users) then
    raise exception 'public.users contient des lignes : migration interrompue, rien n''a été modifié.';
  end if;
  if exists (select 1 from public.collection_items) then
    raise exception 'public.collection_items contient des lignes : migration interrompue, rien n''a été modifié.';
  end if;
  if exists (select 1 from public.sets where language = 'CN')
     or exists (select 1 from public.cards where language = 'CN')
     or exists (select 1 from public.card_translations where language = 'CN') then
    raise exception 'Des lignes utilisent encore la langue CN : migration interrompue, rien n''a été modifié.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 1. Langues : FR, JP, KR, SC (chinois simplifié), TC (chinois traditionnel)
--    Remplace l'ancienne liste FR / JP / KR / CN, qui bloquait l'import chinois.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.sets'::regclass, 'public.cards'::regclass, 'public.card_translations'::regclass)
      and pg_get_constraintdef(oid) ilike '%language%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.sets
  add constraint sets_language_check check (language in ('FR', 'JP', 'KR', 'SC', 'TC'));
alter table public.cards
  add constraint cards_language_check check (language in ('FR', 'JP', 'KR', 'SC', 'TC'));
alter table public.card_translations
  add constraint card_translations_language_check check (language in ('FR', 'JP', 'KR', 'SC', 'TC'));


-- -----------------------------------------------------------------------------
-- 2. Unicité par langue
--    Le Japon et la Corée partagent les mêmes codes de set (M1L, M2...) dans
--    PTCG-database : l'unicité doit inclure la langue.
-- -----------------------------------------------------------------------------
alter table public.sets  drop constraint if exists sets_source_source_id_unique;
drop index if exists public.sets_source_source_id_unique;
alter table public.sets
  add constraint sets_source_language_source_id_key unique (source, language, source_id);

alter table public.cards drop constraint if exists cards_source_source_id_unique;
drop index if exists public.cards_source_source_id_unique;
alter table public.cards
  add constraint cards_source_language_source_id_key unique (source, language, source_id);


-- -----------------------------------------------------------------------------
-- 3. Comptes : public.users remplacé par public.profiles, relié à Supabase Auth
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Crée automatiquement un profil à chaque inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profils pour les comptes qui existeraient déjà
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Les collections pointent désormais vers les profils
alter table public.collection_items drop constraint collection_items_user_id_fkey;
alter table public.collection_items
  add constraint collection_items_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

drop table public.users;


-- -----------------------------------------------------------------------------
-- 4. updated_at mis à jour automatiquement sur toutes les tables qui l'ont
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'create or replace trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 5. Sécurité (RLS)
--    La RLS est déjà active partout mais sans aucune règle : le site ne peut
--    rien lire avec la clé publique. Les scripts (clé service_role) ne sont
--    pas concernés, ils contournent la RLS.
-- -----------------------------------------------------------------------------

-- 5a. Catalogue : lecture pour tout le monde, écriture réservée aux scripts
do $$
declare t text;
begin
  foreach t in array array['sets', 'cards', 'card_pokemon', 'pokemon_entities',
                           'card_entities', 'card_translations', 'set_mappings']
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

create policy "Lecture publique" on public.sets              for select to anon, authenticated using (true);
create policy "Lecture publique" on public.cards             for select to anon, authenticated using (true);
create policy "Lecture publique" on public.card_pokemon      for select to anon, authenticated using (true);
create policy "Lecture publique" on public.pokemon_entities  for select to anon, authenticated using (true);
create policy "Lecture publique" on public.card_entities     for select to anon, authenticated using (true);
create policy "Lecture publique" on public.card_translations for select to anon, authenticated using (true);
create policy "Lecture des correspondances validées" on public.set_mappings
  for select to anon, authenticated using (status = 'verified');

-- 5b. Tables internes : aucun accès depuis le site, uniquement les scripts
revoke all on public.card_sources, public.card_entity_matches, public.sync_runs
  from anon, authenticated;

-- 5c. Profils : visibles par tous, modifiables par leur propriétaire
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy "Profils visibles par tous" on public.profiles
  for select to anon, authenticated using (true);
create policy "Chacun modifie son profil" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 5d. Collections : privées, chacun ne voit et ne modifie que la sienne
revoke all on public.collection_items from anon, authenticated;
grant select, insert, update, delete on public.collection_items to authenticated;

create policy "Lire sa collection" on public.collection_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Ajouter à sa collection" on public.collection_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Modifier sa collection" on public.collection_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Supprimer de sa collection" on public.collection_items
  for delete to authenticated using ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 6. Ménage : index en double (déjà couverts par un autre index)
-- -----------------------------------------------------------------------------
drop index if exists public.idx_card_entities_canonical_key;   -- doublon de l'index unique
drop index if exists public.idx_pokemon_entities_dex_id;       -- doublon de l'index unique
drop index if exists public.idx_card_entity_matches_card;      -- doublon de l'index unique sur card_id
drop index if exists public.idx_card_pokemon_card;             -- couvert par (card_id, pokemon_entity_id)
drop index if exists public.idx_card_translations_entity;      -- couvert par (card_entity_id, language)
drop index if exists public.idx_set_mappings_source;           -- couvert par (source_set_id, target_set_id)
drop index if exists public.idx_card_sources_card_id;          -- couvert par (card_id, source_name, source_id)

-- card_id est déjà unique seul : l'unicité (card_entity_id, card_id) est inutile
alter table public.card_entity_matches
  drop constraint if exists card_entity_matches_card_entity_id_card_id_key;
drop index if exists public.card_entity_matches_card_entity_id_card_id_key;

commit;
