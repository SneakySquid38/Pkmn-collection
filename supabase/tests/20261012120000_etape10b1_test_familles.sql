-- Étape 10b1 : test à blanc de apply_asia_families()
-- À blanc : rollback final, rien n'est conservé. Attendu : tous les compteurs à 0.
begin;
set local statement_timeout = '15min';
select 'familles : ' || etape as controle, n from public.apply_asia_families();
rollback;
