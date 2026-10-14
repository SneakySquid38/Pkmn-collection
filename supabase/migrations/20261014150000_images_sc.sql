-- 14 — Images des cartes SC (PTCG-CHS-Datasets)
-- À lancer dans le SQL Editor de Supabase APRÈS 13-image-source.sql, et AVANT
-- `npx tsx scripts/images-sc.ts --apply`.
--
-- 1. image_source accepte 'ptcg-chs'.
-- 2. Bucket public « cartes-sc » : les images WebP des cartes SC (environ 330 Mo).
--    Public = lisible par tous via son adresse ; seul le script (clé service role) peut y écrire.
-- Pour tout retirer d'un coup :
--   update cards set image_small = null, image_large = null, image_source = null where image_source = 'ptcg-chs';
--   puis vider le bucket « cartes-sc » dans Storage.

begin;
set local statement_timeout = '5min';

alter table public.cards drop constraint if exists cards_image_source_check;
alter table public.cards add constraint cards_image_source_check
  check (image_source is null or image_source in ('tcgdex', 'officiel', 'pokepedia', 'bulbapedia', 'ptcg-chs', 'manuel'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cartes-sc', 'cartes-sc', true, 1048576, array['image/webp'])
on conflict (id) do nothing;

-- contrôle : une ligne « cartes-sc », public = true
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cartes-sc';

commit;
