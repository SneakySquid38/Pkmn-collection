-- Étape 10b2 : test à blanc de apply_inherited_rarities() et apply_search_names(false)
-- À blanc : rollback final, rien n'est conservé. Attendu : tous les compteurs à 0.
begin;
set local statement_timeout = '15min';
select 'raretés : ' || etape as controle, n from public.apply_inherited_rarities()
union all
select 'noms : ' || etape, n from public.apply_search_names(false);
rollback;
