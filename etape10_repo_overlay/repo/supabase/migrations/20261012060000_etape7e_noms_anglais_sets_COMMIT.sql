-- =============================================================================
-- Étape 7e : noms anglais des sets (set_translations, langue 'en')
-- Projet : Pkmn-collection — 2026-10-12
--
-- Source : Bulbapedia, « List of Japanese Pokémon Trading Card Game expansions » (CC BY-NC-SA :
-- à citer sur le site). Seules les extensions principales y sont listées avec leur équivalent
-- occidental ; les decks, promos, coffrets et sous-extensions n'y sont pas et restent sans nom anglais.
--
-- Règle (jamais de nom inventé) :
--   - nom OFFICIEL (is_official = true) : le set japonais a un équivalent occidental unique et
--     sans ambiguïté (ex. « Obsidian Flames », « Brilliant Stars ») ;
--   - sinon TRADUCTION LITTÉRALE du nom japonais donnée par Bulbapedia (is_official = false) :
--     sets jumeaux (« Snow Hazard », « Clay Burst »), équivalents partiels (« ⅔ of … »), équivalents
--     ambigus (« Aquapolis » donné à deux sets), sets sans équivalent occidental.
--   - association au set par le nom japonais ; par la date pour les sets sans nom japonais (DP, BW) ;
--     les moitiés de sets jumeaux sans nom japonais sont associées à la main d'après le nom coréen.
--   - les sets KR / TC / SC alignés à un set JP reprennent son nom anglais (source 'aligned').
-- Une ligne 'manual' n'est jamais écrasée.
--
-- À signaler (pas corrigé ici, voir 7a) : la date de XY3 (Rising Fist) est 2014-09-13 dans la base ;
-- Bulbapedia indique 2014-06-14.
--
-- VERSION COMMIT (appliquée).
-- =============================================================================

begin;
set local statement_timeout = '15min';

alter table public.set_translations drop constraint if exists set_translations_source_check;
alter table public.set_translations add constraint set_translations_source_check
  check (source = any (array['import','tcgdex','aligned','manual','bulbapedia']));

create temp table en_names (code text primary key, name text not null, is_official boolean not null, note text) on commit drop;
insert into en_names (code, name, is_official, note) values
  ('PMCG1', 'Base Set', true, 'officiel'),
  ('PMCG2', 'Jungle', true, 'officiel'),
  ('PMCG3', 'Fossil', true, 'officiel'),
  ('PMCG4', 'Team Rocket', true, 'officiel'),
  ('PMCG5', 'Gym Heroes', true, 'officiel'),
  ('PMCG6', 'Gym Challenge', true, 'officiel'),
  ('neo1', 'Neo Genesis', true, 'officiel'),
  ('neo2', 'Neo Discovery', true, 'officiel'),
  ('neo3', 'Neo Revelation', true, 'officiel'),
  ('neo4', 'Neo Destiny', true, 'officiel'),
  ('VS1', 'Pokémon Card★VS', false, 'traduction littérale'),
  ('web1', 'Pokémon Card★web', false, 'traduction littérale'),
  ('E1', 'Expedition Base Set', true, 'officiel'),
  ('E2', 'The Town on No Map', false, 'traduction littérale (équivalent partiel/ambigu : Aquapolis)'),
  ('E3', 'Wind from the Sea', false, 'traduction littérale (équivalent partiel/ambigu : Aquapolis)'),
  ('E4', 'Split Earth', false, 'traduction littérale (équivalent partiel/ambigu : Skyridge)'),
  ('E5', 'Mysterious Mountains', false, 'traduction littérale (équivalent partiel/ambigu : Skyridge)'),
  ('ADV1', 'EX Ruby & Sapphire', true, 'officiel'),
  ('ADV2', 'EX Sandstorm', true, 'officiel'),
  ('ADV3', 'EX Dragon', true, 'officiel'),
  ('ADV5', 'EX Hidden Legends', true, 'officiel'),
  ('PCG1', 'EX FireRed & LeafGreen', true, 'officiel'),
  ('PCG2', 'EX Deoxys', true, 'officiel'),
  ('PCG3', 'EX Team Rocket Returns', true, 'officiel'),
  ('PCG4', 'EX Unseen Forces', true, 'officiel'),
  ('PCG5', 'EX Legend Maker', true, 'officiel'),
  ('PCG6', 'EX Delta Species', true, 'officiel'),
  ('PCG7', 'EX Holon Phantoms', true, 'officiel'),
  ('PCG8', 'EX Crystal Guardians', true, 'officiel'),
  ('PCG9', 'EX Dragon Frontiers', true, 'officiel'),
  ('DP1', 'Diamond & Pearl', true, 'officiel'),
  ('DP2', 'Mysterious Treasures', true, 'officiel'),
  ('DP3', 'Secret Wonders', true, 'officiel'),
  ('DP4', 'Moonlit Pursuit • Dawn Dash', false, 'traduction littérale (équivalent ambigu : Great Encounters / Majestic Dawn)'),
  ('DP5', 'Legends Awakened', true, 'officiel'),
  ('DPs-B', 'Stormfront', true, 'officiel'),
  ('DPt1-B', 'Platinum', true, 'officiel'),
  ('DPt2-B', 'Rising Rivals', true, 'officiel'),
  ('DPt3-B', 'Supreme Victors', true, 'officiel'),
  ('DPt4-B', 'Arceus', true, 'officiel'),
  ('L1a', 'HeartGold Collection', false, 'traduction littérale (équivalent officiel partagé : HeartGold & SoulSilver)'),
  ('L1b', 'SoulSilver Collection', false, 'traduction littérale (équivalent officiel partagé : HeartGold & SoulSilver)'),
  ('L2', 'Undaunted', true, 'officiel'),
  ('L3', 'Triumphant', true, 'officiel'),
  ('BW1-Bb', 'Black Collection', false, 'traduction littérale (équivalent officiel partagé : Black & White)'),
  ('BW1-Bw', 'White Collection', false, 'traduction littérale (équivalent officiel partagé : Black & White)'),
  ('BW2-B', 'Noble Victories', true, 'officiel'),
  ('BW3-Bp', 'Psycho Drive', false, 'traduction littérale (équivalent officiel partagé : Next Destinies)'),
  ('BW3-Bh', 'Hail Blizzard', false, 'traduction littérale (équivalent officiel partagé : Next Destinies)'),
  ('BW4-B', 'Dark Explorers', true, 'officiel'),
  ('BW5-Brz', 'Dragon Blast', false, 'traduction littérale (équivalent officiel partagé : Dragons Exalted)'),
  ('BW5-Brn', 'Dragon Blade', false, 'traduction littérale (équivalent officiel partagé : Dragons Exalted)'),
  ('BW6-Bf', 'Freeze Bolt', false, 'traduction littérale (équivalent officiel partagé : Boundaries Crossed)'),
  ('BW6-Bc', 'Cold Flare', false, 'traduction littérale (équivalent officiel partagé : Boundaries Crossed)'),
  ('BW7-B', 'Plasma Storm', true, 'officiel'),
  ('BW8-Brf', 'Spiral Force', false, 'traduction littérale (équivalent officiel partagé : Plasma Freeze)'),
  ('BW8-Brn', 'Thunder Knuckle', false, 'traduction littérale (équivalent officiel partagé : Plasma Freeze)'),
  ('BW9-B', 'Plasma Blast', true, 'officiel'),
  ('XY1a', 'Collection X', false, 'traduction littérale (équivalent officiel partagé : XY)'),
  ('XY1b', 'Collection Y', false, 'traduction littérale (équivalent officiel partagé : XY)'),
  ('XY2', 'Flashfire', true, 'officiel'),
  ('XY3', 'Furious Fists', true, 'officiel'),
  ('XY4', 'Phantom Forces', true, 'officiel'),
  ('XY5a', 'Gaia Volcano', false, 'traduction littérale (équivalent officiel partagé : Primal Clash)'),
  ('XY5b', 'Tidal Storm', false, 'traduction littérale (équivalent officiel partagé : Primal Clash)'),
  ('SM0', 'Pikachu''s New Friends', false, 'traduction littérale'),
  ('SM1S', 'Collection Sun', false, 'traduction littérale (équivalent officiel partagé : Sun & Moon)'),
  ('SM1M', 'Collection Moon', false, 'traduction littérale (équivalent officiel partagé : Sun & Moon)'),
  ('SM2K', 'Islands Await You', false, 'traduction littérale (équivalent officiel partagé : Guardians Rising)'),
  ('SM2L', 'Alolan Moonlight', false, 'traduction littérale (équivalent officiel partagé : Guardians Rising)'),
  ('SM3H', 'To Have Seen the Battle Rainbow', false, 'traduction littérale (équivalent officiel partagé : Burning Shadows)'),
  ('SM3N', 'Darkness that Consumes Light', false, 'traduction littérale (équivalent officiel partagé : Burning Shadows)'),
  ('SM4S', 'Awakened Heroes', false, 'traduction littérale (équivalent officiel partagé : Crimson Invasion)'),
  ('SM4A', 'Ultradimensional Beasts', false, 'traduction littérale (équivalent officiel partagé : Crimson Invasion)'),
  ('SM5S', 'Ultra Sun', false, 'traduction littérale (équivalent officiel partagé : Ultra Prism)'),
  ('SM5M', 'Ultra Moon', false, 'traduction littérale (équivalent officiel partagé : Ultra Prism)'),
  ('SM6', 'Forbidden Light', true, 'officiel'),
  ('SM7', 'Celestial Storm', true, 'officiel'),
  ('SM8', 'Lost Thunder', true, 'officiel'),
  ('SM9', 'Team Up', true, 'officiel'),
  ('SM10', 'Unbroken Bonds', true, 'officiel'),
  ('SM11', 'Unified Minds', true, 'officiel'),
  ('SM12', 'Cosmic Eclipse', true, 'officiel'),
  ('S1W', 'Sword', false, 'traduction littérale (équivalent officiel partagé : Sword & Shield)'),
  ('S1H', 'Shield', false, 'traduction littérale (équivalent officiel partagé : Sword & Shield)'),
  ('S2', 'Rebel Clash', true, 'officiel'),
  ('S3', 'Darkness Ablaze', true, 'officiel'),
  ('S4', 'Vivid Voltage', true, 'officiel'),
  ('S5I', 'Single Strike Master', false, 'traduction littérale (équivalent officiel partagé : Battle Styles)'),
  ('S5R', 'Rapid Strike Master', false, 'traduction littérale (équivalent officiel partagé : Battle Styles)'),
  ('S6H', 'Silver Lance', false, 'traduction littérale (équivalent officiel partagé : Chilling Reign)'),
  ('S6K', 'Jet-Black Spirit', false, 'traduction littérale (équivalent officiel partagé : Chilling Reign)'),
  ('S7D', 'Skyscraping Perfection', false, 'traduction littérale (équivalent officiel partagé : Evolving Skies)'),
  ('S7R', 'Blue Sky Stream', false, 'traduction littérale (équivalent officiel partagé : Evolving Skies)'),
  ('S8', 'Fusion Strike', true, 'officiel'),
  ('S9', 'Brilliant Stars', true, 'officiel'),
  ('S10D', 'Time Gazer', false, 'traduction littérale (équivalent officiel partagé : Astral Radiance)'),
  ('S10P', 'Space Juggler', false, 'traduction littérale (équivalent officiel partagé : Astral Radiance)'),
  ('S11', 'Lost Origin', true, 'officiel'),
  ('S12', 'Silver Tempest', true, 'officiel'),
  ('SV1S', 'Scarlet ex', false, 'traduction littérale (équivalent officiel partagé : Scarlet & Violet)'),
  ('SV1V', 'Violet ex', false, 'traduction littérale (équivalent officiel partagé : Scarlet & Violet)'),
  ('SV2P', 'Snow Hazard', false, 'traduction littérale (équivalent officiel partagé : ⅔ of Paldea Evolved)'),
  ('SV2D', 'Clay Burst', false, 'traduction littérale (équivalent officiel partagé : ⅔ of Paldea Evolved)'),
  ('SV3', 'Obsidian Flames', true, 'officiel'),
  ('SV4K', 'Ancient Roar', false, 'traduction littérale (équivalent officiel partagé : ⅔ of Paradox Rift)'),
  ('SV4M', 'Future Flash', false, 'traduction littérale (équivalent officiel partagé : ⅔ of Paradox Rift)'),
  ('SV5K', 'Wild Force', false, 'traduction littérale (équivalent officiel partagé : Temporal Forces)'),
  ('SV5M', 'Cyber Judge', false, 'traduction littérale (équivalent officiel partagé : Temporal Forces)'),
  ('SV6', 'Transformation Mask', false, 'traduction littérale (équivalent partiel/ambigu : ⅔ of Twilight Masquerade)'),
  ('SV7', 'Stellar Crown', true, 'officiel'),
  ('SV8', 'Super Electric Breaker', false, 'traduction littérale (équivalent partiel/ambigu : ⅔ of Surging Sparks)'),
  ('SV9', 'Journey Together', true, 'officiel'),
  ('SV10', 'Glory of the Rocket Gang', false, 'traduction littérale (équivalent partiel/ambigu : ⅔ of Destined Rivals)'),
  ('SV11B', 'Black Bolt', false, 'traduction littérale (équivalent officiel partagé : Black Bolt & White Flare)'),
  ('SV11W', 'White Flare', false, 'traduction littérale (équivalent officiel partagé : Black Bolt & White Flare)'),
  ('M1L', 'Mega Brave', false, 'traduction littérale (équivalent officiel partagé : Mega Evolution)'),
  ('M1S', 'Mega Symphonia', false, 'traduction littérale (équivalent officiel partagé : Mega Evolution)'),
  ('M2', 'Phantasmal Flames', true, 'officiel'),
  ('M3', 'Perfect Order', true, 'officiel'),
  ('XY6', 'Roaring Skies', true, 'officiel'),
  ('XY6-B', 'Roaring Skies', true, 'officiel'),
  ('XY7', 'Ancient Origins', true, 'officiel'),
  ('XY7-B', 'Ancient Origins', true, 'officiel');

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'lignes en avant', count(*) from public.set_translations where language = 'en';
insert into rapport select 2, 'codes de la liste introuvables en JP (attendu 0)', count(*)
from en_names e where not exists (select 1 from public.sets s where s.language = 'JP' and s.code = e.code);

-- 1. noms anglais des sets JP (une ligne 'bulbapedia' se met à jour ; manual / aligned ne sont pas touchés)
insert into public.set_translations (set_id, language, name, source, is_official)
select s.id, 'en', e.name, 'bulbapedia', e.is_official
from en_names e join public.sets s on s.language = 'JP' and s.code = e.code
on conflict (set_id, language) do update
  set name = excluded.name, is_official = excluded.is_official
  where public.set_translations.source = 'bulbapedia';

-- 2. apply_set_translations() : ajoute l'héritage du nom anglais JP -> KR / TC / SC alignés
create or replace function public.apply_set_translations()
returns integer language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare n1 integer; n2 integer; n3 integer;
begin
  -- nom propre de chaque set dans sa langue
  insert into set_translations (set_id, language, name, source)
  select s.id,
         case s.language when 'FR' then 'fr' when 'JP' then 'ja' when 'KR' then 'ko'
                         when 'TC' then 'zh-tw' when 'SC' then 'zh-cn' end,
         btrim(s.name), 'import'
  from sets s
  where btrim(s.name) <> '' and s.name <> coalesce(s.code, '')
  on conflict (set_id, language) do nothing;
  get diagnostics n1 = row_count;

  -- sets JP : nom de l'équivalent KR / TC / SC quand il est unique dans la langue
  insert into set_translations (set_id, language, name, source)
  select a.jp_set_id, l.lang, min(btrim(s.name)), 'aligned'
  from set_alignments a
  join sets s on s.id = a.set_id
  join (values ('KR','ko'), ('TC','zh-tw'), ('SC','zh-cn')) as l(language, lang) on l.language = s.language
  join sets jp on jp.id = a.jp_set_id and jp.language = 'JP'
  where btrim(s.name) <> ''
  group by a.jp_set_id, l.lang
  having count(distinct s.id) = 1
  on conflict (set_id, language) do nothing;
  get diagnostics n2 = row_count;

  -- sets KR / TC / SC : nom anglais du set JP aligné (un seul set JP aligné)
  insert into set_translations (set_id, language, name, source, is_official)
  select a.set_id, 'en', t.name, 'aligned', t.is_official
  from set_alignments a
  join sets s on s.id = a.set_id and s.language in ('KR','TC','SC')
  join set_translations t on t.set_id = a.jp_set_id and t.language = 'en'
  where (select count(distinct a2.jp_set_id) from set_alignments a2 where a2.set_id = a.set_id) = 1
  on conflict (set_id, language) do nothing;
  get diagnostics n3 = row_count;

  return n1 + n2 + n3;
end $function$;

select public.apply_set_translations();

insert into rapport select 3, 'lignes en après : ' || source || case when is_official then ' officiel' else ' traduction' end, count(*)
  from public.set_translations where language = 'en' group by source, is_official;
insert into rapport select 4, 'sets JP avec un nom anglais', count(*) from public.sets s
  where s.language = 'JP' and exists (select 1 from public.set_translations t where t.set_id = s.id and t.language = 'en');
insert into rapport select 5, 'sets ' || s.language || ' avec un nom anglais', count(*) from public.sets s
  where s.language in ('KR','TC','SC') and exists (select 1 from public.set_translations t where t.set_id = s.id and t.language = 'en')
  group by s.language;
insert into rapport select 6, 'cartes dans un set sans nom fr ni en (code affiché)', count(*) from public.cards c join public.sets s on s.id = c.set_id
  where not exists (select 1 from public.set_translations t where t.set_id = s.id and t.language in ('fr','en'));

select * from rapport order by ordre, controle;

commit;
