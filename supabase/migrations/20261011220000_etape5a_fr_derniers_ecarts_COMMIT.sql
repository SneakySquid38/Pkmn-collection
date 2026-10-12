-- =============================================================================
-- Étape 5a : cartes et sets FR, derniers écarts
-- Projet : Pkmn-collection — 2026-10-11
--
-- Diagnostic (lecture seule) : les cartes FR sont complètes (catégorie, rareté,
-- Pokédex, PV, numéro à 100 %). Restent :
--   1. 5 sets FR sans date ni série (Neo 1 à 4, Arceus) et un set nommé « pl4 »
--   2. 34 cartes à numérotation en lettres sans numéro de tri
--      (Zarbi ! A-Z, Mew B/G/R, Lithographies ONE-FOUR)
--
-- Non traité volontairement (absent de la source, ajout manuel plus tard) :
--   - 2 921 cartes sans image (anciens sets DP, Légendes, kits du dresseur…)
--   - 678 cartes sans illustrateur (promos, kits, énergies spéciales)
--   - 4 Morpeko V-UNION sans type
--
-- Dates : celles de TCGdex (date de sortie du set, identique pour toutes les langues).
--
-- VERSION D'ÉCRITURE : la dernière ligne est « commit ». Test à blanc déjà validé :
-- 0 set FR sans date/série/nom, 0 carte FR sans numéro de tri, 41 cartes recalculées.
-- =============================================================================

begin;
set local statement_timeout = '15min';

create temp table rapport (ordre int, controle text, n bigint) on commit drop;

-- 1. Sets FR : dates, séries, nom d'Arceus
update public.sets set release_date = v.d
from (values ('neo1', date '2000-12-16'), ('neo2', date '2001-06-01'),
             ('neo3', date '2001-09-21'), ('neo4', date '2002-02-28'),
             ('pl4',  date '2009-11-04')) as v(code, d)
where public.sets.language = 'FR' and public.sets.code = v.code and public.sets.release_date is null;

update public.sets set name = 'Arceus'
where language = 'FR' and code = 'pl4' and name = 'pl4';

update public.sets s set series = sr.name_fr
from public.series sr
where s.language = 'FR' and s.series is null and sr.code = s.series_id;

insert into rapport
select 1, 'sets FR sans date après correction', count(*) from public.sets where language = 'FR' and release_date is null
union all
select 2, 'sets FR sans série après correction', count(*) from public.sets where language = 'FR' and series is null
union all
select 3, 'sets FR sans nom (nom = code) après correction', count(*) from public.sets where language = 'FR' and (name is null or name = code);

-- 2. Numéro de tri pour les cartes à numérotation en lettres
create or replace function public.card_sort_number(num text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when num is null or num ~ '^(JP|KR|TC|SC)-' then null
    when substring(num from '[0-9]+') is not null then
      case when length(substring(num from '[0-9]+')) > 6 then null
           else substring(num from '[0-9]+')::integer end
    when num ~ '^[A-Za-z]$' then ascii(upper(num)) - 64            -- A=1 … Z=26
    when num = '!' then 0                                           -- Zarbi « ! » avant le « A »
    when upper(num) = 'ONE' then 1
    when upper(num) = 'TWO' then 2
    when upper(num) = 'THREE' then 3
    when upper(num) = 'FOUR' then 4
    else null
  end
$$;

insert into rapport
select 4, 'cartes sans numéro de tri avant', count(*) from public.cards where sort_number is null;

-- Recalcul via le déclencheur (UPDATE OF number), uniquement pour les cartes qui obtiennent une valeur
update public.cards set number = number
where sort_number is null
  and public.card_sort_number(coalesce(local_id, number)) is not null;

insert into rapport
select 5, 'cartes sans numéro de tri après', count(*) from public.cards where sort_number is null
union all
select 6, 'dont FR', count(*) from public.cards c join public.sets s on s.id = c.set_id
 where s.language = 'FR' and c.sort_number is null;

select * from rapport order by ordre;

commit;
