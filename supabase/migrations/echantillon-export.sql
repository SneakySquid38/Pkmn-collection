-- =============================================================================
-- Contrôle croisé TCGdex : échantillon aléatoire de cartes JP et TC
-- Projet : Pkmn-collection — 2026-10-11
--
-- LECTURE SEULE. À lancer dans le SQL Editor, puis exporter le résultat en CSV
-- (bouton « Download CSV ») sous le nom : echantillon.csv
--
-- Taille : 300 cartes JP + 300 cartes TC, tirées au hasard, sans les sets
-- « no_set » ni les numéros non numériques (le contrôle ne peut pas les comparer).
-- =============================================================================

with base as (
  select s.language as langue, s.code as set_code, c.number as numero, c.name as nom,
         c.rarity as rarete_brute, c.rarity_code as code_rarete, a.name as illustrateur,
         c.source as source, c.hp as pv, c.category as categorie
  from public.cards c
  join public.sets s on s.id = c.set_id
  left join public.illustrators a on a.id = c.illustrator_id
  where s.language in ('JP', 'TC')
    and s.code <> 'no_set'
    and c.number ~ '^0*[0-9]+$'
),
jp as (select * from base where langue = 'JP' order by random() limit 300),
tc as (select * from base where langue = 'TC' order by random() limit 300)
select * from jp
union all
select * from tc;
