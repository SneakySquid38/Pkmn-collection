-- =============================================================================
-- Étape 4a : familles asiatiques par numérotation commune (JP = KR = TC)
-- Projet : Pkmn-collection — 2026-10-11
--
-- Une « famille » (card_entities, kind = 'asia') regroupe la même carte dans
-- les éditions asiatiques : JP, KR, TC, SC. Les cartes FR n'en font pas partie
-- (décision : recherche FR à part).
--
--   1. Contraintes de card_entity_matches élargies (nouvelles méthodes et statuts)
--   2. set_alignments : chaque set KR / TC / SC est aligné sur le set JP dont il
--      reprend la numérotation, sur preuve (mêmes numéros + même Pokémon) ou
--      même code. Les sets sans numérotation commune seront traités en 4b.
--   3. Une famille par carte JP (première impression) ; les secondes impressions
--      JP (motifs Poké Ball / Master Ball) rejoignent la famille de la première
--   4. Rattachement des cartes KR / TC / SC des sets alignés :
--        - Pokémon : même numéro + même n° de Pokédex (+ même illustrateur si connu)
--        - Dresseurs : même numéro + même illustrateur (le numéro seul ne suffit
--          pas : mesuré, 38 % des Dresseurs au même numéro sont une autre carte)
--        - Énergies de base : même numéro, sans illustrateur des deux côtés
--   5. Une famille individuelle pour chaque carte asiatique restée seule (4b
--      tentera de la rapprocher par empreinte)
--   6. Rareté de famille : héritée des membres qui en ont une (le chinois
--      traditionnel n'en donne jamais)
--   7. Contrôles
--
-- Correction préalable (0) : 351 cartes FR (Neo, import TCGdex d'une ancienne
-- version du script) étaient rangées dans les sets JP neo1-4. Ce sont des
-- doublons exacts des cartes FR des sets FR neo1-4 : elles sont supprimées, et un
-- déclencheur interdit désormais une carte dans un set d'une autre langue.
-- =============================================================================

begin;

-- Délai élargi pour cette transaction seulement (≈95 000 cartes à mettre à jour).
-- Sans cela, l'éditeur SQL coupe la requête (« upstream timeout ») et tout est annulé.
set local statement_timeout = '15min';

-- -----------------------------------------------------------------------------
-- 0. Cartes rangées dans un set d'une autre langue
-- -----------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.cards c join public.sets s on s.id = c.set_id
      where s.language <> c.language) <> 351 then
    raise exception 'Nombre de cartes mal rangées inattendu : migration interrompue.';
  end if;
end $$;

delete from public.cards c using public.sets s
where s.id = c.set_id and s.language = 'JP' and c.language = 'FR'
  and exists (select 1 from public.cards f join public.sets fs on fs.id = f.set_id
              where fs.language = 'FR' and fs.code = s.code
                and f.sort_number = c.sort_number and lower(f.name) = lower(c.name));

create or replace function public.check_card_language()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.language <> (select s.language from public.sets s where s.id = new.set_id) then
    raise exception 'La carte % (%) est rangée dans un set d''une autre langue.', new.source_id, new.language;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_card_language() from public, anon, authenticated;

create trigger cards_check_language
  before insert or update of set_id, language on public.cards
  for each row execute function public.check_card_language();

-- -----------------------------------------------------------------------------
-- 1. Structure
-- -----------------------------------------------------------------------------
alter table public.card_entity_matches drop constraint card_entity_matches_match_method_check;
alter table public.card_entity_matches add constraint card_entity_matches_match_method_check
  check (match_method in ('official_id', 'source_mapping', 'set_number', 'pokemon_identity', 'manual',
                          'print_key', 'alt_print', 'empreinte', 'voisinage'));

alter table public.card_entity_matches drop constraint card_entity_matches_status_check;
alter table public.card_entity_matches add constraint card_entity_matches_status_check
  check (status in ('pending', 'verified', 'rejected', 'auto', 'probable', 'revue'));

alter table public.card_entities
  add column kind           text not null default 'asia' check (kind in ('asia', 'fr')),
  add column anchor_card_id uuid references public.cards (id) on delete set null,
  add column rarity_code    text references public.rarities (code);
create index card_entities_anchor_idx on public.card_entities (anchor_card_id);
create index cards_card_entity_idx    on public.cards (card_entity_id);

create table public.set_alignments (
  set_id     uuid primary key references public.sets (id) on delete cascade,
  jp_set_id  uuid not null references public.sets (id) on delete cascade,
  matched    integer not null,
  total      integer not null,
  method     text not null check (method in ('code', 'preuve', 'manuel')),
  created_at timestamptz not null default now()
);
alter table public.set_alignments enable row level security;
grant select on public.set_alignments to anon, authenticated;
create policy "Lecture publique" on public.set_alignments for select to anon, authenticated using (true);


-- -----------------------------------------------------------------------------
-- Données de travail : cartes asiatiques avec leurs n° de Pokédex
-- -----------------------------------------------------------------------------
create temp table w_cards on commit drop as
select c.id, c.set_id, s.language, s.code,
       regexp_replace(lower(s.code), '[^a-z0-9]', '', 'g') as code_norm,
       c.sort_number as n, c.category, c.illustrator_id, c.name,
       coalesce(c.variant_type, '') = 'alt_print' as is_alt,
       (select array_agg(p.dex_id order by p.dex_id)
          from public.card_pokemon cp join public.pokemon_entities p on p.id = cp.pokemon_entity_id
         where cp.card_id = c.id) as dex
from public.cards c
join public.sets s on s.id = c.set_id
where s.language in ('JP', 'KR', 'TC', 'SC');
create index on w_cards (set_id, n);
create index on w_cards (language);


-- -----------------------------------------------------------------------------
-- 2. Alignement des sets
-- -----------------------------------------------------------------------------
with jp as (select * from w_cards where language = 'JP' and not is_alt and n is not null),
oth as (select * from w_cards where language <> 'JP' and not is_alt and n is not null),
tot as (select set_id, count(*) filter (where category = 'Pokémon') as t from oth group by 1),
pairs as (
  select o.set_id as oset, j.set_id as jset, count(distinct o.id) as m
  from oth o join jp j on j.n = o.n and j.category = 'Pokémon' and o.category = 'Pokémon' and o.dex = j.dex
  group by 1, 2
),
best as (select distinct on (oset) oset, jset, m from pairs order by oset, m desc),
second as (select p.oset, max(p.m) as m2 from pairs p join best b on b.oset = p.oset and p.jset <> b.jset group by 1),
by_code as (
  -- même code (casse, espaces et suffixe « F » taïwanais ignorés)
  select distinct on (os.id) os.id as oset, js.id as jset
  from public.sets os
  join public.sets js on js.language = 'JP'
   and (regexp_replace(lower(os.code), '[^a-z0-9]', '', 'g') = regexp_replace(lower(js.code), '[^a-z0-9]', '', 'g')
     or regexp_replace(lower(os.code), '[^a-z0-9]', '', 'g') = regexp_replace(lower(js.code), '[^a-z0-9]', '', 'g') || 'f')
  where os.language in ('KR', 'TC', 'SC')
  order by os.id, (select count(*) from public.cards c where c.set_id = js.id) desc
)
insert into public.set_alignments (set_id, jp_set_id, matched, total, method)
select t.set_id,
       coalesce(bc.jset, b.jset),
       coalesce(b.m, 0),
       t.t,
       case when bc.jset is not null then 'code' else 'preuve' end
from tot t
left join best b on b.oset = t.set_id
left join second s2 on s2.oset = t.set_id
left join by_code bc on bc.oset = t.set_id
where (bc.jset is not null and (t.t = 0 or (b.jset = bc.jset and b.m::numeric / t.t >= 0.3)))
   or (bc.jset is null and t.t >= 5 and b.m::numeric / t.t >= 0.8 and coalesce(s2.m2, 0) < b.m * 0.5);


-- -----------------------------------------------------------------------------
-- 3. Familles des cartes JP
-- -----------------------------------------------------------------------------
insert into public.card_entities (canonical_key, display_name, kind, anchor_card_id)
select 'asia:' || c.source || ':' || c.source_id, c.name, 'asia', c.id
from public.cards c join w_cards w on w.id = c.id
where w.language = 'JP' and not w.is_alt
on conflict (canonical_key) do nothing;

update public.cards c set card_entity_id = e.id
from public.card_entities e
where e.anchor_card_id = c.id and c.card_entity_id is null;

-- secondes impressions JP : même set, même numéro, même nom que la première
update public.cards a set card_entity_id = b.card_entity_id
from w_cards wa, public.cards b, w_cards wb
where wa.id = a.id and wa.language = 'JP' and wa.is_alt
  and wb.id = b.id and not wb.is_alt and wb.set_id = wa.set_id and wb.n = wa.n and b.name = a.name
  and a.card_entity_id is null and b.card_entity_id is not null;

insert into public.card_entity_matches (card_entity_id, card_id, match_method, confidence, status, evidence)
select a.card_entity_id, a.id, 'alt_print', 100, 'auto',
       jsonb_build_object('regle', 'seconde impression : même set, même numéro, même nom')
from public.cards a join w_cards w on w.id = a.id
where w.language = 'JP' and w.is_alt and a.card_entity_id is not null
on conflict (card_id) do nothing;


-- -----------------------------------------------------------------------------
-- 4. Cartes KR / TC / SC des sets alignés
-- -----------------------------------------------------------------------------
create temp table w_cand on commit drop as
select o.id as card_id, e.id as entity_id, j.id as jp_card_id,
       (o.illustrator_id is not null and o.illustrator_id = j.illustrator_id) as same_ill,
       (o.illustrator_id is null or j.illustrator_id is null) as ill_unknown,
       o.category
from w_cards o
join public.set_alignments al on al.set_id = o.set_id
join w_cards j on j.set_id = al.jp_set_id and not j.is_alt and j.n = o.n and j.category = o.category
join public.card_entities e on e.anchor_card_id = j.id
where o.language <> 'JP' and o.n is not null
  and (
        (o.category = 'Pokémon'  and o.dex is not null and o.dex = j.dex)
     or (o.category = 'Dresseur' and o.illustrator_id is not null and o.illustrator_id = j.illustrator_id)
     or (o.category = 'Énergie'  and (o.illustrator_id = j.illustrator_id
                                      or (o.illustrator_id is null and j.illustrator_id is null)))
      );

-- une seule candidate (ou une seule avec le même illustrateur) -> rattachement
create temp table w_match on commit drop as
select distinct on (card_id) card_id, entity_id, jp_card_id, same_ill, ill_unknown, category, n_cand, n_same
from (
  select c.*, count(*) over (partition by card_id) as n_cand,
         count(*) filter (where same_ill) over (partition by card_id) as n_same
  from w_cand c
) x
where n_cand = 1 or (n_same = 1 and same_ill)
order by card_id, same_ill desc;

update public.cards c set card_entity_id = m.entity_id
from w_match m
where m.card_id = c.id and c.card_entity_id is null
  and (m.same_ill or m.ill_unknown);

insert into public.card_entity_matches (card_entity_id, card_id, match_method, confidence, status, evidence)
select m.entity_id, m.card_id, 'print_key',
       case when m.same_ill then 100 when m.ill_unknown then 95 else 70 end,
       case when m.same_ill or m.ill_unknown then 'auto' else 'probable' end,  -- probable = proposition, carte non rattachée
       jsonb_build_object('carte_jp', m.jp_card_id, 'meme_illustrateur', m.same_ill,
                          'regle', 'set aligné + même numéro + ' ||
                                   case m.category when 'Pokémon' then 'même Pokédex'
                                                   when 'Dresseur' then 'même illustrateur'
                                                   else 'énergie' end)
from w_match m
on conflict (card_id) do nothing;


-- -----------------------------------------------------------------------------
-- 5. Familles individuelles pour les cartes asiatiques restées seules
-- -----------------------------------------------------------------------------
insert into public.card_entities (canonical_key, display_name, kind, anchor_card_id)
select 'asia:' || c.source || ':' || c.language || ':' || c.source_id, c.name, 'asia', c.id
from public.cards c join w_cards w on w.id = c.id
where c.card_entity_id is null
on conflict (canonical_key) do nothing;

update public.cards c set card_entity_id = e.id
from public.card_entities e
where e.anchor_card_id = c.id and c.card_entity_id is null;


-- -----------------------------------------------------------------------------
-- 6. Rareté de famille (la plus fréquente parmi les membres ; « sans symbole »
--    seulement si aucun membre n'a de vraie rareté)
-- -----------------------------------------------------------------------------
update public.card_entities e set rarity_code = r.rarity_code
from (
  select distinct on (c.card_entity_id) c.card_entity_id, c.rarity_code
  from public.cards c
  where c.card_entity_id is not null and c.rarity_code is not null
  group by c.card_entity_id, c.rarity_code
  order by c.card_entity_id, (c.rarity_code = 'none'), count(*) desc, c.rarity_code
) r
where r.card_entity_id = e.id;


-- -----------------------------------------------------------------------------
-- 7. Contrôles
-- -----------------------------------------------------------------------------
do $$
declare n_sans int; n_dex int; n_al int; n_fam int; n_multi int;
begin
  select count(*) into n_sans from public.cards c join public.sets s on s.id = c.set_id
   where s.language in ('JP', 'KR', 'TC', 'SC') and c.card_entity_id is null;
  if n_sans > 0 then
    raise exception '% cartes asiatiques sans famille : migration interrompue.', n_sans;
  end if;

  -- une famille ne doit jamais mélanger deux Pokémon différents
  select count(*) into n_dex from (
    select e from (
      select c.card_entity_id as e, c.id,
             array_agg(cp.pokemon_entity_id order by cp.pokemon_entity_id) as s
      from public.cards c join public.card_pokemon cp on cp.card_id = c.id
      where c.card_entity_id is not null
      group by 1, 2
    ) per
    group by e having count(distinct s) > 1
  ) x;
  if n_dex > 0 then
    raise exception '% familles mélangent plusieurs Pokémon : migration interrompue.', n_dex;
  end if;

  select count(*) into n_al  from public.set_alignments;
  select count(*) into n_fam from public.card_entities where kind = 'asia';
  select count(*) into n_multi from (
    select card_entity_id from public.cards where card_entity_id is not null
    group by 1 having count(distinct language) > 1) x;
  raise notice 'Sets alignés : % — familles : % — familles multilingues : %', n_al, n_fam, n_multi;
end $$;

commit;
