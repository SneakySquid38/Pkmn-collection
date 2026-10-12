-- =============================================================================
-- Étape 3 : préparation du chinois simplifié (PTCG-CHS-Datasets)
-- Projet : Pkmn-collection — 2026-10-11
--
-- 1. sets.is_published : un set non publié reste en base (pour relier les
--    cartes) mais n'est visible ni dans l'API publique ni sur le site.
--    Le chinois simplifié sera importé NON publié tant que l'auteur du jeu de
--    données n'a pas donné son accord (licence : pas de redistribution).
-- 2. Lecture publique de sets et cards limitée aux sets publiés.
-- 3. Raretés propres au chinois simplifié (无标记 = sans symbole, ● ◆ …).
-- =============================================================================

begin;

-- 1. Publication
alter table public.sets add column is_published boolean not null default true;

-- 2. Lecture publique limitée aux sets publiés
drop policy if exists "Lecture publique" on public.sets;
create policy "Lecture publique des sets publiés" on public.sets
  for select to anon, authenticated using (is_published);

drop policy if exists "Lecture publique" on public.cards;
create policy "Lecture publique des cartes publiées" on public.cards
  for select to anon, authenticated
  using (exists (select 1 from public.sets s where s.id = cards.set_id and s.is_published));

-- 3. Raretés chinoises (les sigles C, U, R, RR, SR, AR, SAR… existent déjà)
insert into public.rarity_aliases (raw_value, rarity_code, note) values
  ('无标记', 'none',     'Chinois simplifié : sans symbole'),
  ('●',      'common',   'Chinois simplifié (Collect 151)'),
  ('◆',      'uncommon', 'Chinois simplifié (Collect 151)'),
  ('FUR',    'special_rare', 'Chinois simplifié')
on conflict (raw_value) do nothing;

commit;
