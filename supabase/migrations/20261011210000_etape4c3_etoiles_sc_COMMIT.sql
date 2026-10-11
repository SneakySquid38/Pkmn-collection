-- =============================================================================
-- Étape 4c (suite 2) : raretés chinoises à étoiles (★) -> « rare »
-- Projet : Pkmn-collection — 2026-10-11
--
-- Vérification :
--   - ★ est documenté comme l'ancien symbole « Rare » des versions anglaise et
--     japonaise (extrabux.com, guide des raretés) ;
--   - dans nos alias, ● = commune et ◆ = peu commune (sets chinois Collect 151) :
--     ★ est la suite logique.
--   - ★★ et ★★★ : aucune source trouvée. Ils restent SANS rareté (non attribués).
--   - Les cartes SC à étoiles n'ont pas d'équivalent japonais dans la base.
--
-- Les cartes concernées sont marquées rarity_inferred = true (réversible).
-- Annulation : UPDATE cards SET rarity_code = NULL, rarity_inferred = false
--              WHERE rarity_inferred AND rarity = '★';
--
-- VERSION D'ÉCRITURE : la dernière ligne est « commit ». Test à blanc déjà validé : 161 cartes.
-- =============================================================================

begin;
set local statement_timeout = '15min';

-- 1. Alias : les imports futurs appliqueront la même règle
insert into public.rarity_aliases (raw_value, rarity_code, note) values
  ('★', 'rare', 'Chinois simplifié : ancien symbole Rare (vérifié, extrabux.com)')
on conflict (raw_value) do nothing;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport
select 1, 'cartes SC à étoile simple (★) concernées', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language = 'SC' and c.rarity_code is null and c.rarity = '★';

-- 2. Application
update public.cards c
set rarity_code = 'rare', rarity_inferred = true
from public.sets s
where s.id = c.set_id and s.language = 'SC'
  and c.rarity_code is null and c.rarity = '★';

insert into rapport
select 2, 'cartes SC encore sans rareté (★★, ★★★ et cas isolés)',
       (select count(*) from public.cards c join public.sets s on s.id = c.set_id
         where s.language = 'SC' and c.rarity_code is null);

select * from rapport order by ordre;

commit;
