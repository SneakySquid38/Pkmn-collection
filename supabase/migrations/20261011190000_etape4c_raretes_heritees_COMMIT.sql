-- =============================================================================
-- Étape 4c : raretés manquantes héritées de la carte japonaise ancre
-- Projet : Pkmn-collection — 2026-10-11
--
-- Règle : une carte KR, TC ou SC sans rareté reçoit la rareté de la carte
-- japonaise ancre de sa famille (même tirage : même set aligné, même numéro,
-- ou même empreinte). On ne prend PAS la rareté d'une autre réimpression de la
-- famille : une même carte peut être « commune » dans un set et « rare » dans
-- un autre.
--
--   1. cards.rarity_inferred : marque les raretés héritées (audit)
--   2. Déclencheur cards_normalize corrigé : il ne doit plus effacer une
--      rareté lorsque la source n'en fournit pas (cas d'un réimport)
--   3. Héritage pour KR / TC / SC
--
-- VERSION D'ÉCRITURE : la dernière ligne est « commit ».
-- Test à blanc déjà validé : 12 130 raretés héritées (10 086 TC, 2 044 KR).
-- Annulation possible : UPDATE cards SET rarity_code = NULL, rarity_inferred = false WHERE rarity_inferred;
-- =============================================================================

begin;
set local statement_timeout = '15min';

-- 1. Indicateur
alter table public.cards add column if not exists rarity_inferred boolean not null default false;

-- 2. Déclencheur : si la source n'a pas de rareté brute, on garde celle déjà en base
create or replace function public.cards_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- raretés brutes absentes : on garde rarity_code tel quel (éventuellement hérité)
  if new.rarity is not null then
    new.rarity_code := (select a.rarity_code from public.rarity_aliases a where a.raw_value = new.rarity);
    new.rarity_inferred := false;
  end if;
  new.types_en       := public.normalize_types(new.types);
  new.sort_number    := public.card_sort_number(coalesce(new.local_id, new.number));
  new.illustrator_id := case when new.artist is null then null else public.illustrator_for(new.artist) end;
  return new;
end;
$$;

-- 3. Héritage depuis l'ancre japonaise
create temp table heritage on commit drop as
select c.id as card_id, aj.rarity_code
from public.cards c
join public.sets s on s.id = c.set_id
join public.card_entities e on e.id = c.card_entity_id
join public.cards aj on aj.id = e.anchor_card_id
where s.language in ('KR', 'TC', 'SC')
  and c.rarity_code is null
  and aj.rarity_code is not null;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport
select 1, 'cartes KR/TC/SC sans rareté, avec ancre JP renseignée', count(*) from heritage
union all select 2, 'dont TC', (select count(*) from heritage h join public.cards c on c.id = h.card_id join public.sets s on s.id = c.set_id where s.language = 'TC')
union all select 3, 'dont KR', (select count(*) from heritage h join public.cards c on c.id = h.card_id join public.sets s on s.id = c.set_id where s.language = 'KR');

update public.cards c
set rarity_code = h.rarity_code,
    rarity_inferred = true
from heritage h
where c.id = h.card_id;

insert into rapport
select 4, 'raretés KR/TC/SC après héritage : cartes sans rareté (total)',
       (select count(*) from public.cards c join public.sets s on s.id = c.set_id
         where s.language in ('KR','TC','SC') and c.rarity_code is null);

select * from rapport order by ordre;

commit;
