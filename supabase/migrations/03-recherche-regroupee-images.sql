-- Krikrou collection · Phase 2 (correctif images)
-- 1. 464 cartes JP des sets S12a (VSTAR Universe) et SV2a (Pokémon 151) ont une adresse TCGdex incomplète :
--    « https://assets.tcgdex.net/ja/S/S12a/211 » au lieu de « …/211/low.webp ». Le navigateur
--    n'obtient pas d'image. Depuis le regroupement, c'est cette version JP qui représente la tuile,
--    d'où les images disparues. On complète ces adresses (low.webp pour la grille, high.webp pour la fiche).
-- 2. La tuile choisit maintenant d'abord une version qui a une image (JP, sinon KR, sinon CN).
-- Retour arrière du point 1 : enlever « /low.webp » et « /high.webp » de ces 464 adresses.
--
-- 1) Lance tel quel (ROLLBACK à la fin) : l'aperçu doit montrer 464 puis 0, et des images partout.
-- 2) Remplace le dernier ROLLBACK par COMMIT et relance.

begin;

select count(*) as adresses_a_corriger_avant from public.cards
where image_small ~ '^https://assets\.tcgdex\.net/.*/[^/.]+$';

update public.cards
set image_small = image_small || '/low.webp'
where image_small ~ '^https://assets\.tcgdex\.net/.*/[^/.]+$';

update public.cards
set image_large = image_large || '/high.webp'
where image_large ~ '^https://assets\.tcgdex\.net/.*/[^/.]+$';

select count(*) as adresses_a_corriger_apres from public.cards
where image_small ~ '^https://assets\.tcgdex\.net/.*/[^/.]+$'
   or image_large ~ '^https://assets\.tcgdex\.net/.*/[^/.]+$';

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
             array_position(array['FR','JP','KR','TC','SC'], c.language) as rang,
             (c.image_small is null) as sans_image
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
        and s.is_published  -- le chinois simplifié reste masqué, même pour l'administrateur
    ), w as (
      select h.*,
             row_number() over g as rn,
             max(h.score) over g as best,
             bool_or(h.language = 'FR') over g as l_fr, bool_or(h.language = 'JP') over g as l_jp,
             bool_or(h.language = 'KR') over g as l_kr, bool_or(h.language = 'TC') over g as l_tc
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
                              case when p.l_kr then 'KR' end, case when p.l_tc then 'TC' end], null),
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

-- Aperçu : les 10 premières tuiles pour « dracaufeu » (image = true attendu presque partout).
select search_name_fr, language, languages, set_display_name, number, image_small is not null as image, total_count
from public.search_cards_grouped(q => 'dracaufeu', p_limit => 10);

rollback;
