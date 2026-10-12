-- =============================================================================
-- Étape 2c : remplissage des référentiels et des colonnes normalisées
-- Projet : Pkmn-collection — 2026-10-11
-- À exécuter après 2a et 2b.
--
--   1. Illustrateurs : une fiche par illustrateur (graphie la plus fréquente),
--      toutes les graphies rattachées (casse, espaces, virgules, artefacts du
--      scraper coréen)
--   2. Cartes : rarity_code, types_en, sort_number, illustrator_id
--   3. Sets : series_id pour les sets FR (d'après leur série) et les sets JP
--      issus de TCGdex (d'après TCGdex). Les autres sets JP, KR et TC seront
--      rattachés à leur série à l'étape 7 (d'après leurs équivalents JP).
--   4. Contrôles : aucune rareté ni aucun illustrateur brut sans correspondance
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Illustrateurs
-- -----------------------------------------------------------------------------
with raw as (
  select artist, count(*) n from public.cards where artist is not null group by artist
), k as (
  select public.illustrator_key(artist) as key, public.clean_illustrator_name(artist) as nm, sum(n) n
  from raw group by 1, 2
), best as (
  select distinct on (key) key, nm from k where key is not null order by key, n desc, nm
)
insert into public.illustrators (name)
select nm from best
on conflict (name) do nothing;

with k as (
  select public.illustrator_key(artist) as key, public.clean_illustrator_name(artist) as nm, count(*) n
  from public.cards where artist is not null group by 1, 2
), best as (
  select distinct on (key) key, nm from k where key is not null order by key, n desc, nm
)
insert into public.illustrator_aliases (alias_key, illustrator_id)
select b.key, i.id from best b join public.illustrators i on i.name = b.nm
on conflict (alias_key) do nothing;


-- 442 cartes ont un illustrateur vide ('') : on le remet à null
update public.cards set artist = null where artist is not null and btrim(artist) = '';

-- -----------------------------------------------------------------------------
-- 2. Cartes (le déclencheur cards_normalize ne se déclenche pas ici : on ne
--    modifie que les colonnes calculées)
-- -----------------------------------------------------------------------------
update public.cards c set
  rarity_code    = (select a.rarity_code from public.rarity_aliases a where a.raw_value = c.rarity),
  types_en       = public.normalize_types(c.types),
  sort_number    = public.card_sort_number(coalesce(c.local_id, c.number)),
  illustrator_id = (select ia.illustrator_id from public.illustrator_aliases ia
                    where ia.alias_key = public.illustrator_key(c.artist));


-- -----------------------------------------------------------------------------
-- 3. Séries
-- -----------------------------------------------------------------------------
update public.sets s set series_id = x.code
from public.series x
where s.language = 'FR' and s.series = x.name_fr;

update public.sets set series_id = 'ecard' where language = 'FR' and series = 'e-cards';
-- 5 sets FR importés de PTCG-database n'ont pas de série renseignée
update public.sets set series_id = 'neo'
  where language = 'FR' and series is null and code in ('neo1', 'neo2', 'neo3', 'neo4');
update public.sets set series_id = 'platine'
  where language = 'FR' and series is null and code = 'pl4';   -- Arceus

update public.sets s set series_id = v.series_code
from (values
  ('ADV1', 'ex'),
  ('ADV2', 'ex'),
  ('ADV3', 'ex'),
  ('ADV4', 'ex'),
  ('ADV5', 'ex'),
  ('CP1', 'xy'),
  ('CP2', 'xy'),
  ('CP3', 'xy'),
  ('CP4', 'xy'),
  ('CP5', 'xy'),
  ('CP6', 'xy'),
  ('E1', 'ecard'),
  ('E2', 'ecard'),
  ('E3', 'ecard'),
  ('E4', 'ecard'),
  ('E5', 'ecard'),
  ('L1a', 'hgss'),
  ('L1b', 'hgss'),
  ('L2', 'hgss'),
  ('L3', 'hgss'),
  ('LL', 'hgss'),
  ('M-P', 'me'),
  ('M1L', 'me'),
  ('M1S', 'me'),
  ('M2', 'me'),
  ('M2a', 'me'),
  ('M3', 'me'),
  ('M4', 'me'),
  ('M5', 'me'),
  ('M6', 'me'),
  ('M6a', 'me'),
  ('MC', 'me'),
  ('MF', 'me'),
  ('PCG1', 'ex'),
  ('PCG2', 'ex'),
  ('PCG3', 'ex'),
  ('PCG4', 'ex'),
  ('PCG5', 'ex'),
  ('PCG6', 'ex'),
  ('PCG7', 'ex'),
  ('PCG8', 'ex'),
  ('PCG9', 'ex'),
  ('PMCG1', 'base'),
  ('PMCG2', 'base'),
  ('PMCG3', 'base'),
  ('PMCG4', 'base'),
  ('PMCG5', 'base'),
  ('PMCG6', 'base'),
  ('S10D', 'swsh'),
  ('S10P', 'swsh'),
  ('S10a', 'swsh'),
  ('S10b', 'swsh'),
  ('S11', 'swsh'),
  ('S11a', 'swsh'),
  ('S12', 'swsh'),
  ('S12a', 'swsh'),
  ('S1H', 'swsh'),
  ('S1W', 'swsh'),
  ('S1a', 'swsh'),
  ('S2', 'swsh'),
  ('S2a', 'swsh'),
  ('S3', 'swsh'),
  ('S3a', 'swsh'),
  ('S4', 'swsh'),
  ('S4a', 'swsh'),
  ('S5I', 'swsh'),
  ('S5R', 'swsh'),
  ('S5a', 'swsh'),
  ('S6H', 'swsh'),
  ('S6K', 'swsh'),
  ('S6a', 'swsh'),
  ('S7D', 'swsh'),
  ('S7R', 'swsh'),
  ('S8', 'swsh'),
  ('S8a', 'swsh'),
  ('S8b', 'swsh'),
  ('S9', 'swsh'),
  ('S9a', 'swsh'),
  ('SM0', 'sm'),
  ('SM10', 'sm'),
  ('SM10a', 'sm'),
  ('SM10b', 'sm'),
  ('SM11', 'sm'),
  ('SM11a', 'sm'),
  ('SM11b', 'sm'),
  ('SM12', 'sm'),
  ('SM12a', 'sm'),
  ('SM1M', 'sm'),
  ('SM1S', 'sm'),
  ('SM1p', 'sm'),
  ('SM2K', 'sm'),
  ('SM2L', 'sm'),
  ('SM2p', 'sm'),
  ('SM3H', 'sm'),
  ('SM3N', 'sm'),
  ('SM3p', 'sm'),
  ('SM4A', 'sm'),
  ('SM4S', 'sm'),
  ('SM4p', 'sm'),
  ('SM5M', 'sm'),
  ('SM5S', 'sm'),
  ('SM5p', 'sm'),
  ('SM6', 'sm'),
  ('SM6a', 'sm'),
  ('SM6b', 'sm'),
  ('SM7', 'sm'),
  ('SM7a', 'sm'),
  ('SM7b', 'sm'),
  ('SM8', 'sm'),
  ('SM8a', 'sm'),
  ('SM8b', 'sm'),
  ('SM9', 'sm'),
  ('SM9a', 'sm'),
  ('SM9b', 'sm'),
  ('SMP2', 'sm'),
  ('SV-P', 'sv'),
  ('SV10', 'sv'),
  ('SV11B', 'sv'),
  ('SV11W', 'sv'),
  ('SV1S', 'sv'),
  ('SV1V', 'sv'),
  ('SV1a', 'sv'),
  ('SV2D', 'sv'),
  ('SV2P', 'sv'),
  ('SV2a', 'sv'),
  ('SV3', 'sv'),
  ('SV3a', 'sv'),
  ('SV4K', 'sv'),
  ('SV4M', 'sv'),
  ('SV4a', 'sv'),
  ('SV5K', 'sv'),
  ('SV5M', 'sv'),
  ('SV5a', 'sv'),
  ('SV6', 'sv'),
  ('SV6a', 'sv'),
  ('SV7', 'sv'),
  ('SV7a', 'sv'),
  ('SV8', 'sv'),
  ('SV8a', 'sv'),
  ('SV9', 'sv'),
  ('SV9a', 'sv'),
  ('SVK', 'sv'),
  ('SVLN', 'sv'),
  ('SVLS', 'sv'),
  ('VS1', 'ecard'),
  ('XY10', 'xy'),
  ('XY11a', 'xy'),
  ('XY11b', 'xy'),
  ('XY1a', 'xy'),
  ('XY1b', 'xy'),
  ('XY2', 'xy'),
  ('XY3', 'xy'),
  ('XY4', 'xy'),
  ('XY5a', 'xy'),
  ('XY5b', 'xy'),
  ('XY6', 'xy'),
  ('XY7', 'xy'),
  ('XY8a', 'xy'),
  ('XY8b', 'xy'),
  ('XY9', 'xy'),
  ('neo1', 'neo'),
  ('neo2', 'neo'),
  ('neo3', 'neo'),
  ('neo4', 'neo'),
  ('web1', 'ecard')
) as v(code, series_code)
where s.language = 'JP' and s.source = 'tcgdex' and s.code = v.code;


-- -----------------------------------------------------------------------------
-- 4. Contrôles
-- -----------------------------------------------------------------------------
do $$
declare
  rar_raw text; n_rar int; n_art int; n_fr_sets int; n_jp_sets int; n_ill int;
begin
  select count(*), string_agg(distinct rarity, ' | ') into n_rar, rar_raw
    from public.cards where rarity is not null and rarity_code is null;
  if n_rar > 0 then
    raise exception 'Raretés brutes sans correspondance (% cartes) : %', n_rar, rar_raw;
  end if;

  select count(*) into n_art from public.cards
   where public.illustrator_key(artist) is not null and illustrator_id is null;
  if n_art > 0 then
    raise exception '% cartes ont un illustrateur brut sans fiche illustrateur.', n_art;
  end if;

  select count(*) into n_fr_sets from public.sets where language = 'FR' and series_id is null;
  if n_fr_sets > 0 then
    raise exception '% sets FR sans série.', n_fr_sets;
  end if;

  select count(*) into n_jp_sets from public.sets where language = 'JP' and source = 'tcgdex' and series_id is null;
  if n_jp_sets > 0 then
    raise exception '% sets JP TCGdex sans série.', n_jp_sets;
  end if;

  select count(*) into n_ill from public.illustrators;
  raise notice 'Illustrateurs créés : %', n_ill;
end $$;

commit;
