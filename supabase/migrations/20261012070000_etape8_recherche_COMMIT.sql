-- =============================================================================
-- Étape 8 : socle de la recherche (vue des noms d'affichage des sets + fonction search_cards)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Décisions : la recherche se fait en français uniquement (search_text, étape 6c) ; le nom d'un set
-- s'affiche ainsi : nom français, sinon nom anglais, sinon nom généré « Japon · 2023 · SVAL »
-- (langue · année · code, aucune traduction inventée ; l'année est omise si la date est inconnue).
--
-- Contenu :
--   1. vue `sets_display` (security_invoker : la RLS des sets s'applique, donc seuls les sets publiés
--      sont visibles — le chinois simplifié reste invisible tant qu'il n'est pas publié) ;
--   2. fonction `search_cards(q, filtres, limite, décalage)` en security invoker (RLS des cartes) :
--      chaque mot de la recherche (5 au maximum) doit se trouver dans `search_text` (index trigramme) ; tri par
--      ressemblance avec le nom français, puis date de sortie décroissante ;
--   3. droits : lecture publique de la vue et exécution de la fonction pour anon et authenticated.
--
-- Pas de vue matérialisée : elle contournerait la RLS (et exposerait le chinois simplifié) et
-- demanderait un rafraîchissement ; la fonction lit `cards` directement avec l'index existant.
--
-- VERSION COMMIT.
-- =============================================================================

begin;
set local statement_timeout = '15min';

create or replace view public.sets_display
with (security_invoker = true) as
select s.id as set_id,
       s.language,
       s.code,
       s.release_date,
       coalesce(
         (select t.name from public.set_translations t where t.set_id = s.id and t.language = 'fr'),
         (select t.name from public.set_translations t where t.set_id = s.id and t.language = 'en'),
         concat_ws(' · ',
           case s.language when 'FR' then 'France' when 'JP' then 'Japon' when 'KR' then 'Corée'
                           when 'TC' then 'Chine trad.' when 'SC' then 'Chine simpl.' else s.language end,
           extract(year from s.release_date)::int::text,
           nullif(btrim(coalesce(s.code, '')), ''))
       ) as display_name,
       case when exists (select 1 from public.set_translations t where t.set_id = s.id and t.language = 'fr') then 'fr'
            when exists (select 1 from public.set_translations t where t.set_id = s.id and t.language = 'en') then 'en'
            else 'genere' end as display_source
from public.sets s;

create or replace function public.search_cards(
  q              text    default null,
  p_languages    text[]  default null,   -- ex. {FR,JP}
  p_rarities     text[]  default null,   -- codes de la table rarities
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
language sql stable security invoker
set search_path = public, extensions, pg_temp
as $$
  with params as (
    select btrim(extensions.unaccent(lower(coalesce(q, '')))) as qn,
           string_to_array(btrim(regexp_replace(extensions.unaccent(lower(coalesce(q, ''))), '\s+', ' ', 'g')), ' ') as words
  ),
  w as (
    -- jusqu'à 5 mots : des conditions « like » simples, que l'index trigramme sait utiliser
    select qn,
           nullif(words[1], '') as w1, nullif(words[2], '') as w2, nullif(words[3], '') as w3,
           nullif(words[4], '') as w4, nullif(words[5], '') as w5
    from params
  ),
  hit as (
    select c.id, c.set_id, c.sort_number,
           case when w.qn = '' then 0
                else coalesce(word_similarity(w.qn, coalesce(c.search_name_fr, '')), 0) end as score,
           count(*) over () as total_count
    from w, public.cards c
    join public.sets s on s.id = c.set_id
    where (w.w1 is null or c.search_text like '%' || w.w1 || '%')
    and (w.w2 is null or c.search_text like '%' || w.w2 || '%')
    and (w.w3 is null or c.search_text like '%' || w.w3 || '%')
    and (w.w4 is null or c.search_text like '%' || w.w4 || '%')
    and (w.w5 is null or c.search_text like '%' || w.w5 || '%')
    and (p_languages is null or c.language = any (p_languages))
    and (p_rarities is null or c.rarity_code = any (p_rarities))
    and (p_set_id is null or c.set_id = p_set_id)
    and (p_series_id is null or s.series_id = p_series_id)
    and (p_illustrator is null or c.illustrator_id = p_illustrator)
    and (p_category is null or c.category = p_category)
    and (p_year is null or extract(year from s.release_date) = p_year)
    order by score desc, s.release_date desc nulls last, c.set_id, c.sort_number nulls last
    limit greatest(least(coalesce(p_limit, 48), 200), 1) offset greatest(coalesce(p_offset, 0), 0)
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
  order by h.score desc, d.release_date desc nulls last, c.set_id, c.sort_number nulls last;
$$;

grant select on public.sets_display to anon, authenticated;
grant execute on function public.search_cards(text, text[], text[], uuid, text, uuid, text, int, int, int)
  to anon, authenticated;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'sets dans sets_display', count(*) from public.sets_display;
insert into rapport select 2, 'sets_display : source ' || display_source, count(*) from public.sets_display group by display_source;
insert into rapport select 3, 'dracaufeu', count(*) from public.search_cards('dracaufeu', p_limit => 200);
insert into rapport select 4, 'mystherbe erika', max(total_count) from public.search_cards('mystherbe erika', p_limit => 200);
insert into rapport select 5, 'ho-oh luth', max(total_count) from public.search_cards('ho-oh luth', p_limit => 200);
insert into rapport select 6, 'électrique (accents ignorés)', max(total_count) from public.search_cards('Électrique', p_limit => 1);
insert into rapport select 7, 'exemple de nom généré : ' || display_name, 1 from public.sets_display where display_source = 'genere' and code = 'SVAL';

select * from rapport order by ordre, controle;

commit;
