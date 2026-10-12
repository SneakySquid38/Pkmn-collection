-- =============================================================================
-- Étape 7f : noms anglais des sous-extensions et promos JP (complément de 7e)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Source : Bulbapedia, wikitexte de « List of Japanese Pokémon Trading Card Game expansions »
-- (CC BY-NC-SA). Tableaux Concept Packs, Enhanced / High Class Expansion Packs, sous-extensions
-- et promos. Association par le CODE du set (déduit du nom du fichier de logo, ex. « SV1a Triplet
-- Beat Logo.png »), plus fiable que le nom ou la date.
-- Même règle qu'en 7e : nom OFFICIEL quand l'équivalent occidental est unique et complet
-- (ex. « Crown Zenith », « Paldean Fates »), sinon TRADUCTION LITTÉRALE (is_official = false) :
-- équivalent partiel (« Part of … », « ⅓ of … »), sans équivalent, promos.
-- Les decks, starters, coffrets et boîtes n'ont aucun tableau sur cette page : ils restent en nom généré.
-- Une ligne 'manual' n'est jamais écrasée. Les sets KR / TC alignés reprennent le nom (apply_set_translations).
-- À contrôler : les codes de promos SMP, LP, DPP, DPtP, BWP, XYP supposent que nos sets portent bien
-- ces promos ; le rapport liste le nombre de cartes de chacun.
--
-- VERSION COMMIT.
-- =============================================================================

begin;
set local statement_timeout = '15min';

create temp table en_names (code text primary key, name text not null, is_official boolean not null, note text) on commit drop;
insert into en_names (code, name, is_official, note) values
  ('DS', 'Dragon Vault', true, 'Dragon Selection'),
  ('SC', 'Shiny Collection', false, 'équivalent partiel (Radiant Collection de Legendary Treasures)'),
  ('BW10-B', 'Legendary Treasures', true, 'EX Battle Boost'),
  ('CP1', 'Double Crisis', true, 'Magma Gang VS Aqua Gang: Double Crisis'),
  ('CP2', 'Legendary Shine Collection', false, 'équivalent partiel'),
  ('CP3', 'PokéKyun Collection', false, 'équivalent partiel'),
  ('CP4', 'Premium Champion Pack EX×M×BREAK', false, 'sans équivalent'),
  ('CP5', 'Mythical & Legendary Dream Shine Collection', false, 'sans équivalent'),
  ('CP6', 'Evolutions', true, 'Expansion Pack 20th Anniversary'),
  ('XY', 'The Best of XY', false, 'sans équivalent'),
  ('SM1p', 'Sun & Moon (Enhanced Expansion Pack)', false, 'équivalent partiel'),
  ('SM2p', 'Facing a New Trial', false, 'équivalent partiel'),
  ('SM3p', 'Shining Legends', true, ''),
  ('SM4p', 'GX Battle Boost', false, 'équivalent partiel'),
  ('SM5p', 'Ultra Force', false, 'équivalent partiel'),
  ('SM6a', 'Dragon Majesty', true, 'Dragon Storm'),
  ('SM6b', 'Champion Road', false, 'équivalent partiel'),
  ('SM7a', 'Thunderclap Spark', false, 'équivalent partiel'),
  ('SM7b', 'Fairy Rise', false, 'équivalent partiel'),
  ('SM8a', 'Dark Order', false, 'équivalent partiel'),
  ('SM8b', 'GX Ultra Shiny', false, 'équivalent partiel (Shiny Vault de Hidden Fates)'),
  ('SM9a', 'Night Unison', false, 'équivalent partiel'),
  ('SM9b', 'Full Metal Wall', false, 'équivalent partiel'),
  ('SM10a', 'GG End', false, 'équivalent partiel'),
  ('SM10b', 'Sky Legend', false, 'équivalent partiel'),
  ('SM11a', 'Remix Bout', false, 'équivalent partiel'),
  ('SM11b', 'Dream League', false, 'équivalent partiel'),
  ('SM12a', 'TAG TEAM GX: Tag All Stars', false, 'sans équivalent'),
  ('S1a', 'VMAX Rising', false, 'équivalent partiel'),
  ('S2a', 'Explosive Walker', false, 'équivalent partiel'),
  ('S3a', 'Legendary Heartbeat', false, 'équivalent partiel'),
  ('S4a', 'Shining Fates', true, 'Shiny Star V'),
  ('S5a', 'Peerless Fighters', false, 'équivalent partiel'),
  ('S6a', 'Eevee Heroes', false, 'équivalent partiel'),
  ('S8a', 'Celebrations', true, '25th Anniversary Collection'),
  ('S8b', 'VMAX Climax', false, 'équivalent partiel (Trainer Galleries)'),
  ('S9a', 'Battle Region', false, 'équivalent partiel'),
  ('S10a', 'Dark Phantasma', false, 'équivalent partiel'),
  ('S10b', 'Pokémon GO', true, ''),
  ('S11a', 'Incandescent Arcana', false, 'équivalent partiel'),
  ('S12a', 'Crown Zenith', true, 'VSTAR Universe'),
  ('SV1a', 'Triplet Beat', false, 'équivalent partiel'),
  ('SV2a', '151', true, 'Pokémon Card 151'),
  ('SV3a', 'Raging Surf', false, 'équivalent partiel'),
  ('SV4a', 'Paldean Fates', true, 'Shiny Treasure ex'),
  ('SV5a', 'Crimson Haze', false, 'équivalent partiel'),
  ('SV6a', 'Shrouded Fable', true, 'Night Wanderer'),
  ('SV7a', 'Paradise Dragona', false, 'équivalent partiel'),
  ('SV8a', 'Prismatic Evolutions', true, 'Terastal Fest ex'),
  ('SV9a', 'Hot Wind Arena', false, 'équivalent partiel'),
  ('M2a', 'Ascended Heroes', true, 'MEGA Dream ex'),
  ('M6a', '30th Celebration', true, ''),
  ('LL', 'Lost Link', false, 'sans équivalent'),
  ('ADV4', 'EX Team Magma vs Team Aqua', true, 'Magma VS Aqua: Two Ambitions'),
  ('S-P', 'S-P Promotional cards', false, 'promos'),
  ('SV-P', 'SV-P Promotional cards', false, 'promos'),
  ('M-P', 'M-P Promotional cards', false, 'promos'),
  ('SMP', 'SM-P Promotional cards', false, 'promos'),
  ('XYP', 'XY-P Promotional cards', false, 'promos'),
  ('BWP', 'BW-P Promotional cards', false, 'promos'),
  ('DPtP', 'DPt-P Promotional cards', false, 'promos'),
  ('DPP', 'DP-P Promotional cards', false, 'promos'),
  ('LP', 'L-P Promotional cards', false, 'promos'),
  ('SMP2', 'Movie Special Pack Great Detective Pikachu', false, 'promo'),
  ('S8a-P', 'Promo Card Pack 25th Anniversary Edition', false, 'promo');

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'lignes en avant', count(*) from public.set_translations where language = 'en';
insert into rapport select 2, 'codes de la liste introuvables en JP (attendu 0) : ' || e.code, 1
from en_names e where not exists (select 1 from public.sets s where s.language = 'JP' and s.code = e.code);
insert into rapport select 3, 'sets JP de la liste qui ont déjà un nom en (conservé si manual)', count(*)
from en_names e join public.sets s on s.language = 'JP' and s.code = e.code
join public.set_translations t on t.set_id = s.id and t.language = 'en';

insert into public.set_translations (set_id, language, name, source, is_official)
select s.id, 'en', e.name, 'bulbapedia', e.is_official
from en_names e join public.sets s on s.language = 'JP' and s.code = e.code
on conflict (set_id, language) do update
  set name = excluded.name, is_official = excluded.is_official
  where public.set_translations.source = 'bulbapedia';

select public.apply_set_translations();

insert into rapport select 4, 'lignes en après : ' || source || case when is_official then ' officiel' else ' traduction' end, count(*)
  from public.set_translations where language = 'en' group by source, is_official;
insert into rapport select 5, 'sets ' || s.language || ' avec un nom anglais', count(*) from public.sets s
  where s.language in ('JP','KR','TC','SC') and exists (select 1 from public.set_translations t where t.set_id = s.id and t.language = 'en')
  group by s.language;
insert into rapport select 6, 'promos : ' || e.code || ' (' || e.name || ')', count(c.id)
from en_names e join public.sets s on s.language = 'JP' and s.code = e.code left join public.cards c on c.set_id = s.id
where e.note like 'promo%' group by e.code, e.name;
insert into rapport select 7, 'sets affichés en nom généré (restants)', count(*) from public.sets_display where display_source = 'genere';

select * from rapport order by ordre, controle;

commit;
