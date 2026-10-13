-- Étape 10b3 : contrôles (data_controls) — lecture seule
-- À blanc : rollback final, rien n'est conservé. Attendu : les lignes « zero » à OK, les lignes INFO sans importance.
begin;
set local statement_timeout = '15min';
select * from public.data_controls();
rollback;
