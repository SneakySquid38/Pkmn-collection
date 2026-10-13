-- Krikrou collection · Phase 5 bis : classeurs automatiques et binders
-- Deux sortes de classeurs dans la même table :
--   « binder »   : rangé à la main, case par case (ce qui existait déjà ; ton binder actuel le devient).
--   « classeur » : construit à partir de filtres (langues, Pokémon, illustrateur, série, set, rareté,
--                  catégorie, année, nom). Sa liste de cartes se recalcule à chaque affichage : une
--                  nouvelle carte du catalogue y apparaît toute seule.
-- 1. binders.kind ('binder' ou 'classeur') et binders.rule (les filtres, seulement pour un classeur).
-- 2. Les cases (binder_slots) ne concernent que les binders.
-- 3. classeur_cards(regle) : les cartes d'un classeur, dans l'ordre des sorties (set puis numéro).
-- Retour arrière : drop function public.classeur_cards(jsonb, integer);
--   delete from public.binders where kind = 'classeur';
--   alter table public.binders drop column rule, drop column kind;
--   puis recréer les 3 politiques d'écriture des cases sans la condition sur kind.
--
-- 1) Lance tel quel (ROLLBACK à la fin) : l'aperçu montre un exemple de classeur (illustrateur sowsow, JP).
-- 2) Remplace le dernier ROLLBACK par COMMIT et relance.

begin;

-- 1. Sorte de classeur et filtres
alter table public.binders
  add column kind text not null default 'binder' check (kind in ('binder', 'classeur')),
  add column rule jsonb;
alter table public.binders
  add constraint binders_rule_selon_kind check ((kind = 'classeur') = (rule is not null and jsonb_typeof(rule) = 'object'));

-- 2. Les cases ne se remplissent que dans un binder
drop policy "Remplir ses classeurs" on public.binder_slots;
drop policy "Modifier les cases de ses classeurs" on public.binder_slots;
create policy "Remplir ses binders" on public.binder_slots
  for insert to authenticated
  with check (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid()) and b.kind = 'binder'));
create policy "Modifier les cases de ses binders" on public.binder_slots
  for update to authenticated
  using (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid()) and b.kind = 'binder'))
  with check (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid()) and b.kind = 'binder'));

-- 3. Cartes d'un classeur. Règle (toutes les clés sont facultatives sauf langues) :
--   {"langues":["JP"], "pokemon":"<uuid pokemon_entities>", "illustrateur":"<uuid>", "serie":"<code>",
--    "set":"<uuid>", "rarete":"<code>", "categorie":"Pokémon", "annee":2024, "nom":"dracaufeu"}
-- Droits de l'utilisateur connecté : le chinois simplifié non publié reste masqué.
create or replace function public.classeur_cards(p_rule jsonb, p_limit integer default 2400)
returns table(card_id uuid, name text, search_name_fr text, language text, number text, image_small text,
              set_id uuid, set_display_name text)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $fn$
  with r as (
    select
      coalesce(array(select jsonb_array_elements_text(p_rule->'langues')), array['FR']) as langues,
      nullif(p_rule->>'pokemon', '')::uuid as pokemon,
      nullif(p_rule->>'illustrateur', '')::uuid as illustrateur,
      nullif(p_rule->>'serie', '') as serie,
      nullif(p_rule->>'set', '')::uuid as set_id,
      nullif(p_rule->>'rarete', '') as rarete,
      nullif(p_rule->>'categorie', '') as categorie,
      nullif(p_rule->>'annee', '')::int as annee,
      nullif(btrim(extensions.unaccent(lower(coalesce(p_rule->>'nom', '')))), '') as nom
  )
  select c.id, c.name, c.search_name_fr, c.language, c.number, c.image_small, c.set_id, d.display_name
  from r
  join public.cards c on c.language = any (r.langues)
  join public.sets s on s.id = c.set_id and s.is_published
  join public.sets_display d on d.set_id = c.set_id
  where (r.pokemon is null or exists (select 1 from public.card_pokemon p where p.card_id = c.id and p.pokemon_entity_id = r.pokemon))
    and (r.illustrateur is null or c.illustrator_id = r.illustrateur)
    and (r.serie is null or s.series_id = r.serie)
    and (r.set_id is null or c.set_id = r.set_id)
    and (r.rarete is null or c.rarity_code = r.rarete)
    and (r.categorie is null or c.category = r.categorie)
    and (r.annee is null or extract(year from s.release_date) = r.annee)
    and (r.nom is null or extensions.unaccent(lower(coalesce(c.search_name_fr, '') || ' ' || c.name)) like '%' || r.nom || '%')
  order by s.release_date nulls last, s.id, c.sort_number nulls last, c.number
  limit greatest(1, least(coalesce(p_limit, 2400), 2400))
$fn$;

revoke all on function public.classeur_cards(jsonb, integer) from public, anon;
grant execute on function public.classeur_cards(jsonb, integer) to authenticated;

-- Aperçu : un classeur « sowsow » en japonais (nombre de cartes et 5 premières).
select count(*) over () as cartes, name, language, number, set_display_name
from public.classeur_cards(
  jsonb_build_object('langues', jsonb_build_array('JP'),
                     'illustrateur', (select id from public.illustrators where name ilike 'sowsow' limit 1)))
limit 5;

rollback;
