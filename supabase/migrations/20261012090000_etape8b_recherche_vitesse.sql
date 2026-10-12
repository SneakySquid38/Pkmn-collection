-- =============================================================================
-- Étape 8b : correction de la vitesse de search_cards
-- Projet : Pkmn-collection — 2026-10-12
--
-- Constat : appliquée telle quelle, search_cards('dracaufeu') prend ~7,7 s : les mots étaient lus dans une
-- sous-requête, donc la condition « like '%mot%' » n'était pas utilisable par l'index trigramme
-- (lecture complète de `cards`). La même requête avec les mots passés en paramètres prend ~0,2 s.
-- Correction : la fonction passe en plpgsql et exécute sa requête en SQL dynamique avec les mots en
-- paramètres (plan recalculé à chaque appel avec les vraies valeurs). Même signature, mêmes colonnes,
-- mêmes résultats ; les droits (anon, authenticated) sont conservés.
--
-- DRY-RUN PAR DÉFAUT : la dernière ligne est « rollback ». Pour appliquer, remplace-la par « commit ».
-- =============================================================================

begin;
set local statement_timeout = '15min';

create or replace function public.search_cards(
  q              text    default null,
  p_languages    text[]  default null,
  p_rarities     text[]  default null,
  p_set_id       uuid    default null,
  p_series_id    text    default null,
  p_illustrator  uuid    default null,
  p_category     text    default null,
  p_year         int     default null,
  p_limit        int     default 48,
  p_offset       int     default 0
)
returns table (
  card_id uuid, name text, search_name_fr text, language text, number text, sort_number int,
  set_id uuid, set_display_name text, set_code text, release_date date,
  rarity_code text, rarity_label text, rarity_inferred boolean, category text,
  illustrator text, image_small text, card_entity_id uuid, total_count bigint)
language plpgsql stable security invoker
set search_path = public, extensions, pg_temp
as $fn$
declare
  qn    text := btrim(extensions.unaccent(lower(coalesce(q, ''))));
  words text[] := string_to_array(btrim(regexp_replace(qn, '\s+', ' ', 'g')), ' ');
  w1 text := nullif(words[1], ''); w2 text := nullif(words[2], ''); w3 text := nullif(words[3], '');
  w4 text := nullif(words[4], ''); w5 text := nullif(words[5], '');
  lim int := greatest(least(coalesce(p_limit, 48), 200), 1);
  off int := greatest(coalesce(p_offset, 0), 0);
begin
  return query execute $sql$
    with hit as (
      select c.id, c.set_id, c.sort_number,
             case when $1 = '' then 0
                  else coalesce(word_similarity($1, coalesce(c.search_name_fr, '')), 0) end as score,
             count(*) over () as total_count
      from public.cards c
      join public.sets s on s.id = c.set_id
      where ($2::text is null or c.search_text like '%' || $2 || '%')
        and ($3::text is null or c.search_text like '%' || $3 || '%')
        and ($4::text is null or c.search_text like '%' || $4 || '%')
        and ($5::text is null or c.search_text like '%' || $5 || '%')
        and ($6::text is null or c.search_text like '%' || $6 || '%')
        and ($7::text[] is null or c.language = any ($7))
        and ($8::text[] is null or c.rarity_code = any ($8))
        and ($9::uuid is null or c.set_id = $9)
        and ($10::text is null or s.series_id = $10)
        and ($11::uuid is null or c.illustrator_id = $11)
        and ($12::text is null or c.category = $12)
        and ($13::int is null or extract(year from s.release_date) = $13)
      order by score desc, s.release_date desc nulls last, c.set_id, c.sort_number nulls last
      limit $14 offset $15
    )
    select c.id, c.name, c.search_name_fr, c.language, c.number, c.sort_number,
           c.set_id, d.display_name, d.code, d.release_date,
           c.rarity_code, r.label_fr, c.rarity_inferred, c.category,
           i.name, c.image_small, c.card_entity_id, h.total_count
    from hit h
    join public.cards c on c.id = h.id
    join public.sets_display d on d.set_id = c.set_id
    left join public.rarities r on r.code = c.rarity_code
    left join public.illustrators i on i.id = c.illustrator_id
    order by h.score desc, d.release_date desc nulls last, c.set_id, c.sort_number nulls last
  $sql$
  using qn, w1, w2, w3, w4, w5, p_languages, p_rarities, p_set_id, p_series_id, p_illustrator,
        p_category, p_year, lim, off;
end $fn$;

grant execute on function public.search_cards(text, text[], text[], uuid, text, uuid, text, int, int, int)
  to anon, authenticated;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'dracaufeu (total attendu 390)', max(total_count) from public.search_cards('dracaufeu');
insert into rapport select 2, 'mystherbe erika (attendu 6)', max(total_count) from public.search_cards('mystherbe erika');
insert into rapport select 3, 'ho-oh luth (attendu 27)', max(total_count) from public.search_cards('ho-oh luth');
insert into rapport select 4, 'électrique (attendu 283)', max(total_count) from public.search_cards('Électrique', p_limit => 1);
insert into rapport select 5, 'dracaufeu en JP seulement', max(total_count) from public.search_cards('dracaufeu', p_languages => array['JP']);
insert into rapport select 6, 'recherche vide, 1 résultat', count(*) from public.search_cards(null, p_limit => 1);

select * from rapport order by ordre;

rollback;
