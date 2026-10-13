-- Krikrou collection · Cartes à plusieurs Pokémon (TAG TEAM GX, LÉGENDE…)
-- Problème : sur les cartes coréennes et chinoises (et 11 japonaises), une carte « A & B GX » n'est reliée
-- qu'à un seul Pokémon. Elle n'apparaît donc pas dans les classeurs des autres Pokémon, et son nom de
-- recherche est faux (ex. 耿鬼&谜拟丘GX s'appelle « Mimiqui » au lieu de « Ectoplasma et Mimiqui-GX »).
-- Correctif : apply_team_pokemon() découpe le nom d'origine sur « & », retrouve chaque Pokémon par son nom
-- dans la langue de la carte (le plus long nom contenu dans chaque morceau, donc « アローラナッシー » → Noadkoko),
-- complète card_pokemon et cards.dex_ids, puis recalcule le nom de recherche et le texte de recherche.
-- La fonction est rejouée à chaque mise à jour du catalogue (ajoutée à run_post_import et à scripts/update.ts).
-- Les cartes françaises sont déjà bien reliées (Sulfura, Électhor et Artikodin-GX : 3 Pokémon).
--
-- 1) Lance tel quel (ROLLBACK à la fin) : le résultat montre combien de cartes sont corrigées et des exemples.
-- 2) Remplace le dernier ROLLBACK par COMMIT et relance.
-- Retour arrière : drop function public.apply_team_pokemon(); (les liens ajoutés restent, ils sont justes).

begin;

create or replace function public.apply_team_pokemon()
returns integer
language plpgsql
set search_path = public, extensions, pg_temp
set statement_timeout = '15min'
as $fn$
declare
  ids uuid[];
begin
  -- Chaque morceau du nom (« ファイヤー », « サンダー », « フリーザーGX ») et le Pokémon qu'il contient.
  drop table if exists w_equipes;
  create temp table w_equipes on commit drop as
  with cartes as (
    select c.id, c.language, c.name
    from cards c
    where c.category = 'Pokémon' and c.language in ('JP', 'KR', 'TC', 'SC') and c.name ~ '[&＆]'
  ), morceaux as (
    select k.id, k.language, x.ord, regexp_replace(x.part, '\s', '', 'g') as part
    from cartes k cross join lateral regexp_split_to_table(k.name, '[&＆]') with ordinality as x(part, ord)
  ), noms as (
    select pe.id, pe.dex_id, l.langue, regexp_replace(l.nom, '\s', '', 'g') as nom
    from pokemon_entities pe
    cross join lateral (values ('JP', pe.name_ja), ('KR', pe.name_ko), ('TC', pe.name_zh_hant), ('SC', pe.name_zh_hans)) l(langue, nom)
    where coalesce(l.nom, '') <> ''
  ), trouves as (
    select m.id as card_id, m.ord,
           (select n.id from noms n where n.langue = m.language and position(n.nom in m.part) > 0
            order by length(n.nom) desc, n.dex_id limit 1) as entity_id
    from morceaux m
  ), completes as (
    select card_id from trouves group by card_id having bool_and(entity_id is not null)
  )
  select t.card_id, t.entity_id, pe.dex_id, (row_number() over (partition by t.card_id order by min(t.ord)) - 1)::int as position
  from trouves t
  join completes c using (card_id)
  join pokemon_entities pe on pe.id = t.entity_id
  group by t.card_id, t.entity_id, pe.dex_id;

  -- Cartes à corriger : un Pokémon manque, ou l'ordre diffère.
  select array_agg(distinct w.card_id) into ids
  from w_equipes w
  left join card_pokemon cp on cp.card_id = w.card_id and cp.pokemon_entity_id = w.entity_id
  where cp.id is null or cp.dex_position is distinct from w.position;
  if ids is null then
    return 0;
  end if;

  update cards c set dex_ids = (select jsonb_agg(w.dex_id order by w.position) from w_equipes w where w.card_id = c.id)
  where c.id = any (ids);

  insert into card_pokemon (card_id, pokemon_entity_id, dex_position)
  select w.card_id, w.entity_id, w.position from w_equipes w where w.card_id = any (ids)
  on conflict (card_id, pokemon_entity_id) do update set dex_position = excluded.dex_position;

  -- Nom de recherche recalculé (« Ectoplasma et Mimiqui-GX ») ; les noms officiels ne bougent pas.
  update cards set search_name_fr = null where id = any (ids) and search_name_official is not true;
  perform apply_search_names(false);
  perform refresh_search_text(ids);
  return cardinality(ids);
end
$fn$;

revoke all on function public.apply_team_pokemon() from public, anon, authenticated;

-- Rejouée à chaque mise à jour du catalogue, avant le calcul des noms.
create or replace function public.run_post_import(p_full boolean default false)
returns table(etape text, n integer)
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
  k := apply_team_pokemon();      etape := 'cartes à plusieurs Pokémon';  n := k; v_total := v_total + k; return next;
  for r in select * from apply_search_names(p_full) loop etape := 'noms : ' || r.etape;     n := r.n; v_total := v_total + r.n; return next; end loop;
  k := refresh_search_text(null); etape := 'texte de recherche';          n := k; v_total := v_total + k; return next;

  update sync_runs set status = 'ok', finished_at = now(), cards_updated = v_total where id = v_run;
end
$fn$;

-- Correction maintenant, puis contrôle : par langue, cartes « A & B » corrigées, encore incomplètes
-- (attendu : 0 ; les « Raichu & Raichu d'Alola » ne comptent qu'une espèce) et un exemple.
create temp table r_corrigees on commit drop as select public.apply_team_pokemon() as n;

select c.language,
       (select n from r_corrigees) as cartes_corrigees_toutes_langues,
       count(*) as cartes_a_plusieurs,
       count(*) filter (where (select count(*) from card_pokemon p where p.card_id = c.id) < 2
                          and (select count(distinct e.dex_id) from card_pokemon p join pokemon_entities e on e.id = p.pokemon_entity_id
                               where p.card_id = c.id) < array_length(regexp_split_to_array(c.name, '[&＆]'), 1)
                          and c.name !~ '(ライチュウ|ベトベトン|라이츄|질뻐기|雷丘|臭臭泥)') as encore_incompletes,
       min(c.name || ' → ' || coalesce(c.search_name_fr, '?')) filter (where c.name ~ '(谜拟丘|따라큐|カビゴン|克雷色利亞)') as exemple
from cards c
where c.category = 'Pokémon' and c.language in ('JP', 'KR', 'TC', 'SC') and c.name ~ '[&＆]'
group by c.language order by c.language;

rollback;
