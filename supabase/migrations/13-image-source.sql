-- 13 — Source des images des cartes (cards.image_source)
-- À lancer dans le SQL Editor de Supabase AVANT `npx tsx scripts/images-manquantes.ts --apply`.
-- 1er passage tel quel (ROLLBACK à la fin : rien n'est gardé), lire le résultat,
-- puis remplacer la dernière ligne par COMMIT et relancer.
--
-- image_source dit d'où vient l'image d'une carte :
--   tcgdex      assets.tcgdex.net
--   officiel    sites officiels (pokemon-card.com, pokemonkorea, asia.pokemon-card.com)
--   pokepedia   Poképédia (CC BY-NC-SA, à créditer)
--   bulbapedia  Bulbapedia (CC BY-NC-SA, à créditer)
-- Elle sert au crédit sur le site, et à tout retirer d'un coup si une source le demande :
--   update cards set image_small = null, image_large = null, image_source = null where image_source = 'pokepedia';

begin;
set local statement_timeout = '5min';

alter table public.cards add column if not exists image_source text;

alter table public.cards drop constraint if exists cards_image_source_check;
alter table public.cards add constraint cards_image_source_check
  check (image_source is null or image_source in ('tcgdex', 'officiel', 'pokepedia', 'bulbapedia', 'manuel'));

-- images déjà en base
update public.cards
set image_source = case
  when image_small like 'https://assets.tcgdex.net/%' then 'tcgdex'
  else 'officiel'
end
where image_source is null and coalesce(image_small, '') <> '';

-- contrôle : attendu tcgdex 21 051, officiel 55 063 (KR 20 323 + JP 20 157 + TC 14 583), le reste vide
select coalesce(image_source, '(aucune)') as image_source, language, count(*)
from public.cards
group by 1, 2
order by 1, 2;

rollback;  -- remplacer par : commit;
