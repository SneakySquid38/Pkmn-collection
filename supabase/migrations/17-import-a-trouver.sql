-- 17 — Import Pokiframe : cartes « à trouver à la main »
-- Les lignes non reconnues d'un import restent dans import_lines (statut « introuvable »).
-- Ce script ajoute :
--   * le statut « absente » (carte absente du catalogue, rangée à part) ;
--   * import_a_trouver() : une ligne par carte Pokiframe encore à trouver, tous imports actifs confondus ;
--   * candidats_import() : les cartes candidates de chaque ligne, les plus probables d'abord ;
--   * choisir_cartes_import() : rattache une ou plusieurs lignes à la carte choisie et l'ajoute à la collection ;
--   * marquer_absente() : range une ligne dans « Absentes du catalogue », ou l'en sort.
-- À lancer dans le SQL Editor : tel quel (ROLLBACK), lire l'aperçu, puis remplacer la dernière ligne par commit;

begin;

alter table public.import_lines drop constraint import_lines_status_check;
alter table public.import_lines add constraint import_lines_status_check
  check (status = any (array['importee', 'deja_importee', 'introuvable', 'retiree', 'absente']));

-- Une ligne par carte Pokiframe (external_id) encore à trouver : la plus récente des lignes introuvables
-- des imports non annulés, sauf si un import actif l'a déjà rattachée à une carte.
create or replace function public.import_a_trouver()
returns table(ligne uuid, external_id text, payload jsonb, prix numeric, fichier text, importe_le timestamptz, absente boolean)
language sql stable
set search_path = public, pg_temp
as $$
  with actives as (
    select li.id, li.external_id, li.payload, li.price, li.status, li.card_id, lo.file_name, lo.created_at
    from public.import_lines li
    join public.import_lots lo on lo.id = li.lot_id
    where li.user_id = auth.uid() and lo.undone_at is null
  )
  select distinct on (a.external_id)
         a.id, a.external_id, a.payload, a.price, a.file_name, a.created_at,
         exists (select 1 from actives b where b.external_id = a.external_id and b.status = 'absente')
  from actives a
  where a.status in ('introuvable', 'absente')
    and not exists (select 1 from actives b where b.external_id = a.external_id and b.card_id is not null)
  order by a.external_id, (a.status = 'absente') desc, a.created_at desc;
$$;

-- Cartes candidates pour des lignes à trouver, notées :
--   +100 même numéro, +40 × proximité du set (code ou nom), +30 même Pokémon (nom anglais de Pokiframe),
--   ±10 même suffixe (ex, GX, V, VMAX, VSTAR) ou non, −5 seconde impression.
-- « sure » marque la 1re candidate quand elle a le même numéro, le bon Pokémon, un set proche
-- et 30 points d'avance sur la suivante.
create or replace function public.candidats_import(p_lignes uuid[], p_max integer default 40)
returns table(ligne uuid, card_id uuid, nom text, language text, number text, set_nom text, image_small text,
              score integer, meme_numero boolean, rang integer, sure boolean)
language sql stable
set search_path = public, extensions, pg_temp
as $$
  with x as (
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
  ), pk as (
    -- Le Pokémon : le plus long nom anglais contenu dans le nom Pokiframe (« Hisuian Goodra » → Goodra).
    select x.*,
           (select pe.id from public.pokemon_entities pe
            where coalesce(pe.name_en, '') <> ''
              and ' ' || regexp_replace(x.nom, '[,&()]', ' ', 'g') || ' ' like '% ' || lower(pe.name_en) || ' %'
            order by length(pe.name_en) desc limit 1) as pokemon,
           x.nom ~ '(^|[^a-z])(ex|gx|v|vmax|vstar)($|[^a-z])' as suffixe
    from x
  ), proches as (
    select pk.ligne, s.id as set_id,
           greatest(
             case when pk.code is null then 0
                  when lower(s.code) = pk.code then 1
                  when lower(s.code) like pk.code || '%' or pk.code like lower(s.code) || '%' then 0.7
                  else 0 end,
             case when pk.set_nom is null then 0 else greatest(
               similarity(lower(s.name), pk.set_nom),
               coalesce((select max(similarity(lower(t.name), pk.set_nom)) from public.set_translations t where t.set_id = s.id), 0)) end
           )::numeric as proche
    from pk join public.sets s on s.language = any (pk.langues) and s.is_published
  ), cand as (
    -- Toutes les cartes du Pokémon dans la langue, plus les cartes au même numéro d'un set proche (dresseurs, énergies).
    select pk.ligne, c.id
    from pk join public.card_pokemon cp on cp.pokemon_entity_id = pk.pokemon
    join public.cards c on c.id = cp.card_id and c.language = any (pk.langues)
    union
    select pk.ligne, c.id
    from pk join proches pr on pr.ligne = pk.ligne and pr.proche >= 0.4
    join public.cards c on c.set_id = pr.set_id and upper(ltrim(split_part(c.number, '/', 1), '0')) = pk.num
  ), note as (
    select k.ligne, c.id as card_id, s.release_date, c.sort_number,
           coalesce(upper(ltrim(split_part(c.number, '/', 1), '0')) = pk.num, false) as meme_numero,
           pr.proche,
           (pk.pokemon is null or exists (select 1 from public.card_pokemon cp
                                          where cp.card_id = c.id and cp.pokemon_entity_id = pk.pokemon)) as bon_pokemon,
           ( case when upper(ltrim(split_part(c.number, '/', 1), '0')) = pk.num then 100 else 0 end
           + round(40 * pr.proche)::int
           + case when pk.pokemon is not null and exists (select 1 from public.card_pokemon cp
                    where cp.card_id = c.id and cp.pokemon_entity_id = pk.pokemon) then 30 else 0 end
           + case when pk.suffixe = (lower(c.name) ~ '(^|[^a-z])(ex|gx|v|vmax|vstar)($|[^a-z])') then 10 else -10 end
           - case when c.variant_type = 'alt_print' then 5 else 0 end )::int as score
    from cand k
    join pk on pk.ligne = k.ligne
    join public.cards c on c.id = k.id
    join public.sets s on s.id = c.set_id
    join proches pr on pr.ligne = k.ligne and pr.set_id = c.set_id
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

-- Rattache des lignes à trouver à une carte : p_choix = [{"ligne": uuid, "card": uuid}, …].
-- La carte est ajoutée à la collection avec la quantité du fichier (1 pour les lignes importées avant ce script).
-- La ligne devient « importee » : annuler son import la retire, et les imports suivants la reconnaissent.
create or replace function public.choisir_cartes_import(p_choix jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  moi uuid := auth.uid();
  ch record;
  l record;
  qte int;
  faites int := 0;
begin
  if moi is null then raise exception 'Non connecté'; end if;
  for ch in
    select (x->>'ligne')::uuid as ligne, (x->>'card')::uuid as card from jsonb_array_elements(p_choix) x
  loop
    select li.* into l
    from public.import_lines li join public.import_lots lo on lo.id = li.lot_id
    where li.id = ch.ligne and li.user_id = moi and li.status in ('introuvable', 'absente') and lo.undone_at is null
    for update of li;
    if not found then continue; end if;
    if not exists (select 1 from public.cards where id = ch.card) then raise exception 'Carte inconnue'; end if;
    -- Déjà rattachée par une autre ligne active : on ne compte pas deux fois.
    if exists (select 1 from public.import_lines li join public.import_lots lo on lo.id = li.lot_id
               where li.user_id = moi and li.external_id = l.external_id and li.card_id is not null
                 and li.status in ('importee', 'retiree') and lo.undone_at is null) then
      continue;
    end if;
    qte := greatest(coalesce((l.payload->>'quantite')::int, 1), 1);
    perform public.ajuster_collection(ch.card, qte, l.price);
    update public.import_lines
       set card_id = ch.card, quantity = qte, status = 'importee',
           payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('choix_manuel', now())
     where id = l.id;
    -- Les autres lignes de la même carte Pokiframe ne sont plus à trouver.
    update public.import_lines set status = 'introuvable'
     where user_id = moi and external_id = l.external_id and status = 'absente';
    faites := faites + 1;
  end loop;
  return faites;
end
$$;

-- Range une carte Pokiframe dans « Absentes du catalogue » (ou l'en sort), pour toutes ses lignes actives.
create or replace function public.marquer_absente(p_ligne uuid, p_absente boolean)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  moi uuid := auth.uid();
  ext text;
begin
  select external_id into ext from public.import_lines where id = p_ligne and user_id = moi;
  if ext is null then raise exception 'Ligne inconnue'; end if;
  update public.import_lines li
     set status = case when p_absente then 'absente' else 'introuvable' end
    from public.import_lots lo
   where lo.id = li.lot_id and lo.undone_at is null
     and li.user_id = moi and li.external_id = ext and li.status in ('introuvable', 'absente');
end
$$;

revoke execute on function public.import_a_trouver() from public, anon;
revoke execute on function public.candidats_import(uuid[], integer) from public, anon;
revoke execute on function public.choisir_cartes_import(jsonb) from public, anon;
revoke execute on function public.marquer_absente(uuid, boolean) from public, anon;
grant execute on function public.import_a_trouver() to authenticated;
grant execute on function public.candidats_import(uuid[], integer) to authenticated;
grant execute on function public.choisir_cartes_import(jsonb) to authenticated;
grant execute on function public.marquer_absente(uuid, boolean) to authenticated;

-- Aperçu, vu comme Hugo : cartes à trouver, et combien ont une suggestion sûre.
select set_config('request.jwt.claims', '{"sub":"2c801386-1da9-4b4d-b78a-88581b4b1109","role":"authenticated"}', true);
with t as (select * from public.import_a_trouver()),
     c as (select * from public.candidats_import((select array_agg(ligne) from t), 3))
select t.payload->>'nom' as carte_pokiframe, t.payload->>'set' as set_pokiframe, t.payload->>'numero' as numero,
       c.nom as suggestion, c.set_nom, c.number, c.score, c.sure
from t left join c on c.ligne = t.ligne and c.rang = 1
order by c.sure desc nulls last, t.payload->>'nom';

rollback;  -- remplacer par : commit;
