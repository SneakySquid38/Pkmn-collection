-- 15 — Chinois regroupé en « CN » (simplifié d'abord, traditionnel en repli) et publication du simplifié
-- À lancer dans le SQL Editor APRÈS la fin de `npx tsx scripts/images-sc.ts --apply`.
-- 1er passage tel quel (ROLLBACK à la fin : rien n'est gardé), lire les aperçus,
-- puis remplacer la dernière ligne par COMMIT et relancer.
--
-- 1. langues_filtre() : « CN » (et les anciens codes TC / SC) devient SC + TC. Le site envoie « CN ».
-- 2. search_cards_grouped : filtre CN, la tuile prend le simplifié avant le traditionnel,
--    et la pastille « CN » remplace « TC ».
-- 3. classeur_cards : les règles « CN » (ou « TC » enregistrées avant) prennent les deux chinois.
-- 4. Les 232 sets en chinois simplifié deviennent visibles (is_published = true).
-- Retour arrière du point 4 : update public.sets set is_published = false where language = 'SC';

begin;
set local statement_timeout = '5min';

create or replace function public.langues_filtre(p text[])
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array(select distinct l from unnest(p) x(code),
               lateral unnest(case when x.code in ('CN', 'SC', 'TC') then array['SC', 'TC'] else array[x.code] end) l)
$$;

grant execute on function public.langues_filtre(text[]) to authenticated, service_role;

create or replace function public.search_cards_grouped(
  q text default null, p_languages text[] default null, p_rarities text[] default null,
  p_set_id uuid default null, p_series_id text default null, p_illustrator uuid default null,
  p_category text default null, p_year integer default null,
  p_limit integer default 30, p_offset integer default 0)
returns table(card_id uuid, name text, search_name_fr text, language text, number text,
  set_id uuid, set_display_name text, set_code text, release_date date,
  rarity_code text, rarity_label text, image_small text, card_entity_id uuid,
  languages text[], total_count bigint)
language plpgsql stable
set search_path = public, extensions, pg_temp
set work_mem = '32MB'
as $fn$
declare
  qn    text := btrim(extensions.unaccent(lower(coalesce(q, ''))));
  words text[] := string_to_array(btrim(regexp_replace(qn, '\s+', ' ', 'g')), ' ');
  w1 text := nullif(words[1], ''); w2 text := nullif(words[2], ''); w3 text := nullif(words[3], '');
  w4 text := nullif(words[4], ''); w5 text := nullif(words[5], '');
  lim int := greatest(least(coalesce(p_limit, 30), 200), 1);
  off int := greatest(coalesce(p_offset, 0), 0);
begin
  return query execute $sql$
    with hit as (
      select c.id, c.language, c.set_id, c.sort_number, s.release_date,
             case when $1 = '' then 0
                  else coalesce(word_similarity($1, coalesce(c.search_name_fr, '')), 0) end as score,
             case when c.language <> 'FR' and c.card_entity_id is not null then c.card_entity_id else c.id end as grp,
             array_position(array['FR','JP','KR','SC','TC'], c.language) as rang,
             (c.image_small is null) as sans_image
      from public.cards c
      join public.sets s on s.id = c.set_id
      where ($2::text is null or c.search_text like '%' || $2 || '%')
        and ($3::text is null or c.search_text like '%' || $3 || '%')
        and ($4::text is null or c.search_text like '%' || $4 || '%')
        and ($5::text is null or c.search_text like '%' || $5 || '%')
        and ($6::text is null or c.search_text like '%' || $6 || '%')
        and ($7::text[] is null or c.language = any (public.langues_filtre($7)))
        and ($8::text[] is null or c.rarity_code = any ($8))
        and ($9::uuid is null or c.set_id = $9)
        and ($10::text is null or s.series_id = $10)
        and ($11::uuid is null or c.illustrator_id = $11)
        and ($12::text is null or c.category = $12)
        and ($13::int is null or extract(year from s.release_date) = $13)
        and s.is_published
    ), w as (
      select h.*,
             row_number() over g as rn,
             max(h.score) over g as best,
             bool_or(h.language = 'FR') over g as l_fr, bool_or(h.language = 'JP') over g as l_jp,
             bool_or(h.language = 'KR') over g as l_kr, bool_or(h.language in ('SC', 'TC')) over g as l_cn
      from hit h
      window g as (partition by h.grp order by h.sans_image, h.rang, h.release_date desc nulls last
                   rows between unbounded preceding and unbounded following)
    ), page as (
      select w.*, count(*) over () as total_count
      from w where w.rn = 1
      order by w.best desc, w.release_date desc nulls last, w.set_id, w.sort_number nulls last
      limit $14 offset $15
    )
    select c.id, c.name, c.search_name_fr, c.language, c.number, c.set_id,
           d.display_name, d.code, d.release_date, c.rarity_code, r.label_fr,
           c.image_small, c.card_entity_id,
           array_remove(array[case when p.l_fr then 'FR' end, case when p.l_jp then 'JP' end,
                              case when p.l_kr then 'KR' end, case when p.l_cn then 'CN' end], null),
           p.total_count
    from page p
    join public.cards c on c.id = p.id
    join public.sets_display d on d.set_id = c.set_id
    left join public.rarities r on r.code = c.rarity_code
    order by p.best desc, p.release_date desc nulls last, p.set_id, p.sort_number nulls last
  $sql$
  using qn, w1, w2, w3, w4, w5, p_languages, p_rarities, p_set_id, p_series_id, p_illustrator,
        p_category, p_year, lim, off;
end
$fn$;

revoke execute on function public.search_cards_grouped(text, text[], text[], uuid, text, uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.search_cards_grouped(text, text[], text[], uuid, text, uuid, text, integer, integer, integer) to authenticated;

create or replace function public.classeur_cards(p_rule jsonb, p_limit integer default 2400)
returns table(card_id uuid, name text, search_name_fr text, language text, number text, image_small text, set_id uuid, set_display_name text)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_langues text[] := public.langues_filtre(coalesce(nullif(array(select jsonb_array_elements_text(p_rule->'langues')), '{}'), array['FR']));
  v_pokemon uuid := nullif(p_rule->>'pokemon', '')::uuid;
  v_illustrateur uuid := nullif(p_rule->>'illustrateur', '')::uuid;
  v_serie text := nullif(p_rule->>'serie', '');
  v_set uuid := nullif(p_rule->>'set', '')::uuid;
  v_rarete text := nullif(p_rule->>'rarete', '');
  v_categorie text := nullif(p_rule->>'categorie', '');
  v_annee int := nullif(p_rule->>'annee', '')::int;
  v_nom text := nullif(btrim(extensions.unaccent(lower(coalesce(p_rule->>'nom', '')))), '');
  v_limite int := greatest(1, least(coalesce(p_limit, 2400), 2400));
  filtres text := '';
begin
  -- Seuls les filtres choisis entrent dans la requête : Postgres peut alors partir du Pokémon, du set…
  if v_pokemon is not null then
    filtres := filtres || ' and exists (select 1 from public.card_pokemon p where p.card_id = c.id and p.pokemon_entity_id = $2)';
  end if;
  if v_illustrateur is not null then filtres := filtres || ' and c.illustrator_id = $3'; end if;
  if v_serie is not null then filtres := filtres || ' and s.series_id = $4'; end if;
  if v_set is not null then filtres := filtres || ' and c.set_id = $5'; end if;
  if v_rarete is not null then filtres := filtres || ' and c.rarity_code = $6'; end if;
  if v_categorie is not null then filtres := filtres || ' and c.category = $7'; end if;
  if v_annee is not null then filtres := filtres || ' and extract(year from s.release_date) = $8'; end if;
  if v_nom is not null then
    filtres := filtres || ' and extensions.unaccent(lower(coalesce(c.search_name_fr, '''') || '' '' || c.name)) like ''%'' || $9 || ''%''';
  end if;

  return query execute
    'select c.id, c.name, c.search_name_fr, c.language, c.number, c.image_small, c.set_id, d.display_name
     from public.cards c
     join public.sets s on s.id = c.set_id and s.is_published
     join public.sets_display d on d.set_id = c.set_id
     where c.language = any ($1)' || filtres || '
     order by s.release_date nulls last, s.id, c.sort_number nulls last, c.number
     limit $10'
  using v_langues, v_pokemon, v_illustrateur, v_serie, v_set, v_rarete, v_categorie, v_annee, v_nom, v_limite;
end
$fn$;

revoke all on function public.classeur_cards(jsonb, integer) from public, anon;
grant execute on function public.classeur_cards(jsonb, integer) to authenticated, service_role;

revoke all on function public.classeur_cards(jsonb, integer) from public, anon;
grant execute on function public.classeur_cards(jsonb, integer) to authenticated, service_role;

-- contrôle avant publication : cartes SC encore sans image (attendu 0, ou presque)
select count(*) as cartes_sc_sans_image
from public.cards where language = 'SC' and coalesce(image_small, '') = '';

update public.sets set is_published = true where language = 'SC' and not is_published;

-- aperçus
select public.langues_filtre(array['FR', 'CN']) as filtre_cn;
select language, is_published, count(*) from public.sets group by 1, 2 order by 1;
select search_name_fr, language, languages, set_display_name, number, image_small is not null as image
from public.search_cards_grouped(q => 'pikachu', p_languages => array['CN'], p_limit => 8);

rollback;  -- remplacer par : commit;
