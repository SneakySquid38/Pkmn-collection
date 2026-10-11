-- =============================================================================
-- Étape 1 du plan de données : nettoyage
-- Projet : Pkmn-collection — 2026-10-11
--
-- 1. Supprime le faux chinois simplifié (877 cartes, 8 sets) importé de
--    PTCG-database : c'est du chinois traditionnel mal étiqueté (doublons du TC).
--    Le vrai chinois simplifié sera importé à l'étape 3.
-- 2. Supprime 6 sets JP vides qui font doublon avec des sets remplis
--    (SM1+ … SM5+ = SM1p … SM5p ; PCG10 = WCP).
-- 3. Catégories : une seule écriture (Pokémon / Dresseur / Énergie) + contrainte.
-- 4. Supprime les tables abandonnées : card_translations (ancienne idée
--    d'entités FR+JP) et set_mappings (correspondances saisies à la main,
--    remplacées par une table calculée à l'étape 7).
--
-- Tout est dans une transaction : si une vérification échoue, rien n'est modifié.
-- Sauvegarde préalable : sauvegardes/base-2026-10-11.dump
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Garde-fous
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.collection_items) then
    raise exception 'collection_items n''est pas vide : migration interrompue.';
  end if;
  if (select count(*) from public.cards where language = 'SC') <> 877 then
    raise exception 'Nombre de cartes SC inattendu : migration interrompue.';
  end if;
  if exists (
    select 1 from public.cards c join public.sets s on s.id = c.set_id
    where s.language = 'JP' and s.source = 'tcgdex'
      and s.code in ('SM1+', 'sm2+', 'SM3+', 'SM4+', 'SM5+', 'PCG10')
  ) then
    raise exception 'Un des sets JP à supprimer contient des cartes : migration interrompue.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 1. Faux chinois simplifié
--    (card_pokemon, card_sources, card_entity_matches suivent par ON DELETE CASCADE)
-- -----------------------------------------------------------------------------
delete from public.cards where language = 'SC';
delete from public.set_mappings
  where source_set_id in (select id from public.sets where language = 'SC')
     or target_set_id in (select id from public.sets where language = 'SC');
delete from public.sets where language = 'SC';


-- -----------------------------------------------------------------------------
-- 2. Sets JP vides en double
-- -----------------------------------------------------------------------------
delete from public.set_mappings
  where source_set_id in (select id from public.sets where language = 'JP' and source = 'tcgdex'
                          and code in ('SM1+', 'sm2+', 'SM3+', 'SM4+', 'SM5+', 'PCG10'))
     or target_set_id in (select id from public.sets where language = 'JP' and source = 'tcgdex'
                          and code in ('SM1+', 'sm2+', 'SM3+', 'SM4+', 'SM5+', 'PCG10'));
delete from public.sets
  where language = 'JP' and source = 'tcgdex'
    and code in ('SM1+', 'sm2+', 'SM3+', 'SM4+', 'SM5+', 'PCG10');


-- -----------------------------------------------------------------------------
-- 3. Catégories
-- -----------------------------------------------------------------------------
update public.cards set category = 'Pokémon'  where category = 'Pokemon';
update public.cards set category = 'Dresseur' where category = 'Trainer';
update public.cards set category = 'Énergie'  where category = 'Energy';
-- 雙重渦輪能量 (Énergie Double Turbo, TC svb 028) : catégorie manquante dans la source
update public.cards set category = 'Énergie'
  where category is null and language = 'TC' and source_id = 'TC-svb-028';

do $$
begin
  if exists (select 1 from public.cards
             where category is null or category not in ('Pokémon', 'Dresseur', 'Énergie')) then
    raise exception 'Il reste des catégories non normalisées : migration interrompue.';
  end if;
end $$;

alter table public.cards alter column category set not null;
alter table public.cards
  add constraint cards_category_check check (category in ('Pokémon', 'Dresseur', 'Énergie'));


-- -----------------------------------------------------------------------------
-- 4. Tables abandonnées (vides ou remplacées ; contenu présent dans la sauvegarde)
-- -----------------------------------------------------------------------------
drop table public.card_translations;
drop table public.set_mappings;


-- -----------------------------------------------------------------------------
-- 5. Contrôle final
-- -----------------------------------------------------------------------------
do $$
declare n_cards int; n_sets int;
begin
  select count(*) into n_cards from public.cards;
  select count(*) into n_sets  from public.sets;
  if n_cards <> 81989 then
    raise exception 'Nombre de cartes final inattendu (% au lieu de 81 989) : migration interrompue.', n_cards;
  end if;
  if n_sets <> 946 then
    raise exception 'Nombre de sets final inattendu (% au lieu de 946) : migration interrompue.', n_sets;
  end if;
end $$;

commit;
