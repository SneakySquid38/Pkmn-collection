-- =============================================================================
-- Étape 4c (suite) : raretés JP manquantes, depuis la copie TCGdex de la même carte
-- Projet : Pkmn-collection — 2026-10-11
--
-- Une carte japonaise de la source PTCG-database sans rareté reçoit la rareté de
-- sa copie TCGdex lorsque les deux ont le même set (code) et le même numéro.
-- Ce n'est pas une déduction : c'est la même carte, vue dans une autre source.
-- Les valeurs sont marquées rarity_inferred = true (réversibles).
--
-- Mesure préalable : 234 cartes concernées (233 « none », 1 « promo »).
-- Annulation : UPDATE cards SET rarity_code = NULL, rarity_inferred = false
--              WHERE rarity_inferred AND source = 'ptcg-database';
--
-- VERSION D'ÉCRITURE : la dernière ligne est « commit ». Test à blanc déjà validé : 234 cartes.
-- =============================================================================

begin;
set local statement_timeout = '15min';

create temp table copies on commit drop as
select c.id as card_id, t.rarity_code
from public.cards c
join public.sets s on s.id = c.set_id and s.language = 'JP'
join public.sets ts on ts.language = 'JP' and ts.code = s.code
join public.cards t on t.set_id = ts.id and t.source = 'tcgdex' and t.rarity_code is not null
  and t.number ~ '^0*[0-9]+$' and c.number ~ '^0*[0-9]+$' and t.number::int = c.number::int
where c.source = 'ptcg-database' and c.rarity_code is null;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport
select 1, 'cartes JP ptcg-database sans rareté, avec copie TCGdex renseignée', count(distinct card_id) from copies;

update public.cards c
set rarity_code = k.rarity_code, rarity_inferred = true
from (select distinct on (card_id) card_id, rarity_code from copies order by card_id) k
where c.id = k.card_id;

insert into rapport
select 2, 'cartes JP sans rareté après correction (total)',
       (select count(*) from public.cards c join public.sets s on s.id = c.set_id
         where s.language = 'JP' and c.rarity_code is null);

select * from rapport order by ordre;

commit;
