-- =============================================================================
-- Étape 9 : contrôles internes (lecture seule, aucune écriture)
-- À relancer après chaque import ou mise à jour. Chaque ligne : un indicateur, sa valeur, ce qui est attendu.
-- statut : OK (valeur attendue), INFO (connu et accepté, voir « attendu »), A VOIR (écart à examiner).
-- =============================================================================
with ind(ordre, controle, n, attendu, mode) as (
  select 1, 'cartes sans set', count(*), '0', 'zero' from public.cards c where not exists (select 1 from public.sets s where s.id = c.set_id)
  union all select 2, 'cartes sans catégorie', count(*), '0', 'zero' from public.cards where category is null
  union all select 3, 'cartes dont la langue diffère de celle du set', count(*), '0', 'zero'
    from public.cards c join public.sets s on s.id = c.set_id where c.language <> s.language
  union all select 4, 'cartes Pokémon sans espèce reliée (card_pokemon)', count(*), 'à expliquer (Pokémon sans Pokédex : variantes, cartes spéciales)', 'info'
    from public.cards c where c.category = 'Pokémon' and not exists (select 1 from public.card_pokemon p where p.card_id = c.id)
  union all select 5, 'cartes sans Pokédex commun avec l''ancre de leur famille', count(*), '0', 'zero'
    from public.cards c
    join public.card_entities e on e.id = c.card_entity_id
    join public.cards a on a.id = e.anchor_card_id
    where c.id <> a.id and c.category = 'Pokémon'
      and jsonb_typeof(c.dex_ids) = 'array' and jsonb_array_length(c.dex_ids) > 0
      and jsonb_typeof(a.dex_ids) = 'array' and jsonb_array_length(a.dex_ids) > 0
      and not exists (select 1 from jsonb_array_elements(c.dex_ids) x where a.dex_ids @> jsonb_build_array(x))
  union all select 6, 'doublons (même set, numéro, langue, nom, variante ET même image)', count(*), '0', 'zero'
    from (select 1 from public.cards where image_small is not null
          group by set_id, number, language, name, coalesce(variant_type, ''), image_small having count(*) > 1) d
  union all select 7, 'cartes avec search_text vide', count(*), '0', 'zero' from public.cards where search_text is null or btrim(search_text) = ''
  union all select 8, 'cartes Pokémon sans nom de recherche français', count(*), 'à expliquer (noms non reconnus)', 'info'
    from public.cards where category = 'Pokémon' and (search_name_fr is null or btrim(search_name_fr) = '')
  union all select 9, 'sets sans série', count(*), '0', 'zero' from public.sets where series_id is null
  union all select 10, 'sets dans la série « Autre »', count(*), 'à classer à la main (30 connus)', 'info' from public.sets where series_id = 'autre'
  union all select 11, 'sets sans date de sortie', count(*), 'à compléter (262 connus)', 'info' from public.sets where release_date is null
  union all select 12, 'sets affichés en nom généré', count(*), 'à renommer au fil du temps', 'info' from public.sets_display where display_source = 'genere'
  union all select 13, 'sets non publiés (chinois simplifié)', count(*), '232 tant que l''auteur n''a pas répondu', 'info' from public.sets where not is_published
  union all select 14, 'cartes sans image', count(*), 'à compléter (2 921 FR connues)', 'info' from public.cards where image_small is null
  union all select 15, 'cartes sans code de rareté', count(*), 'accepté (promos JP, ★★/★★★ chinois…)', 'info' from public.cards where rarity_code is null
  union all select 16, 'cartes sans illustrateur', count(*), 'accepté (678 FR connues)', 'info' from public.cards where illustrator_id is null
  union all select 17, 'tables publiques sans RLS', count(*), '0', 'zero'
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all select 18, 'fonctions internes exécutables par anon', count(*), '0', 'zero'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_set_calendar','apply_set_series','apply_set_translations','generate_search_name_fr','refresh_search_text')
      and has_function_privilege('anon', p.oid, 'execute')
  union all select 19, 'recherche « dracaufeu » (attendu 390)', max(total_count), '390', 'val390' from public.search_cards('dracaufeu', p_limit => 1)
  union all select 20, 'recherche « mystherbe erika » (attendu 6)', max(total_count), '6', 'val6' from public.search_cards('mystherbe erika')
  union all select 21, 'recherche « ho-oh luth » (attendu 27)', max(total_count), '27', 'val27' from public.search_cards('ho-oh luth')
)
select ordre, controle, n, attendu,
       case mode when 'zero' then case when n = 0 then 'OK' else 'A VOIR' end
                 when 'info' then 'INFO'
                 when 'val390' then case when n = 390 then 'OK' else 'A VOIR' end
                 when 'val6' then case when n = 6 then 'OK' else 'A VOIR' end
                 when 'val27' then case when n = 27 then 'OK' else 'A VOIR' end end as statut
from ind order by ordre;
