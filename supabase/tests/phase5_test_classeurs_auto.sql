-- Krikrou collection · Test après 09-classeurs-auto.sql (à lancer APRÈS son COMMIT)
-- À coller dans Supabase > SQL Editor, puis Run. Finit volontairement en ERREUR rouge
-- « TEST (annulé) : ... » : l'erreur annule tout, aucune donnée n'est modifiée.
--
-- Résultat attendu :
--   binder par défaut=binder | classeur sans filtre=refusé | Hugo crée classeur=1 | cartes du classeur=N (plus de 0)
--   | case dans un classeur=refusé | case dans un binder=1 | Louise lit le classeur=1 | Louise modifie=0
--   | visiteur cartes du classeur=refusé

do $$
declare
  h uuid := (select id from public.profiles where display_name = 'Hugo');
  l uuid := (select id from public.profiles where display_name = 'Louise');
  ill uuid := (select c.illustrator_id from public.cards c join public.sets s on s.id = c.set_id
               where c.language = 'JP' and c.illustrator_id is not null and s.is_published limit 1);
  a uuid := (select id from public.cards order by id limit 1);
  k uuid; b uuid; n int; r text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.binders (name) values ('Binder test') returning id into b;
  select kind into r from public.binders where id = b; r := 'binder par défaut=' || r;
  begin
    insert into public.binders (name, kind) values ('Sans filtre', 'classeur'); r := r || ' | classeur sans filtre=OUI (PROBLÈME)';
  exception when others then r := r || ' | classeur sans filtre=refusé';
  end;
  insert into public.binders (name, kind, rule)
  values ('Classeur test', 'classeur', jsonb_build_object('langues', jsonb_build_array('JP'), 'illustrateur', ill))
  returning id into k;
  select count(*) into n from public.binders where id = k; r := r || ' | Hugo crée classeur=' || n;
  select count(*) into n from public.classeur_cards((select rule from public.binders where id = k));
  r := r || ' | cartes du classeur=' || n;
  begin
    insert into public.binder_slots (binder_id, position, card_id) values (k, 0, a); r := r || ' | case dans un classeur=OUI (PROBLÈME)';
  exception when others then r := r || ' | case dans un classeur=refusé';
  end;
  insert into public.binder_slots (binder_id, position, card_id) values (b, 0, a);
  get diagnostics n = row_count; r := r || ' | case dans un binder=' || n;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', l, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.binders where id = k; r := r || ' | Louise lit le classeur=' || n;
  update public.binders set rule = '{"langues":["FR"]}' where id = k; get diagnostics n = row_count; r := r || ' | Louise modifie=' || n;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.classeur_cards('{"langues":["JP"]}'); r := r || ' | visiteur cartes du classeur=' || n;
  exception when others then r := r || ' | visiteur cartes du classeur=refusé';
  end;
  execute 'reset role';

  raise exception 'TEST (annulé) : %', r;
end $$;
