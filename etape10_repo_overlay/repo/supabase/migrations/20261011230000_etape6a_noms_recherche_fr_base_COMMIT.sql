-- =============================================================================
-- Étape 6a : socle des noms de recherche en français (FR + Énergies de base)
-- Projet : Pkmn-collection — 2026-10-11
--
-- Crée :
--   - les extensions unaccent et pg_trgm (utilisées par la recherche, étape 6c/8) ;
--   - cards.search_name_fr           : nom de recherche en français ;
--   - cards.search_name_official     : vrai si le nom est celui imprimé sur la carte
--                                      (cartes FR), faux si généré (traduction non officielle).
--
-- Remplit :
--   - toutes les cartes FR : nom officiel tel quel (Pokémon, Dresseurs, Énergies) ;
--   - les Énergies de base JP / KR / TC / SC : « Énergie Feu », etc., d'après energy_types.
--     (Énergies spéciales asiatiques : non traitées, la carte reste trouvable par son nom d'origine.)
--
-- Les cartes Pokémon asiatiques (espèce + forme + propriétaire + suffixe) : étape 6b.
-- Les Dresseurs asiatiques restent vides, comme décidé.
--
-- Relançable : la colonne n'est écrasée que pour les cartes concernées par la règle.
-- Annulation : alter table public.cards drop column search_name_fr, drop column search_name_official;
--
-- VERSION COMMIT : applique les changements (la version sans _COMMIT est le test à blanc).
-- 
-- =============================================================================

begin;
set local statement_timeout = '15min';

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.cards add column if not exists search_name_fr text;
alter table public.cards add column if not exists search_name_official boolean not null default false;

comment on column public.cards.search_name_fr is
  'Nom de recherche en français : nom officiel (cartes FR) ou nom généré (cartes asiatiques).';
comment on column public.cards.search_name_official is
  'Vrai si search_name_fr est le nom imprimé sur la carte (FR) ; faux si généré (traduction non officielle).';

create temp table rapport (ordre int, controle text, n bigint) on commit drop;

-- 1. Cartes FR : nom officiel
update public.cards c
set search_name_fr = c.name, search_name_official = true
from public.sets s
where s.id = c.set_id and s.language = 'FR'
  and (c.search_name_fr is distinct from c.name or c.search_name_official is not true);

-- 2. Énergies de base asiatiques
create temp table cle_energie (langue text, cle text, code text) on commit drop;
insert into cle_energie values
  ('JP','草','grass'),('JP','炎','fire'),('JP','水','water'),('JP','雷','lightning'),('JP','超','psychic'),
  ('JP','闘','fighting'),('JP','悪','darkness'),('JP','鋼','metal'),('JP','フェアリー','fairy'),
  ('KR','풀','grass'),('KR','불꽃','fire'),('KR','물','water'),('KR','번개','lightning'),('KR','초','psychic'),
  ('KR','격투','fighting'),('KR','악','darkness'),('KR','강철','metal'),('KR','페어리','fairy'),
  ('TC','草','grass'),('TC','火','fire'),('TC','炎','fire'),('TC','水','water'),('TC','雷','lightning'),
  ('TC','超','psychic'),('TC','鬥','fighting'),('TC','惡','darkness'),('TC','鋼','metal'),('TC','妖','fairy'),
  ('SC','草','grass'),('SC','火','fire'),('SC','水','water'),('SC','雷','lightning'),('SC','超','psychic'),
  ('SC','斗','fighting'),('SC','恶','darkness'),('SC','钢','metal'),('SC','妖','fairy');

create temp table energies_asie on commit drop as
select c.id as card_id, k.code
from public.cards c
join public.sets s on s.id = c.set_id and s.language in ('JP','KR','TC','SC')
join cle_energie k on k.langue = s.language
 and k.cle = (regexp_match(regexp_replace(c.name, '[\s【】]', '', 'g'),
                           '^(?:基本|기본)(.+?)(?:エネルギー|能量|에너지)$'))[1]
where c.category = 'Énergie';

update public.cards c
set search_name_fr = 'Énergie ' || e.label_fr, search_name_official = false
from energies_asie a join public.energy_types e on e.code = a.code
where c.id = a.card_id
  and c.search_name_fr is distinct from 'Énergie ' || e.label_fr;

-- 3. Rapport
insert into rapport
select 1, 'cartes FR avec nom de recherche', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language = 'FR' and c.search_name_fr = c.name and c.search_name_official
union all
select 2, 'cartes FR sans nom de recherche', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language = 'FR' and c.search_name_fr is null
union all
select 3, 'Énergies de base asiatiques renseignées', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language <> 'FR' and c.category = 'Énergie' and c.search_name_fr is not null
union all
select 4, 'Énergies asiatiques restant vides (spéciales, laissées)', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language <> 'FR' and c.category = 'Énergie' and c.search_name_fr is null
union all
select 5, 'cartes non FR avec search_name_official = vrai (attendu 0)', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language <> 'FR' and c.search_name_official
union all
select 6, 'extensions unaccent + pg_trgm actives (attendu 2)', count(*)
from pg_extension where extname in ('unaccent','pg_trgm');

select * from rapport order by ordre;

commit;
