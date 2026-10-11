-- =============================================================================
-- Étape 2a : référentiels communs (structure + vocabulaires)
-- Projet : Pkmn-collection — 2026-10-11
--
-- Crée :
--   - rarities / rarity_aliases : une rareté commune à toutes les langues, et la
--     correspondance de chaque valeur brute des sources (FR, JP, KR, TCGdex)
--   - energy_types : les 11 types en vocabulaire commun
--   - illustrators / illustrator_aliases : un illustrateur, toutes ses graphies
--   - series : les ères (Base … Méga-Évolution) avec leur nom français
--   - pokemon_entities : colonnes de noms en/ja/ko/zh_hant/zh_hans (remplies en 2b)
--   - cards : rarity_code, illustrator_id, types_en, sort_number
--   - sets : series_id
--   - un déclencheur qui remplit automatiquement ces colonnes à chaque import
--     ou modification de carte (quel que soit le script d'import)
--
-- Ne modifie aucune carte existante : le remplissage est fait en 2c.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Raretés
-- -----------------------------------------------------------------------------
create table public.rarities (
  code       text primary key,
  label_fr   text not null,
  sort_order smallint not null,
  family     text not null check (family in ('base', 'speciale', 'promo', 'aucune'))
);

insert into public.rarities (code, label_fr, sort_order, family) values
  ('none',                      'Sans symbole',               0,   'aucune'),
  ('common',                    'Commune',                    10,  'base'),
  ('uncommon',                  'Peu commune',                20,  'base'),
  ('rare',                      'Rare',                       30,  'base'),
  ('holo_rare',                 'Rare holo',                  35,  'base'),
  ('double_rare',               'Double rare',                40,  'base'),
  ('triple_rare',               'Triple rare',                45,  'base'),
  ('lv_x',                      'Rare holo NIV.X',            46,  'speciale'),
  ('prime',                     'Rare Prime',                 47,  'speciale'),
  ('legend',                    'LÉGENDE',                    48,  'speciale'),
  ('prism_star',                'Prisme Étoile',              49,  'speciale'),
  ('shining',                   'Brillant',                   50,  'speciale'),
  ('radiant_rare',              'Radieux',                    51,  'speciale'),
  ('amazing_rare',              'Magnifique',                 52,  'speciale'),
  ('ace_spec',                  'ACE SPEC',                   53,  'speciale'),
  ('ultra_rare',                'Ultra rare',                 60,  'speciale'),
  ('mega_attack_rare',          'Méga attaque rare',          62,  'speciale'),
  ('character_rare',            'Personnage rare',            64,  'speciale'),
  ('character_super_rare',      'Personnage super rare',      66,  'speciale'),
  ('illustration_rare',         'Illustration rare',          70,  'speciale'),
  ('special_illustration_rare', 'Illustration spéciale rare', 75,  'speciale'),
  ('shiny_rare',                'Chromatique rare',           80,  'speciale'),
  ('shiny_ultra_rare',          'Chromatique ultra rare',     82,  'speciale'),
  ('secret_rare',               'Rare secrète',               85,  'speciale'),
  ('hyper_rare',                'Hyper rare',                 88,  'speciale'),
  ('mega_hyper_rare',           'Méga hyper rare',            90,  'speciale'),
  ('black_white_rare',          'Rare noir & blanc',          92,  'speciale'),
  ('special_rare',              'Rare spéciale',              94,  'speciale'),
  ('classic_collection',        'Collection classique',       96,  'speciale'),
  ('promo',                     'Promo',                      100, 'promo');

-- Valeur brute (telle qu'écrite par la source) -> rareté commune
create table public.rarity_aliases (
  raw_value   text primary key,
  rarity_code text not null references public.rarities (code),
  note        text
);

insert into public.rarity_aliases (raw_value, rarity_code, note) values
  -- FR (TCGdex / PTCG-database)
  ('Sans Rareté',                'none',                      null),
  ('Commune',                    'common',                    null),
  ('Peu Commune',                'uncommon',                  null),
  ('Rare',                       'rare',                      'FR et TCGdex JP'),
  ('Holo Rare',                  'holo_rare',                 'FR et TCGdex JP'),
  ('Rare Holo',                  'holo_rare',                 'FR et TCGdex JP'),
  ('Double rare',                'double_rare',               'FR et TCGdex JP'),
  ('Holo Rare V',                'double_rare',               'V = RR au Japon'),
  ('Holo Rare VMAX',             'triple_rare',               'VMAX = RRR au Japon'),
  ('Holo Rare VSTAR',            'triple_rare',               'VSTAR = RRR au Japon'),
  ('Rare Holo LV.X',             'lv_x',                      null),
  ('Rare Prime',                 'prime',                     null),
  ('LÉGENDE',                    'legend',                    null),
  ('Radieux Rare',               'radiant_rare',              null),
  ('Magnifique',                 'amazing_rare',              'Amazing Rare (Épée et Bouclier)'),
  ('Magnifique rare',            'secret_rare',               'TCGdex FR nomme ainsi les rares secrètes (arc-en-ciel, gold) SL/EB'),
  ('HIGH-TECH rare',             'ace_spec',                  'TCGdex FR nomme ainsi les ACE SPEC'),
  ('Ultra Rare',                 'ultra_rare',                'FR et TCGdex JP'),
  ('Dresseur Full Art',          'ultra_rare',                null),
  ('Mega Attack Rare',           'mega_attack_rare',          null),
  ('Illustration rare',          'illustration_rare',         'FR et TCGdex JP'),
  ('Illustration spéciale rare', 'special_illustration_rare', null),
  ('Shiny rare',                 'shiny_rare',                'FR et TCGdex JP'),
  ('Shiny rare V',               'shiny_rare',                null),
  ('Shiny rare VMAX',            'shiny_rare',                null),
  ('Chromatique ultra rare',     'shiny_ultra_rare',          null),
  ('Hyper rare',                 'hyper_rare',                'FR et TCGdex JP'),
  ('Méga Hyper Rare',            'mega_hyper_rare',           null),
  ('Rare Noir Blanc',            'black_white_rare',          null),
  ('Pikachu Rare',               'special_rare',              '30e anniversaire'),
  ('RGB Rare',                   'special_rare',              'FR et TCGdex JP'),
  ('Futuristic Rare',            'special_rare',              'FR et TCGdex JP'),
  ('Collection Classique',       'classic_collection',        null),
  ('Promo',                      'promo',                     'FR et TCGdex JP'),
  -- JP (TCGdex, vocabulaire anglais)
  ('None',                       'none',                      null),
  ('Common',                     'common',                    null),
  ('Uncommon',                   'uncommon',                  null),
  ('Triple Rare',                'triple_rare',               null),
  ('Secret Rare',                'secret_rare',               null),
  ('Special illustration rare',  'special_illustration_rare', null),
  ('Mega Hyper Rare',            'mega_hyper_rare',           null),
  ('Character Rare',             'character_rare',            null),
  ('Character Super Rare',       'character_super_rare',      null),
  ('Classic Collection',         'classic_collection',        null),
  ('ACE SPEC Rare',              'ace_spec',                  null),
  ('Radiant Rare',               'radiant_rare',              null),
  ('Shiny Ultra Rare',           'shiny_ultra_rare',          null),
  ('Black White Rare',           'black_white_rare',          null),
  -- JP (PTCG-database, codes du site officiel)
  ('rare_c',                     'common',                    null),
  ('rare_c_c',                   'common',                    null),
  ('rare_c2',                    'common',                    null),
  ('rare_u',                     'uncommon',                  null),
  ('rare_u_c',                   'uncommon',                  null),
  ('rare_u2',                    'uncommon',                  null),
  ('rare_r',                     'rare',                      null),
  ('rare_r_c',                   'rare',                      null),
  ('rare_s',                     'holo_rare',                 'R☆ de l''ère DP/HGSS (holo)'),
  ('rare_ss',                    'legend',                    'LEGEND et ☆ (ère HGSS)'),
  ('rare_rr',                    'double_rare',               null),
  ('rare_sr_c',                  'ultra_rare',                'SR'),
  ('rare_ma',                    'mega_attack_rare',          null),
  ('rare_ar',                    'illustration_rare',         'AR'),
  ('rare_sar',                   'special_illustration_rare', 'SAR'),
  ('rare_chr',                   'character_rare',            'CHR'),
  ('rare_csr',                   'character_super_rare',      'CSR'),
  ('rare_s_2',                   'shiny_rare',                'S (chromatique, S4a/SV4a)'),
  ('rare_ssr',                   'shiny_ultra_rare',          'SSR'),
  ('rare_hr',                    'secret_rare',               'HR (arc-en-ciel)'),
  ('rare_ur_c',                  'hyper_rare',                'UR (gold)'),
  ('rare_MUR',                   'mega_hyper_rare',           'MUR'),
  -- KR (PTCG-database, sigles imprimés)
  ('C',                          'common',                    null),
  ('U',                          'uncommon',                  null),
  ('R',                          'rare',                      null),
  ('H',                          'holo_rare',                 'boosters coréens BS'),
  ('RR',                         'double_rare',               null),
  ('RRR',                        'triple_rare',               null),
  ('PR',                         'prism_star',                'Prisme Étoile (프리즘스타)'),
  ('(빛)',                       'shining',                   'Brillant'),
  ('K',                          'radiant_rare',              null),
  ('A',                          'amazing_rare',              null),
  ('ACE',                        'ace_spec',                  null),
  ('SR',                         'ultra_rare',                null),
  ('TR',                         'ultra_rare',                'Dresseur rare (SL)'),
  ('MA',                         'mega_attack_rare',          null),
  ('CHR',                        'character_rare',            null),
  ('CSR',                        'character_super_rare',      null),
  ('AR',                         'illustration_rare',         null),
  ('SAR',                        'special_illustration_rare', null),
  ('S',                          'shiny_rare',                null),
  ('SSR',                        'shiny_ultra_rare',          null),
  ('HR',                         'secret_rare',               null),
  ('UR',                         'hyper_rare',                null),
  ('MUR',                        'mega_hyper_rare',           null),
  ('BWR',                        'black_white_rare',          null),
  ('P',                          'promo',                     null);


-- -----------------------------------------------------------------------------
-- 2. Types d'énergie
-- -----------------------------------------------------------------------------
create table public.energy_types (
  code       text primary key,
  label_fr   text not null,
  sort_order smallint not null
);

insert into public.energy_types (code, label_fr, sort_order) values
  ('grass', 'Plante', 1), ('fire', 'Feu', 2), ('water', 'Eau', 3),
  ('lightning', 'Électrique', 4), ('psychic', 'Psy', 5), ('fighting', 'Combat', 6),
  ('darkness', 'Obscurité', 7), ('metal', 'Métal', 8), ('fairy', 'Fée', 9),
  ('dragon', 'Dragon', 10), ('colorless', 'Incolore', 11);

-- Liste de types brute (jsonb, toutes langues) -> codes communs
create or replace function public.normalize_types(raw jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when raw is null or jsonb_typeof(raw) <> 'array' then null else
    array(
      select distinct on (code) code from (
        select ord, case lower(t)
          when 'plante' then 'grass'      when 'grass' then 'grass'
          when 'feu' then 'fire'          when 'fire' then 'fire'
          when 'eau' then 'water'         when 'water' then 'water'
          when 'électrique' then 'lightning' when 'electric' then 'lightning' when 'lightning' then 'lightning'
          when 'psy' then 'psychic'       when 'psychic' then 'psychic'
          when 'combat' then 'fighting'   when 'fighting' then 'fighting'
          when 'obscurité' then 'darkness' when 'dark' then 'darkness' when 'darkness' then 'darkness'
          when 'métal' then 'metal'       when 'steel' then 'metal' when 'metal' then 'metal'
          when 'fée' then 'fairy'         when 'fairy' then 'fairy'
          when 'dragon' then 'dragon'
          when 'incolore' then 'colorless' when 'colorless' then 'colorless'
        end as code
        from jsonb_array_elements_text(raw) with ordinality as x(t, ord)
      ) y where code is not null
      order by code, ord
    )
  end
$$;


-- -----------------------------------------------------------------------------
-- 3. Illustrateurs
-- -----------------------------------------------------------------------------
create table public.illustrators (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Clé de rapprochement (minuscules, sans espaces ni ponctuation) -> illustrateur.
-- Plusieurs clés peuvent pointer vers le même illustrateur (fusion manuelle).
create table public.illustrator_aliases (
  alias_key      text primary key,
  illustrator_id uuid not null references public.illustrators (id) on delete cascade
);
create index illustrator_aliases_illustrator_idx on public.illustrator_aliases (illustrator_id);

-- Réparation des artefacts du scraper coréen (« Him기본 에너지o » = Himeno, etc.)
create or replace function public.clean_illustrator_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
           replace(replace(replace(raw, '기본 포켓몬 에너지', 'en'), '기본 에너지', 'en'), '스타디움', 'st'),
           '[[:space:]　]+', ' ', 'g')), '')
$$;

create or replace function public.illustrator_key(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(public.clean_illustrator_name(raw)), '[[:space:][:punct:]　]', '', 'g'), '')
$$;

-- Renvoie l'illustrateur d'une graphie, en le créant s'il est inconnu
create or replace function public.illustrator_for(raw text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  k  text := public.illustrator_key(raw);
  nm text := public.clean_illustrator_name(raw);
  result uuid;
begin
  if k is null then
    return null;
  end if;
  select illustrator_id into result from public.illustrator_aliases where alias_key = k;
  if result is null then
    insert into public.illustrators (name) values (nm)
      on conflict (name) do update set name = excluded.name
      returning id into result;
    insert into public.illustrator_aliases (alias_key, illustrator_id) values (k, result)
      on conflict (alias_key) do nothing;
    select illustrator_id into result from public.illustrator_aliases where alias_key = k;
  end if;
  return result;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Séries (ères)
-- -----------------------------------------------------------------------------
create table public.series (
  code       text primary key,
  name_fr    text not null unique,
  sort_order smallint not null
);

insert into public.series (code, name_fr, sort_order) values
  ('base',     'Base',                    10),
  ('neo',      'Neo',                     20),
  ('ecard',    'e-Card',                  30),
  ('ex',       'EX',                      40),
  ('dp',       'Diamant & Perle',         50),
  ('platine',  'Platine',                 60),
  ('hgss',     'HeartGold SoulSilver',    70),
  ('col',      'L''appel des Légendes',   75),
  ('bw',       'Noir & Blanc',            80),
  ('xy',       'XY',                      90),
  ('sm',       'Soleil et Lune',          100),
  ('swsh',     'Épée et Bouclier',        110),
  ('sv',       'Écarlate et Violet',      120),
  ('me',       'Méga-Évolution',          130),
  ('pop',      'POP',                     200),
  ('tk',       'Kits du dresseur',        210),
  ('mcd',      'Collection McDonald''s',  220),
  ('autre',    'Autre',                   900);

alter table public.sets add column series_id text references public.series (code);
create index sets_series_idx on public.sets (series_id);


-- -----------------------------------------------------------------------------
-- 5. Noms des espèces dans toutes les langues (remplis en 2b)
-- -----------------------------------------------------------------------------
alter table public.pokemon_entities
  add column name_en      text,
  add column name_ja      text,
  add column name_ko      text,
  add column name_zh_hant text,
  add column name_zh_hans text;


-- -----------------------------------------------------------------------------
-- 6. Colonnes normalisées sur les cartes
-- -----------------------------------------------------------------------------
alter table public.cards
  add column rarity_code    text references public.rarities (code),
  add column illustrator_id uuid references public.illustrators (id),
  add column types_en       text[],
  add column sort_number    integer;

create index cards_rarity_code_idx    on public.cards (rarity_code);
create index cards_illustrator_idx    on public.cards (illustrator_id);
create index cards_set_sort_idx       on public.cards (set_id, sort_number);

-- Numéro numérique pour trier : premier groupe de chiffres du numéro imprimé.
-- Les identifiants de secours de l'import (« JP-DP1-1013 ») ne sont pas des numéros.
create or replace function public.card_sort_number(num text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when num is null or num ~ '^(JP|KR|TC|SC)-' then null
    when substring(num from '[0-9]+') is null or length(substring(num from '[0-9]+')) > 6 then null
    else substring(num from '[0-9]+')::integer
  end
$$;


-- -----------------------------------------------------------------------------
-- 7. Déclencheur : chaque carte insérée ou modifiée est normalisée
-- -----------------------------------------------------------------------------
create or replace function public.cards_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rarity_code    := (select a.rarity_code from public.rarity_aliases a where a.raw_value = new.rarity);
  new.types_en       := public.normalize_types(new.types);
  new.sort_number    := public.card_sort_number(coalesce(new.local_id, new.number));
  new.illustrator_id := case when new.artist is null then null else public.illustrator_for(new.artist) end;
  return new;
end;
$$;

create trigger cards_normalize
  before insert or update of rarity, types, local_id, number, artist on public.cards
  for each row execute function public.cards_normalize();


-- -----------------------------------------------------------------------------
-- 8. Sécurité : lecture publique des référentiels, écriture par les scripts
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rarities', 'rarity_aliases', 'energy_types', 'illustrators',
                           'illustrator_aliases', 'series']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy "Lecture publique" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

commit;
