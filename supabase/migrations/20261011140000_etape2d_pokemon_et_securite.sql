-- =============================================================================
-- Étape 2d : liens carte ↔ Pokémon toujours à jour + sécurité des fonctions
-- Projet : Pkmn-collection — 2026-10-11
--
-- Décision : on GARDE la colonne cards.dex_ids. Les scripts d'import l'écrivent
-- (numéros de Pokédex bruts de la source) ; card_pokemon en est la version
-- normalisée. Un déclencheur tient désormais card_pokemon à jour automatiquement :
-- plus besoin de lancer sync-pokemon-entities.ts après un import.
--
--   1. Corrige 13 cartes : 9 Arceus FR (Platine Rivaux Émergeants) sans Pokédex,
--      4 cartes Rayquaza δ notées 384.1 au lieu de 384
--   2. Déclencheur sync_card_pokemon sur cards.dex_ids
--   3. Rattrapage : liens manquants pour 8 cartes à plusieurs Pokémon
--   4. Sécurité : les fonctions internes ne sont plus appelables depuis le site
--      (avertissement du conseiller Supabase sur handle_new_user)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Corrections de données
-- -----------------------------------------------------------------------------
update public.cards c set dex_ids = '[493]'::jsonb
from public.sets s
where s.id = c.set_id and s.language = 'FR' and s.code = 'pl3'
  and c.category = 'Pokémon' and c.name = 'Arceus' and c.dex_ids is null;

update public.cards set dex_ids = '[384]'::jsonb where dex_ids = '[384.1]'::jsonb;


-- -----------------------------------------------------------------------------
-- 2. Déclencheur : dex_ids -> card_pokemon (ajoute les liens manquants, ne
--    supprime jamais un lien existant, qui peut avoir été ajouté à la main)
-- -----------------------------------------------------------------------------
create or replace function public.sync_card_pokemon()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dex_ids is null or jsonb_typeof(new.dex_ids) <> 'array' then
    return new;
  end if;
  insert into public.card_pokemon (card_id, pokemon_entity_id, dex_position)
  select new.id, p.id, (x.ord - 1)::int
  from jsonb_array_elements_text(new.dex_ids) with ordinality as x(v, ord)
  join public.pokemon_entities p on p.dex_id = floor(x.v::numeric)::int
  where x.v ~ '^[0-9]+(\.[0-9]+)?$'
  on conflict (card_id, pokemon_entity_id) do nothing;
  return new;
end;
$$;

create trigger cards_sync_card_pokemon
  after insert or update of dex_ids on public.cards
  for each row execute function public.sync_card_pokemon();


-- -----------------------------------------------------------------------------
-- 3. Rattrapage sur toute la base (13 cartes corrigées ci-dessus incluses)
-- -----------------------------------------------------------------------------
insert into public.card_pokemon (card_id, pokemon_entity_id, dex_position)
select c.id, p.id, (x.ord - 1)::int
from public.cards c
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(c.dex_ids) = 'array' then c.dex_ids else '[]'::jsonb end
) with ordinality as x(v, ord)
join public.pokemon_entities p on p.dex_id = floor(x.v::numeric)::int
where x.v ~ '^[0-9]+(\.[0-9]+)?$'
on conflict (card_id, pokemon_entity_id) do nothing;


-- -----------------------------------------------------------------------------
-- 4. Sécurité : fonctions internes réservées aux scripts (service_role)
-- -----------------------------------------------------------------------------
revoke execute on function public.handle_new_user()                from public, anon, authenticated;
revoke execute on function public.set_updated_at()                 from public, anon, authenticated;
revoke execute on function public.cards_normalize()                from public, anon, authenticated;
revoke execute on function public.sync_card_pokemon()              from public, anon, authenticated;
revoke execute on function public.illustrator_for(text)            from public, anon, authenticated;
revoke execute on function public.illustrator_key(text)            from public, anon, authenticated;
revoke execute on function public.clean_illustrator_name(text)     from public, anon, authenticated;
revoke execute on function public.normalize_types(jsonb)           from public, anon, authenticated;
revoke execute on function public.card_sort_number(text)           from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 5. Contrôles
-- -----------------------------------------------------------------------------
do $$
declare n_sans int; n_incomplets int;
begin
  select count(*) into n_sans from public.cards c
   where c.category = 'Pokémon'
     and not exists (select 1 from public.card_pokemon cp where cp.card_id = c.id);
  -- seule exception attendue : 埋もれた化石 (Fossile enfoui, e-Card JP), sans Pokédex
  if n_sans > 1 then
    raise exception '% cartes Pokémon sans espèce : migration interrompue.', n_sans;
  end if;

  select count(*) into n_incomplets from public.cards c
   where jsonb_typeof(c.dex_ids) = 'array' and jsonb_array_length(c.dex_ids) > 0
     and (select count(*) from public.card_pokemon cp where cp.card_id = c.id)
         < (select count(distinct floor(v::numeric)) from jsonb_array_elements_text(c.dex_ids) v
            where v ~ '^[0-9]+(\.[0-9]+)?$');
  if n_incomplets > 0 then
    raise exception '% cartes ont encore des liens Pokémon incomplets : migration interrompue.', n_incomplets;
  end if;
end $$;

commit;
