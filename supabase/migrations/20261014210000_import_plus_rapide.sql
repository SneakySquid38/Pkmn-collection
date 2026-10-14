-- 18 — Import Pokiframe plus rapide (les appels dépassaient la limite de 8 s quand la base est lente)
-- * match_pokiframe : cherche d'abord les sets, puis seulement les cartes de ces sets (avant : toutes les cartes à chaque appel).
-- * candidats_import : même principe, et le nom du Pokémon est vérifié une seule fois par carte.
-- * index cartes (set, numéro) pour retrouver une carte d'un set par son numéro sans lire tout le set.
-- Le résultat est le même qu'avant ; seule la vitesse change.

begin;

create index if not exists cards_set_numero_idx on public.cards (set_id, (upper(ltrim(number, '0'))));
analyze public.cards;

create or replace function public.match_pokiframe(p_lignes jsonb)
returns table(i integer, card_ids uuid[], methode text)
language sql stable
set search_path = public, pg_temp
as $$
  with l as materialized (
    select (x->>'i')::int as i,
           nullif(lower(regexp_replace(btrim(coalesce(x->>'code', '')), '-TW$', '', 'i')), '') as code,
           nullif(lower(btrim(coalesce(x->>'set', ''))), '') as set_nom,
           nullif(upper(ltrim(split_part(btrim(coalesce(x->>'num', '')), '/', 1), '0')), '') as num,
           case upper(x->>'lang')
             when 'FRENCH' then array['FR'] when 'JAPANESE' then array['JP']
             when 'KOREAN' then array['KR'] when 'CHINESE' then array['TC', 'SC']
             else array[]::text[] end as langues
    from jsonb_array_elements(p_lignes) x
  ),
  -- 1. Les sets de chaque ligne : par code, sinon par nom (nom, partie 「…」 des noms coréens, traductions).
  sets_code as materialized (
    select l.i, s.id as set_id
    from l join public.sets s on lower(s.code) = l.code and s.language = any (l.langues)
    where l.code is not null and l.num is not null
  ),
  sets_nom as materialized (
    select distinct l.i, s.id as set_id
    from l
    join public.sets s on s.language = any (l.langues)
     and (lower(s.name) = l.set_nom
          or lower(substring(s.name from '「(.*)」')) = l.set_nom
          or exists (select 1 from public.set_translations t where t.set_id = s.id and lower(t.name) = l.set_nom))
    where l.set_nom is not null and l.num is not null
  ),
  -- 2. Les cartes de ces sets au bon numéro (index cards_set_numero_idx).
  par_code as (
    select sc.i, c.id, c.variant_type
    from sets_code sc join l on l.i = sc.i
    cross join lateral (select c.id, c.variant_type from public.cards c
                        where c.set_id = sc.set_id and upper(ltrim(c.number, '0')) = l.num) c
  ),
  par_nom as (
    select sn.i, c.id, c.variant_type
    from sets_nom sn join l on l.i = sn.i
    cross join lateral (select c.id, c.variant_type from public.cards c
                        where c.set_id = sn.set_id and upper(ltrim(c.number, '0')) = l.num) c
    where not exists (select 1 from par_code p where p.i = sn.i)
  ),
  tout as (
    select t.i, t.id, t.variant_type, 'code' as methode from par_code t
    union all
    select t.i, t.id, t.variant_type, 'nom' from par_nom t
  ),
  -- Une seconde impression (alt_print) ne crée pas d'ambiguïté si l'impression principale existe.
  tri as (
    select t.*, bool_or(t.variant_type is distinct from 'alt_print') over (partition by t.i) as a_principale
    from tout t
  )
  select l.i,
         coalesce(array_agg(t.id order by t.id) filter (where t.id is not null and (not t.a_principale or t.variant_type is distinct from 'alt_print')), array[]::uuid[]),
         max(t.methode)
  from l left join tri t on t.i = l.i
  group by l.i
  order by l.i;
$$;

create or replace function public.candidats_import(p_lignes uuid[], p_max integer default 40)
returns table(ligne uuid, card_id uuid, nom text, language text, number text, set_nom text, image_small text,
              score integer, meme_numero boolean, rang integer, sure boolean)
language sql stable
set search_path = public, extensions, pg_temp
as $$
  with x as materialized (
    select li.id as ligne,
           lower(coalesce(li.payload->>'nom', '')) as nom,
           nullif(lower(regexp_replace(btrim(coalesce(li.payload->>'code', '')), '-TW$', '', 'i')), '') as code,
           nullif(lower(btrim(coalesce(li.payload->>'set', ''))), '') as set_nom,
           nullif(upper(ltrim(split_part(btrim(coalesce(li.payload->>'numero', '')), '/', 1), '0')), '') as num,
           case upper(li.payload->>'langue')
             when 'FRENCH' then array['FR'] when 'JAPANESE' then array['JP']
             when 'KOREAN' then array['KR'] when 'CHINESE' then array['SC', 'TC']
             else array[]::text[] end as langues
    from public.import_lines li
    where li.id = any (p_lignes) and li.user_id = auth.uid()
  ), pk as materialized (
    -- Le Pokémon : le plus long nom anglais contenu dans le nom Pokiframe (« Hisuian Goodra » → Goodra).
    select x.*,
           (select pe.id from public.pokemon_entities pe
            where coalesce(pe.name_en, '') <> ''
              and ' ' || regexp_replace(x.nom, '[,&()]', ' ', 'g') || ' ' like '% ' || lower(pe.name_en) || ' %'
            order by length(pe.name_en) desc limit 1) as pokemon,
           x.nom ~ '(^|[^a-z])(ex|gx|v|vmax|vstar)($|[^a-z])' as suffixe
    from x
  ), trad as materialized (
    select pk.ligne, t.set_id, max(similarity(lower(t.name), pk.set_nom)) as sim
    from pk join public.set_translations t on pk.set_nom is not null
    group by pk.ligne, t.set_id
  ), proches as materialized (
    select pk.ligne, s.id as set_id,
           greatest(
             case when pk.code is null then 0
                  when lower(s.code) = pk.code then 1
                  when lower(s.code) like pk.code || '%' or pk.code like lower(s.code) || '%' then 0.7
                  else 0 end,
             case when pk.set_nom is null then 0 else similarity(lower(s.name), pk.set_nom) end,
             coalesce(tr.sim, 0)
           )::numeric as proche
    from pk
    join public.sets s on s.language = any (pk.langues) and s.is_published
    left join trad tr on tr.ligne = pk.ligne and tr.set_id = s.id
  ), cand as (
    -- Toutes les cartes du Pokémon, plus les cartes au même numéro d'un set proche (dresseurs, énergies).
    select pk.ligne, cp.card_id as id, true as du_pokemon
    from pk join public.card_pokemon cp on cp.pokemon_entity_id = pk.pokemon
    union all
    select pr.ligne, c.id, false
    from proches pr join pk on pk.ligne = pr.ligne
    cross join lateral (select c.id from public.cards c
                        where c.set_id = pr.set_id and upper(ltrim(c.number, '0')) = pk.num) c
    where pr.proche >= 0.4 and pk.num is not null
  ), cand1 as materialized (
    -- Une ligne par carte candidate, avec ses infos (avant de la rapprocher de son set).
    select k.ligne, c.id as card_id, c.set_id, c.number, c.name, c.variant_type, c.sort_number, k.du_pokemon
    from (select k.ligne, k.id, bool_or(k.du_pokemon) as du_pokemon from cand k group by k.ligne, k.id) k
    join pk on pk.ligne = k.ligne
    join public.cards c on c.id = k.id and c.language = any (pk.langues)
  ), cand2 as (
    -- Proximité du set de chaque candidate (code, nom, traductions).
    select k.*, s.release_date, pk.num, pk.suffixe, pk.pokemon,
           greatest(
             case when pk.code is null then 0
                  when lower(s.code) = pk.code then 1
                  when lower(s.code) like pk.code || '%' or pk.code like lower(s.code) || '%' then 0.7
                  else 0 end,
             case when pk.set_nom is null then 0 else similarity(lower(s.name), pk.set_nom) end,
             case when pk.set_nom is null then 0 else coalesce((select max(similarity(lower(t.name), pk.set_nom))
                                                                from public.set_translations t where t.set_id = s.id), 0) end
           )::numeric as proche
    from cand1 k
    join pk on pk.ligne = k.ligne
    join public.sets s on s.id = k.set_id
  ), note as (
    select k.ligne, k.card_id, k.release_date, k.sort_number, k.proche,
           coalesce(upper(ltrim(split_part(k.number, '/', 1), '0')) = k.num, false) as meme_numero,
           (k.pokemon is null or k.du_pokemon) as bon_pokemon,
           ( case when upper(ltrim(split_part(k.number, '/', 1), '0')) = k.num then 100 else 0 end
           + round(40 * k.proche)::int
           + case when k.du_pokemon then 30 else 0 end
           + case when k.suffixe = (lower(k.name) ~ '(^|[^a-z])(ex|gx|v|vmax|vstar)($|[^a-z])') then 10 else -10 end
           - case when k.variant_type = 'alt_print' then 5 else 0 end )::int as score
    from cand2 k
  ), rangs as (
    select n.*,
           row_number() over (partition by n.ligne order by n.score desc, n.release_date desc nulls last, n.sort_number nulls last)::int as rang,
           lead(n.score) over (partition by n.ligne order by n.score desc, n.release_date desc nulls last, n.sort_number nulls last) as suivant
    from note n
  )
  select r.ligne, c.id, coalesce(c.search_name_fr, c.name), c.language, c.number, d.display_name, c.image_small,
         r.score, r.meme_numero, r.rang,
         (r.rang = 1 and r.meme_numero and r.bon_pokemon and r.proche >= 0.6 and (r.suivant is null or r.score - r.suivant >= 30))
  from rangs r
  join public.cards c on c.id = r.card_id
  left join public.sets_display d on d.set_id = c.set_id
  where r.rang <= greatest(least(coalesce(p_max, 40), 200), 1)
  order by r.ligne, r.rang;
$$;

commit;
