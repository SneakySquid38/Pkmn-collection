-- =============================================================================
-- Étape 6c : texte de recherche et index (pg_trgm + unaccent)
-- Projet : Pkmn-collection — 2026-10-12
--
-- cards.search_text = en minuscules et sans accents :
--   nom de recherche FR + nom d'origine + nom(s) anglais de l'espèce + nom et code du set + illustrateur
--
-- unaccent() n'étant pas « immutable », le texte est calculé et stocké (pas de colonne générée).
-- La recherche appliquera la même transformation à ce que tape l'utilisateur
-- (extensions.unaccent(lower(q))), puis comparera avec l'index trigramme.
--
-- Fonction refresh_search_text(ids) : recalcule le texte de cartes précises (ou de toutes).
-- À appeler après chaque import (étape 10) ou changement de nom de set / d'illustrateur.
--
-- Sécurité : les fonctions internes créées à l'étape 6b (generate_search_name_fr,
-- normalize_owner_prefix) étaient appelables par le rôle anonyme. On retire ce droit ici,
-- comme pour les autres fonctions internes.
--
-- Annulation : drop index if exists cards_search_text_trgm; drop function public.refresh_search_text(uuid[]);
--              alter table public.cards drop column search_text;
--
-- VERSION COMMIT : applique les changements (la version sans _COMMIT est le test à blanc).
-- =============================================================================

begin;
set local statement_timeout = '15min';

alter table public.cards add column if not exists search_text text;
comment on column public.cards.search_text is
  'Texte de recherche (minuscules, sans accents) : nom FR, nom d''origine, espèce EN, set, illustrateur. Calculé par refresh_search_text().';

create or replace function public.refresh_search_text(p_card_ids uuid[] default null)
returns integer
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare n integer;
begin
  with especes as (
    select cp.card_id, string_agg(pe.name_en, ' ' order by cp.dex_position) as en
    from card_pokemon cp join pokemon_entities pe on pe.id = cp.pokemon_entity_id
    where p_card_ids is null or cp.card_id = any (p_card_ids)
    group by cp.card_id
  ), calcul as (
    select c.id,
           unaccent(lower(concat_ws(' ', c.search_name_fr, c.name, e.en, s.name, s.code, i.name))) as txt
    from cards c
    join sets s on s.id = c.set_id
    left join illustrators i on i.id = c.illustrator_id
    left join especes e on e.card_id = c.id
    where p_card_ids is null or c.id = any (p_card_ids)
  )
  update cards c set search_text = k.txt
  from calcul k
  where c.id = k.id and c.search_text is distinct from k.txt;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.refresh_search_text(uuid[]) from public, anon, authenticated;
revoke execute on function public.generate_search_name_fr(text, text, text) from public, anon, authenticated;
revoke execute on function public.normalize_owner_prefix(text) from public, anon, authenticated;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'cartes recalculées', public.refresh_search_text();

create index if not exists cards_search_text_trgm
  on public.cards using gin (search_text extensions.gin_trgm_ops);

insert into rapport
select 2, 'cartes sans texte de recherche (attendu 0)', count(*) from public.cards where search_text is null
union all
select 3, 'recherche « mystherbe » + « erika »', count(*) from public.cards
 where search_text like '%mystherbe%' and search_text like '%erika%'
union all
select 4, 'recherche « ho-oh » + « luth »', count(*) from public.cards
 where search_text like '%ho-oh%' and search_text like '%luth%'
union all
select 5, 'recherche « zorua » + « de n »  (cartes JP/KR/TC/SC comprises)', count(*) from public.cards
 where search_text like '%zorua%' and search_text like '%de n %'
union all
select 6, 'recherche « dracaufeu »', count(*) from public.cards where search_text like '%dracaufeu%'
union all
select 7, 'recherche « electrik » (sans accent) trouve « Électrique »', count(*) from public.cards
 where search_text like '%electrique%'
union all
select 8, 'fonctions internes encore appelables par anon (attendu 0)', count(*)
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public' and p.proname in ('refresh_search_text','generate_search_name_fr','normalize_owner_prefix')
  and has_function_privilege('anon', p.oid, 'execute');

select * from rapport order by ordre;

commit;
