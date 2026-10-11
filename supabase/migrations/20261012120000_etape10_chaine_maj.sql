-- =============================================================================
-- Étape 10 : chaîne de mise à jour côté base (fonctions rejouables après chaque import)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Après un import (script `scripts/update.ts`), la base doit remettre ses données dérivées à jour.
-- Les opérations des étapes 4, 6 et 7 sont reprises ici en fonctions IDEMPOTENTES : relancées sans
-- nouvelle donnée, elles ne modifient rien (c'est ce que vérifie le dry-run ci-dessous).
--
--   apply_asia_families()        étape 4a : alignement des nouveaux sets KR / TC / SC sur un set JP,
--                                familles JP, rattachement des cartes KR / TC / SC (même numéro + même
--                                Pokédex / illustrateur), familles individuelles, rareté de famille.
--                                Les cartes restées seules sont retentées (une carte JP arrivée après
--                                coup peut enfin être reconnue). NON couvert : l'empreinte d'image (4b),
--                                qui reste une opération ponctuelle : une carte sans équivalent par numéro
--                                reste autonome.
--   apply_inherited_rarities()   étape 4c : rareté héritée de l'ancre JP (KR / TC / SC), de la copie
--                                TCGdex (JP), ★ chinois = rare ; toujours marquée rarity_inferred.
--   apply_search_names(p_all)    étape 6a / 6b : nom de recherche français (FR officiel, Énergies de base,
--                                noms générés des cartes asiatiques). p_all = false : cartes sans nom
--                                seulement ; true : tout recalculer (après modification des dictionnaires).
--   data_controls()              étape 9 : les 21 contrôles.
--   run_post_import(p_full)      enchaîne dans l'ordre : dates, séries, noms de sets, familles, raretés,
--                                noms de recherche, texte de recherche, contrôles ; journal dans sync_runs.
-- Toutes ces fonctions sont fermées à anon / authenticated (service_role et SQL Editor seulement).
-- apply_set_calendar / apply_set_series / apply_set_translations / refresh_search_text existent déjà.
--
-- DRY-RUN PAR DÉFAUT : la dernière ligne est « rollback ». Pour appliquer, remplace-la par « commit ».
-- =============================================================================

begin;
set local statement_timeout = '15min';

-- -----------------------------------------------------------------------------
-- 1. Familles asiatiques (étape 4a, rejouable)
-- -----------------------------------------------------------------------------
create or replace function public.apply_asia_families()
returns table (etape text, n integer)
language plpgsql
set search_path = public, extensions, pg_temp
set statement_timeout = '15min'
as $fn$
#variable_conflict use_column
declare k integer;
begin
  drop table if exists w_cards;
  drop table if exists w_cand;
  drop table if exists w_match;

  create temp table w_cards on commit drop as
  select c.id, c.set_id, s.language, s.code, c.sort_number as n, c.category, c.illustrator_id, c.name,
         coalesce(c.variant_type, '') = 'alt_print' as is_alt,
         (select array_agg(p.dex_id order by p.dex_id)
            from card_pokemon cp join pokemon_entities p on p.id = cp.pokemon_entity_id
           where cp.card_id = c.id) as dex
  from cards c join sets s on s.id = c.set_id
  where s.language in ('JP', 'KR', 'TC', 'SC');
  create index on w_cards (set_id, n);

  -- 1. alignement des sets KR / TC / SC pas encore alignés
  with jp as (select * from w_cards where language = 'JP' and not is_alt and n is not null),
  oth as (select * from w_cards where language <> 'JP' and not is_alt and n is not null
          and not exists (select 1 from set_alignments a where a.set_id = w_cards.set_id)),
  tot as (select set_id, count(*) filter (where category = 'Pokémon') as t from oth group by 1),
  pairs as (
    select o.set_id as oset, j.set_id as jset, count(distinct o.id) as m
    from oth o join jp j on j.n = o.n and j.category = 'Pokémon' and o.category = 'Pokémon' and o.dex = j.dex
    group by 1, 2
  ),
  best as (select distinct on (oset) oset, jset, m from pairs order by oset, m desc),
  second as (select p.oset, max(p.m) as m2 from pairs p join best b on b.oset = p.oset and p.jset <> b.jset group by 1),
  by_code as (
    select distinct on (os.id) os.id as oset, js.id as jset
    from sets os
    join sets js on js.language = 'JP'
     and (regexp_replace(lower(os.code), '[^a-z0-9]', '', 'g') = regexp_replace(lower(js.code), '[^a-z0-9]', '', 'g')
       or regexp_replace(lower(os.code), '[^a-z0-9]', '', 'g') = regexp_replace(lower(js.code), '[^a-z0-9]', '', 'g') || 'f')
    where os.language in ('KR', 'TC', 'SC') and exists (select 1 from tot where tot.set_id = os.id)
    order by os.id, (select count(*) from cards c where c.set_id = js.id) desc
  )
  insert into set_alignments (set_id, jp_set_id, matched, total, method)
  select t.set_id, coalesce(bc.jset, b.jset), coalesce(b.m, 0), t.t,
         case when bc.jset is not null then 'code' else 'preuve' end
  from tot t
  left join best b on b.oset = t.set_id
  left join second s2 on s2.oset = t.set_id
  left join by_code bc on bc.oset = t.set_id
  where (bc.jset is not null and (t.t = 0 or (b.jset = bc.jset and b.m::numeric / t.t >= 0.3)))
     or (bc.jset is null and t.t >= 5 and b.m::numeric / t.t >= 0.8 and coalesce(s2.m2, 0) < b.m * 0.5)
  on conflict (set_id) do nothing;
  get diagnostics k = row_count;
  etape := 'sets alignés (nouveaux)'; n := k; return next;

  -- 2. familles des cartes JP sans famille
  insert into card_entities (canonical_key, display_name, kind, anchor_card_id)
  select 'asia:' || c.source || ':' || c.source_id, c.name, 'asia', c.id
  from cards c join w_cards w on w.id = c.id
  where w.language = 'JP' and not w.is_alt and c.card_entity_id is null
  on conflict (canonical_key) do nothing;
  get diagnostics k = row_count;
  etape := 'familles JP créées'; n := k; return next;

  update cards c set card_entity_id = e.id
  from card_entities e
  where e.anchor_card_id = c.id and c.card_entity_id is null;

  update cards a set card_entity_id = b.card_entity_id
  from w_cards wa, cards b, w_cards wb
  where wa.id = a.id and wa.language = 'JP' and wa.is_alt
    and wb.id = b.id and not wb.is_alt and wb.set_id = wa.set_id and wb.n = wa.n and b.name = a.name
    and a.card_entity_id is null and b.card_entity_id is not null;
  get diagnostics k = row_count;
  etape := 'secondes impressions JP rattachées'; n := k; return next;

  insert into card_entity_matches (card_entity_id, card_id, match_method, confidence, status, evidence)
  select a.card_entity_id, a.id, 'alt_print', 100, 'auto',
         jsonb_build_object('regle', 'seconde impression : même set, même numéro, même nom')
  from cards a join w_cards w on w.id = a.id
  where w.language = 'JP' and w.is_alt and a.card_entity_id is not null
  on conflict (card_id) do nothing;

  -- 3. cartes KR / TC / SC libres (sans famille, ou seules dans la leur) des sets alignés
  create temp table w_cand on commit drop as
  select o.id as card_id, e.id as entity_id, j.id as jp_card_id,
         (o.illustrator_id is not null and o.illustrator_id = j.illustrator_id) as same_ill,
         (o.illustrator_id is null or j.illustrator_id is null) as ill_unknown,
         o.category
  from w_cards o
  join cards oc on oc.id = o.id
  join set_alignments al on al.set_id = o.set_id
  join w_cards j on j.set_id = al.jp_set_id and not j.is_alt and j.n = o.n and j.category = o.category
  join card_entities e on e.anchor_card_id = j.id
  where o.language <> 'JP' and o.n is not null
    and (oc.card_entity_id is null
         or exists (select 1 from card_entities own
                    where own.id = oc.card_entity_id and own.anchor_card_id = oc.id
                      and not exists (select 1 from cards x where x.card_entity_id = own.id and x.id <> oc.id)))
    and (
          (o.category = 'Pokémon'  and o.dex is not null and o.dex = j.dex)
       or (o.category = 'Dresseur' and o.illustrator_id is not null and o.illustrator_id = j.illustrator_id)
       or (o.category = 'Énergie'  and (o.illustrator_id = j.illustrator_id
                                        or (o.illustrator_id is null and j.illustrator_id is null)))
        );

  create temp table w_match on commit drop as
  select distinct on (card_id) card_id, entity_id, jp_card_id, same_ill, ill_unknown, category, n_cand, n_same
  from (
    select c.*, count(*) over (partition by card_id) as n_cand,
           count(*) filter (where same_ill) over (partition by card_id) as n_same
    from w_cand c
  ) x
  where n_cand = 1 or (n_same = 1 and same_ill)
  order by card_id, same_ill desc;

  update cards c set card_entity_id = m.entity_id
  from w_match m
  where m.card_id = c.id and (m.same_ill or m.ill_unknown)
    and c.card_entity_id is distinct from m.entity_id;
  get diagnostics k = row_count;
  etape := 'cartes KR/TC/SC rattachées à une famille'; n := k; return next;

  insert into card_entity_matches (card_entity_id, card_id, match_method, confidence, status, evidence)
  select m.entity_id, m.card_id, 'print_key',
         case when m.same_ill then 100 when m.ill_unknown then 95 else 70 end,
         case when m.same_ill or m.ill_unknown then 'auto' else 'probable' end,
         jsonb_build_object('carte_jp', m.jp_card_id, 'meme_illustrateur', m.same_ill,
                            'regle', 'set aligné + même numéro + ' ||
                                     case m.category when 'Pokémon' then 'même Pokédex'
                                                     when 'Dresseur' then 'même illustrateur'
                                                     else 'énergie' end)
  from w_match m
  on conflict (card_id) do nothing;

  -- familles individuelles devenues vides (cartes rattachées ailleurs)
  delete from card_entities e
  where e.kind = 'asia' and not exists (select 1 from cards c where c.card_entity_id = e.id);
  get diagnostics k = row_count;
  etape := 'familles individuelles supprimées (carte rattachée ailleurs)'; n := k; return next;

  -- 4. familles individuelles pour les cartes restées seules
  insert into card_entities (canonical_key, display_name, kind, anchor_card_id)
  select 'asia:' || c.source || ':' || c.language || ':' || c.source_id, c.name, 'asia', c.id
  from cards c join w_cards w on w.id = c.id
  where c.card_entity_id is null
  on conflict (canonical_key) do nothing;
  get diagnostics k = row_count;
  etape := 'familles individuelles créées'; n := k; return next;

  update cards c set card_entity_id = e.id
  from card_entities e
  where e.anchor_card_id = c.id and c.card_entity_id is null;

  -- 5. rareté de famille
  update card_entities e set rarity_code = r.rarity_code
  from (
    select distinct on (c.card_entity_id) c.card_entity_id, c.rarity_code
    from cards c
    where c.card_entity_id is not null and c.rarity_code is not null
    group by c.card_entity_id, c.rarity_code
    order by c.card_entity_id, (c.rarity_code = 'none'), count(*) desc, c.rarity_code
  ) r
  where r.card_entity_id = e.id and e.rarity_code is distinct from r.rarity_code;
  get diagnostics k = row_count;
  etape := 'raretés de famille mises à jour'; n := k; return next;

  drop table if exists w_cards; drop table if exists w_cand; drop table if exists w_match;
end $fn$;

-- -----------------------------------------------------------------------------
-- 2. Raretés héritées (étape 4c, rejouable)
-- -----------------------------------------------------------------------------
create or replace function public.apply_inherited_rarities()
returns table (etape text, n integer)
language plpgsql
set search_path = public, extensions, pg_temp
set statement_timeout = '15min'
as $fn$
#variable_conflict use_column
declare k integer;
begin
  -- KR / TC / SC sans rareté : rareté de l'ancre JP de la famille
  update cards c set rarity_code = aj.rarity_code, rarity_inferred = true
  from sets s, card_entities e, cards aj
  where s.id = c.set_id and s.language in ('KR', 'TC', 'SC')
    and e.id = c.card_entity_id and aj.id = e.anchor_card_id
    and c.rarity_code is null and aj.rarity_code is not null;
  get diagnostics k = row_count;
  etape := 'raretés héritées de l''ancre JP (KR/TC/SC)'; n := k; return next;

  -- JP ptcg-database sans rareté : copie TCGdex de la même carte (même code de set, même numéro)
  update cards c set rarity_code = k2.rarity_code, rarity_inferred = true
  from (
    select distinct on (c2.id) c2.id as card_id, t.rarity_code
    from cards c2
    join sets s on s.id = c2.set_id and s.language = 'JP'
    join sets ts on ts.language = 'JP' and ts.code = s.code
    join cards t on t.set_id = ts.id and t.source = 'tcgdex' and t.rarity_code is not null
     and t.number ~ '^0*[0-9]+$' and c2.number ~ '^0*[0-9]+$' and t.number::int = c2.number::int
    where c2.source = 'ptcg-database' and c2.rarity_code is null
    order by c2.id
  ) k2
  where c.id = k2.card_id;
  get diagnostics k = row_count;
  etape := 'raretés JP copiées depuis TCGdex'; n := k; return next;

  -- SC : ★ = rare (l'alias existe aussi pour les imports futurs)
  update cards c set rarity_code = 'rare', rarity_inferred = true
  from sets s
  where s.id = c.set_id and s.language = 'SC'
    and c.rarity_code is null and c.rarity = '★';
  get diagnostics k = row_count;
  etape := 'raretés SC ★ = rare'; n := k; return next;
end $fn$;

-- -----------------------------------------------------------------------------
-- 3. Noms de recherche français (étapes 6a et 6b, rejouable)
-- -----------------------------------------------------------------------------
create or replace function public.apply_search_names(p_all boolean default false)
returns table (etape text, n integer)
language plpgsql
set search_path = public, extensions, pg_temp
set statement_timeout = '15min'
as $fn$
#variable_conflict use_column
declare k integer;
begin
  -- FR : nom officiel
  update cards c set search_name_fr = c.name, search_name_official = true, search_name_method = 'officiel'
  from sets s
  where s.id = c.set_id and s.language = 'FR'
    and (c.search_name_fr is distinct from c.name or c.search_name_official is not true
         or c.search_name_method is distinct from 'officiel');
  get diagnostics k = row_count;
  etape := 'cartes FR : nom officiel'; n := k; return next;

  -- Énergies de base asiatiques
  drop table if exists w_energies;
  create temp table w_energies on commit drop as
  select c.id as card_id, e.label_fr
  from cards c
  join sets s on s.id = c.set_id and s.language in ('JP','KR','TC','SC')
  join (values
    ('JP','草','grass'),('JP','炎','fire'),('JP','水','water'),('JP','雷','lightning'),('JP','超','psychic'),
    ('JP','闘','fighting'),('JP','悪','darkness'),('JP','鋼','metal'),('JP','フェアリー','fairy'),
    ('KR','풀','grass'),('KR','불꽃','fire'),('KR','물','water'),('KR','번개','lightning'),('KR','초','psychic'),
    ('KR','격투','fighting'),('KR','악','darkness'),('KR','강철','metal'),('KR','페어리','fairy'),
    ('TC','草','grass'),('TC','火','fire'),('TC','炎','fire'),('TC','水','water'),('TC','雷','lightning'),
    ('TC','超','psychic'),('TC','鬥','fighting'),('TC','惡','darkness'),('TC','鋼','metal'),('TC','妖','fairy'),
    ('SC','草','grass'),('SC','火','fire'),('SC','水','water'),('SC','雷','lightning'),('SC','超','psychic'),
    ('SC','斗','fighting'),('SC','恶','darkness'),('SC','钢','metal'),('SC','妖','fairy')
  ) k(langue, cle, code) on k.langue = s.language
   and k.cle = (regexp_match(regexp_replace(c.name, '[\s【】]', '', 'g'),
                             '^(?:基本|기본)(.+?)(?:エネルギー|能量|에너지)$'))[1]
  join energy_types e on e.code = k.code
  where c.category = 'Énergie' and (p_all or c.search_name_fr is null);

  update cards c set search_name_fr = 'Énergie ' || w.label_fr, search_name_official = false,
                     search_name_method = 'energie_base'
  from w_energies w
  where c.id = w.card_id
    and (c.search_name_fr is distinct from 'Énergie ' || w.label_fr or c.search_name_method is distinct from 'energie_base');
  get diagnostics k = row_count;
  etape := 'Énergies de base asiatiques'; n := k; return next;

  -- Pokémon asiatiques : une espèce
  drop table if exists w_generes;
  create temp table w_generes on commit drop as
  select c.id as card_id, g.name_fr, g.method
  from cards c
  join sets s on s.id = c.set_id and s.language in ('JP','KR','TC','SC')
  join card_pokemon cp on cp.card_id = c.id and cp.dex_position = 0
  join pokemon_entities pe on pe.id = cp.pokemon_entity_id
  cross join lateral generate_search_name_fr(
    c.name,
    case s.language when 'JP' then pe.name_ja when 'KR' then pe.name_ko when 'TC' then pe.name_zh_hant else pe.name_zh_hans end,
    pe.name_fr) g
  where c.category = 'Pokémon'
    and (p_all or c.search_name_fr is null)
    and not exists (select 1 from card_pokemon x where x.card_id = c.id and x.dex_position > 0);

  -- plusieurs espèces
  insert into w_generes
  select c.id,
         string_agg(pe.name_fr, ' et ' order by cp.dex_position)
           || coalesce((select m.fr from name_modifiers m
                        where m.kind = 'card' and m.raw = (regexp_match(c.name, '(VMAX|VSTAR|GX|EX|ex|V)$'))[1]), ''),
         'multiple'
  from cards c
  join sets s on s.id = c.set_id and s.language in ('JP','KR','TC','SC')
  join card_pokemon cp on cp.card_id = c.id
  join pokemon_entities pe on pe.id = cp.pokemon_entity_id
  where c.category = 'Pokémon'
    and (p_all or c.search_name_fr is null)
    and exists (select 1 from card_pokemon x where x.card_id = c.id and x.dex_position > 0)
  group by c.id, c.name
  having bool_and(pe.name_fr is not null);

  update cards c set search_name_fr = g.name_fr, search_name_official = false, search_name_method = g.method
  from w_generes g
  where c.id = g.card_id
    and (c.search_name_fr is distinct from g.name_fr or c.search_name_method is distinct from g.method);
  get diagnostics k = row_count;
  etape := 'Pokémon asiatiques (noms générés)'; n := k; return next;

  drop table if exists w_energies; drop table if exists w_generes;
end $fn$;

-- -----------------------------------------------------------------------------
-- 4. Contrôles (étape 9)
-- -----------------------------------------------------------------------------
create or replace function public.data_controls()
returns table (ordre int, controle text, n bigint, attendu text, statut text)
language sql stable
set search_path = public, extensions, pg_temp
as $fn$
  with ind(ordre, controle, n, attendu, mode) as (
    select 1, 'cartes sans set', count(*), '0', 'zero' from cards c where not exists (select 1 from sets s where s.id = c.set_id)
    union all select 2, 'cartes sans catégorie', count(*), '0', 'zero' from cards where category is null
    union all select 3, 'cartes dont la langue diffère de celle du set', count(*), '0', 'zero'
      from cards c join sets s on s.id = c.set_id where c.language <> s.language
    union all select 4, 'cartes Pokémon sans espèce reliée (card_pokemon)', count(*), 'à expliquer (9 connues)', 'info'
      from cards c where c.category = 'Pokémon' and not exists (select 1 from card_pokemon p where p.card_id = c.id)
    union all select 5, 'cartes sans Pokédex commun avec l''ancre de leur famille', count(*), '0', 'zero'
      from cards c
      join card_entities e on e.id = c.card_entity_id
      join cards a on a.id = e.anchor_card_id
      where c.id <> a.id and c.category = 'Pokémon'
        and jsonb_typeof(c.dex_ids) = 'array' and jsonb_array_length(c.dex_ids) > 0
        and jsonb_typeof(a.dex_ids) = 'array' and jsonb_array_length(a.dex_ids) > 0
        and not exists (select 1 from jsonb_array_elements(c.dex_ids) x where a.dex_ids @> jsonb_build_array(x))
    union all select 6, 'doublons (même set, numéro, langue, nom, variante ET même image)', count(*), '0', 'zero'
      from (select 1 from cards where image_small is not null and image_small not like '%/noimage/%'
            group by set_id, number, language, name, coalesce(variant_type, ''), image_small having count(*) > 1) d
    union all select 7, 'cartes avec search_text vide', count(*), '0', 'zero' from cards where search_text is null or btrim(search_text) = ''
    union all select 8, 'cartes Pokémon sans nom de recherche français', count(*), 'à expliquer (9 connues)', 'info'
      from cards where category = 'Pokémon' and (search_name_fr is null or btrim(search_name_fr) = '')
    union all select 9, 'sets sans série', count(*), '0', 'zero' from sets where series_id is null
    union all select 10, 'sets dans la série Autre', count(*), 'à classer à la main (31 connus)', 'info' from sets where series_id = 'autre'
    union all select 11, 'sets sans date de sortie', count(*), 'à compléter (262 connus)', 'info' from sets where release_date is null
    union all select 12, 'sets affichés en nom généré', count(*), 'à renommer (617 connus)', 'info' from sets_display where display_source = 'genere'
    union all select 13, 'sets non publiés (chinois simplifié)', count(*), '232 tant que l''auteur n''a pas répondu', 'info' from sets where not is_published
    union all select 14, 'cartes sans image', count(*), 'à compléter (18 552 connues)', 'info' from cards where image_small is null
    union all select 15, 'cartes sans code de rareté', count(*), 'accepté (promos JP, ★★/★★★ chinois…)', 'info' from cards where rarity_code is null
    union all select 16, 'cartes sans illustrateur', count(*), 'accepté (5 086 connues)', 'info' from cards where illustrator_id is null
    union all select 17, 'tables publiques sans RLS', count(*), '0', 'zero'
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    union all select 18, 'fonctions internes exécutables par anon', count(*), '0', 'zero'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('apply_set_calendar','apply_set_series','apply_set_translations','generate_search_name_fr',
                          'refresh_search_text','apply_asia_families','apply_inherited_rarities','apply_search_names',
                          'data_controls','run_post_import')
        and has_function_privilege('anon', p.oid, 'execute')
    union all select 19, 'cartes sans famille asiatique (JP/KR/TC/SC)', count(*), '0', 'zero'
      from cards c join sets s on s.id = c.set_id where s.language in ('JP','KR','TC','SC') and c.card_entity_id is null
    union all select 20, 'recherche « dracaufeu » (attendu 390 tant que le catalogue est inchangé)', coalesce(max(total_count), 0), '≥ 390', 'min390' from search_cards('dracaufeu', p_limit => 1)
  )
  select i.ordre, i.controle, i.n, i.attendu,
         case i.mode when 'zero'   then case when i.n = 0 then 'OK' else 'A VOIR' end
                     when 'min390' then case when i.n >= 390 then 'OK' else 'A VOIR' end
                     else 'INFO' end
  from ind i order by i.ordre;
$fn$;

-- -----------------------------------------------------------------------------
-- 5. Chaîne complète
-- -----------------------------------------------------------------------------
create or replace function public.run_post_import(p_full boolean default false)
returns table (etape text, n integer)
language plpgsql
set search_path = public, extensions, pg_temp
set statement_timeout = '15min'
as $fn$
declare r record; v_run uuid; v_total integer := 0; k integer;
begin
  insert into sync_runs (source, status) values ('post_import', 'running') returning id into v_run;

  k := apply_set_calendar();      etape := 'dates des sets';              n := k; v_total := v_total + k; return next;
  k := apply_set_series();        etape := 'séries des sets';             n := k; v_total := v_total + k; return next;
  k := apply_set_translations();  etape := 'noms des sets';               n := k; v_total := v_total + k; return next;
  for r in select * from apply_asia_families() loop     etape := 'familles : ' || r.etape;  n := r.n; v_total := v_total + r.n; return next; end loop;
  for r in select * from apply_inherited_rarities() loop etape := 'raretés : ' || r.etape;  n := r.n; v_total := v_total + r.n; return next; end loop;
  for r in select * from apply_search_names(p_full) loop etape := 'noms : ' || r.etape;     n := r.n; v_total := v_total + r.n; return next; end loop;
  k := refresh_search_text(null); etape := 'texte de recherche';          n := k; v_total := v_total + k; return next;

  update sync_runs set status = 'ok', finished_at = now(), cards_updated = v_total where id = v_run;
end $fn$;

-- -----------------------------------------------------------------------------
-- 6. Droits : fermées à anon / authenticated
-- -----------------------------------------------------------------------------
revoke execute on function public.apply_asia_families()        from public, anon, authenticated;
revoke execute on function public.apply_inherited_rarities()   from public, anon, authenticated;
revoke execute on function public.apply_search_names(boolean)  from public, anon, authenticated;
revoke execute on function public.data_controls()              from public, anon, authenticated;
revoke execute on function public.run_post_import(boolean)     from public, anon, authenticated;
grant  execute on function public.apply_asia_families()        to service_role;
grant  execute on function public.apply_inherited_rarities()   to service_role;
grant  execute on function public.apply_search_names(boolean)  to service_role;
grant  execute on function public.data_controls()              to service_role;
grant  execute on function public.run_post_import(boolean)     to service_role;

-- -----------------------------------------------------------------------------
-- 7. Contrôle à blanc : rejouer la chaîne sur la base actuelle ne doit RIEN changer
-- -----------------------------------------------------------------------------
create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'familles : ' || f.etape, f.n from public.apply_asia_families() f;
insert into rapport select 20, 'raretés : ' || f.etape, f.n from public.apply_inherited_rarities() f;
insert into rapport select 30, 'noms : ' || f.etape, f.n from public.apply_search_names(false) f;
insert into rapport select 40, 'fonctions fermées à anon (attendu 0 ouverte)', count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('apply_asia_families','apply_inherited_rarities','apply_search_names','data_controls','run_post_import')
   and has_function_privilege('anon', p.oid, 'execute');
insert into rapport select 50 + d.ordre, 'contrôle ' || d.ordre || ' : ' || d.controle || ' [' || d.statut || ']', d.n from public.data_controls() d;

select * from rapport order by ordre, controle;

rollback;
