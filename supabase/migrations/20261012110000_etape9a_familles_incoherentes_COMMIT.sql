-- =============================================================================
-- Étape 9a : détacher les cartes rattachées à la mauvaise famille asiatique
-- Projet : Pkmn-collection — 2026-10-12
--
-- Constat (contrôle n°5 de l'étape 9, lecture seule) : 152 cartes KR / TC / SC (65 familles) ont un
-- Pokédex qui n'a AUCUN numéro en commun avec la carte ancre japonaise de leur famille
-- (ex. famille « Lapras » JP contenant « Entei-du-Sinnoh » SC / TC ; famille « Salamèche » avec
-- Reptincel ex KR). Elles ne sont pas des équivalents : les rapprochements venaient de l'empreinte
-- ou de la clé d'impression sur des cas ambigus. Les équipes (« A & B-GX », un seul Pokédex côté
-- KR / TC / SC) ne sont PAS concernées : au moins un numéro est commun.
--
-- Correction (jamais deviner) : chaque carte concernée devient une carte autonome :
--   - elle reçoit sa propre famille (canonical_key asia:<source>:<langue>:<source_id>, ancre = elle-même),
--     comme les autres cartes autonomes ;
--   - sa ligne de `card_entity_matches` est supprimée ;
--   - sa rareté héritée de l'ancre (rarity_inferred) est retirée : elle redevient sans rareté.
-- Les cartes ancres JP ne sont pas touchées ; aucune carte n'est supprimée.
--
-- VERSION COMMIT.
-- =============================================================================

begin;
set local statement_timeout = '15min';

create temp table bad on commit drop as
select c.id as card_id, c.card_entity_id as old_entity_id, c.language, c.source, c.source_id, c.name, c.rarity_inferred
from public.cards c
join public.card_entities e on e.id = c.card_entity_id
join public.cards a on a.id = e.anchor_card_id
where c.id <> a.id
  and c.category = 'Pokémon'
  and jsonb_typeof(c.dex_ids) = 'array' and jsonb_array_length(c.dex_ids) > 0
  and jsonb_typeof(a.dex_ids) = 'array' and jsonb_array_length(a.dex_ids) > 0
  and not exists (select 1 from jsonb_array_elements(c.dex_ids) x where a.dex_ids @> jsonb_build_array(x));

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'cartes à détacher : ' || language, count(*) from bad group by language;
insert into rapport select 2, 'familles concernées', count(distinct old_entity_id) from bad;
insert into rapport select 3, 'dont rareté héritée à retirer', count(*) from bad where rarity_inferred;
insert into rapport select 4, 'clés canoniques déjà existantes (attendu 0)', count(*)
  from bad b join public.card_entities e on e.canonical_key = 'asia:' || b.source || ':' || b.language || ':' || b.source_id;
insert into rapport select 5, 'cartes sans source_id ou source (attendu 0)', count(*) from bad where source_id is null or source is null;

-- 1. nouvelles familles autonomes
insert into public.card_entities (canonical_key, display_name, kind, anchor_card_id)
select 'asia:' || b.source || ':' || b.language || ':' || b.source_id, b.name, 'asia', b.card_id
from bad b
on conflict (canonical_key) do nothing;

-- 2. rattachement des cartes à leur propre famille
update public.cards c
set card_entity_id = e.id
from bad b
join public.card_entities e on e.canonical_key = 'asia:' || b.source || ':' || b.language || ':' || b.source_id
where c.id = b.card_id;

-- 3. suppression des anciens rapprochements
delete from public.card_entity_matches m using bad b where m.card_id = b.card_id;

-- 4. rareté héritée de l'ancre retirée
update public.cards c set rarity_code = null, rarity_inferred = false
from bad b where c.id = b.card_id and b.rarity_inferred;

select public.refresh_search_text((select array_agg(card_id) from bad));

insert into rapport select 10, 'cartes sans famille propre après (attendu 0)', count(*)
  from bad b join public.cards c on c.id = b.card_id join public.card_entities e on e.id = c.card_entity_id
  where e.anchor_card_id <> c.id;
insert into rapport select 11, 'cartes incompatibles avec leur ancre après (attendu 0)', count(*)
from public.cards c
join public.card_entities e on e.id = c.card_entity_id
join public.cards a on a.id = e.anchor_card_id
where c.id <> a.id and c.category = 'Pokémon'
  and jsonb_typeof(c.dex_ids) = 'array' and jsonb_array_length(c.dex_ids) > 0
  and jsonb_typeof(a.dex_ids) = 'array' and jsonb_array_length(a.dex_ids) > 0
  and not exists (select 1 from jsonb_array_elements(c.dex_ids) x where a.dex_ids @> jsonb_build_array(x));
insert into rapport select 12, 'familles asiatiques au total', count(*) from public.card_entities;
insert into rapport select 13, 'lignes card_entity_matches', count(*) from public.card_entity_matches;
insert into rapport select 14, 'cartes dont la famille n''a pas d''ancre valide (attendu 0)', count(*)
  from public.cards c join public.card_entities e on e.id = c.card_entity_id where e.anchor_card_id is null;

select * from rapport order by ordre, controle;

commit;
