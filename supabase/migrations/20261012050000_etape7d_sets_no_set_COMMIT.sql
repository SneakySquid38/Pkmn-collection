-- =============================================================================
-- Étape 7d : cartes des sets « no_set » (94 JP, 106 KR)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Constat (lecture seule) : les 200 cartes sont toutes des Énergies de base (numéros DAR, FAI, FIG,
-- FIR, GRA, LIG, MET, PSY, WAT), chacune un tirage distinct (image et famille uniques).
--
--   KR (106) : l'identifiant de source (KR-BS2023009035…) commence par le code du produit d'origine.
--     103 cartes ont un préfixe qui pointe vers un seul vrai set KR (SVAL, SVAM, SVAW, SVB, SVC, SVD,
--     SVF, SVG, SVHK, SVHM, SVK, SVLN, SVLS, SVM, SVN, SVOD, SVOM, SVEL, SVEM, MBD, MBG, MA, MC) :
--     elles y sont rattachées. Aucune n'y figure déjà (0 doublon d'image, de nom + numéro ou de famille).
--     3 cartes (KR-MP002026001 à 003, Énergies des promos Méga « M-P ») n'ont pas de set KR cible : le set
--     KR « M-P » n'existe pas. Elles restent dans le set KR `no_set`.
--   JP (94) : images du dossier générique « ENE » de pokemon-card.com, sans extension : elles restent
--     dans le set JP `no_set`.
--
-- Corrections :
--   - le set KR `no_set` portait par erreur le nom d'un vrai set (« Battle Enhance BOX Maître de la
--     flamme noire ») : son nom redevient `no_set`, comme côté JP, et sa ligne `ko` de `set_translations`
--     (copie du nom du vrai set) est supprimée ;
--   - 7b l'avait classé « Écarlate et Violet » d'après ce nom erroné : il passe en « Autre », comme côté JP ;
--   - les deux sets reçoivent un nom français d'affichage dans `set_translations`
--     (`fr`, source `manual`, `is_official = false`) : « Énergies de base (sans extension) ».
--
-- Aucun set n'est supprimé (les cartes sont liées aux sets en suppression en cascade).
-- Le texte de recherche des 200 cartes est recalculé.
--
-- Annulation : remettre les 103 cartes dans le set KR `no_set` d'après leur source_id n'est pas
-- nécessaire en pratique ; sinon restaurer la sauvegarde de `cards`.
--
-- VERSION COMMIT : les modifications sont enregistrées (dernière ligne « commit »).
-- Dry-run validé : 103 cartes KR rattachées, 1 178 sets avant et après, 0 incohérence de langue.
-- Ne pas relancer deux fois : le second passage ne trouverait plus de carte à déplacer (sans effet).
-- =============================================================================

begin;
set local statement_timeout = '15min';

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'sets avant', count(*) from public.sets;
insert into rapport select 2, 'cartes dans le set KR no_set avant', count(*) from public.cards c join public.sets s on s.id = c.set_id where s.language = 'KR' and s.code = 'no_set';
insert into rapport select 3, 'cartes dans le set JP no_set avant', count(*) from public.cards c join public.sets s on s.id = c.set_id where s.language = 'JP' and s.code = 'no_set';

-- 1. KR : rattachement au vrai set d'après le préfixe de l'identifiant de source
create temp table kr_moves on commit drop as
with ne as (
  select c.id, substring(c.source_id from '^KR-BS\d{7}') as pre
  from public.cards c join public.sets s on s.id = c.set_id
  where s.language = 'KR' and s.code = 'no_set'
), tgt as (
  select substring(c.source_id from '^KR-BS\d{7}') as pre, (array_agg(distinct c.set_id))[1] as set_id
  from public.cards c join public.sets s on s.id = c.set_id
  where s.language = 'KR' and s.code <> 'no_set' and c.source_id ~ '^KR-BS\d{7}'
  group by 1 having count(distinct c.set_id) = 1
)
select ne.id as card_id, t.set_id from ne join tgt t on t.pre = ne.pre;

update public.cards c set set_id = m.set_id from kr_moves m where c.id = m.card_id;
insert into rapport select 10, 'cartes KR rattachées à leur vrai set', count(*) from kr_moves;

-- 2. Corrections des deux sets no_set
update public.sets set name = 'no_set' where language = 'KR' and code = 'no_set' and name <> 'no_set';
update public.sets s set series_id = 'autre', series = sr.name_fr
from public.series sr
where sr.code = 'autre' and s.code = 'no_set' and s.language in ('JP','KR')
  and (s.series_id is distinct from 'autre' or s.series is distinct from sr.name_fr);

update public.set_series_map set series_id = 'autre', source = 'manual',
  note = 'Énergies de base sans extension (corrigé en 7d)'
where language = 'KR' and code = 'no_set';

delete from public.set_translations t using public.sets s
where t.set_id = s.id and s.language = 'KR' and s.code = 'no_set' and t.language = 'ko' and t.source = 'import';

insert into public.set_translations (set_id, language, name, source, is_official)
select s.id, 'fr', 'Énergies de base (sans extension)', 'manual', false
from public.sets s where s.code = 'no_set' and s.language in ('JP','KR')
on conflict (set_id, language) do nothing;

-- 3. Texte de recherche des 200 cartes
select public.refresh_search_text(array(
  select c.id from public.cards c
  where c.id in (select card_id from kr_moves)
     or c.set_id in (select id from public.sets where code = 'no_set')));

-- Rapport
insert into rapport select 20, 'sets après (inchangé)', count(*) from public.sets;
insert into rapport select 21, 'cartes restant dans le set KR no_set', count(*) from public.cards c join public.sets s on s.id = c.set_id where s.language = 'KR' and s.code = 'no_set';
insert into rapport select 22, 'cartes restant dans le set JP no_set', count(*) from public.cards c join public.sets s on s.id = c.set_id where s.language = 'JP' and s.code = 'no_set';
insert into rapport
select 30, 'cartes KR rattachées : ' || s.code, count(*)
from kr_moves m join public.sets s on s.id = m.set_id group by s.code;
insert into rapport
select 40, 'cartes rattachées dont le search_text contient le code du nouveau set', count(*)
from kr_moves m join public.cards c on c.id = m.card_id join public.sets s on s.id = c.set_id
where c.search_text like '%' || extensions.unaccent(lower(s.code)) || '%';
insert into rapport
select 41, 'sets no_set : série (attendu 2 « autre »)', count(*) from public.sets where code = 'no_set' and series_id = 'autre';
insert into rapport
select 42, 'cartes dont la langue diffère de celle de leur set (attendu 0)', count(*)
from public.cards c join public.sets s on s.id = c.set_id where c.language <> s.language;

select * from rapport order by ordre, controle;

commit;
