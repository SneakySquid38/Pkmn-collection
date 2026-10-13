-- Krikrou collection · Test après la phase 5 (à lancer APRÈS le COMMIT de 07-classeurs.sql)
-- À coller dans Supabase > SQL Editor, puis Run.
-- Le résultat s'affiche comme une ERREUR rouge « TEST (annulé) : ... » : c'est voulu,
-- l'erreur annule tout ce que le test a fait. Aucune donnée n'est modifiée.
--
-- Résultat attendu :
--   Hugo crée=1 | Hugo remplit=3 | Hugo déplace=ok (A en 5, B en 0) | Hugo échange=ok (A en 0, B en 5)
--   | Hugo déplace hors classeur=refusé | Louise lit classeur=1 | Louise lit cases=3
--   | Louise renomme=0 | Louise supprime=0 | Louise vide case=0 | Louise remplit chez Hugo=refusé
--   | Louise déplace chez Hugo=refusé | Louise vole classeur=refusé | suppression classeur vide les cases=0
--   | visiteur lit classeurs=refusé | visiteur lit cases=refusé

do $$
declare
  h uuid := (select id from public.profiles where display_name = 'Hugo');
  l uuid := (select id from public.profiles where display_name = 'Louise');
  a uuid := (select id from public.cards order by id limit 1);
  b uuid := (select id from public.cards order by id offset 1 limit 1);
  c uuid := (select id from public.cards order by id offset 2 limit 1);
  k uuid;
  n int; r text := '';
begin
  -- Hugo connecté
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.binders (name, slots_per_page, pages) values ('Test', 9, 1) returning id into k;
  select count(*) into n from public.binders where id = k and user_id = h; r := r || 'Hugo crée=' || n;
  insert into public.binder_slots (binder_id, position, card_id) values (k, 0, a), (k, 1, b), (k, 2, c);
  get diagnostics n = row_count; r := r || ' | Hugo remplit=' || n;
  perform public.move_binder_slot(k, 0, 5);
  perform public.move_binder_slot(k, 1, 0);
  r := r || ' | Hugo déplace=' || case when (select card_id from public.binder_slots where binder_id = k and position = 5) = a
                                         and (select card_id from public.binder_slots where binder_id = k and position = 0) = b
                                       then 'ok (A en 5, B en 0)' else 'PROBLÈME' end;
  perform public.move_binder_slot(k, 5, 0);
  r := r || ' | Hugo échange=' || case when (select card_id from public.binder_slots where binder_id = k and position = 0) = a
                                        and (select card_id from public.binder_slots where binder_id = k and position = 5) = b
                                      then 'ok (A en 0, B en 5)' else 'PROBLÈME' end;
  begin
    perform public.move_binder_slot(k, 0, 9); r := r || ' | Hugo déplace hors classeur=OUI (PROBLÈME)';
  exception when others then r := r || ' | Hugo déplace hors classeur=refusé';
  end;
  execute 'reset role';

  -- Louise connectée
  perform set_config('request.jwt.claims', json_build_object('sub', l, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.binders where id = k; r := r || ' | Louise lit classeur=' || n;
  select count(*) into n from public.binder_slots where binder_id = k; r := r || ' | Louise lit cases=' || n;
  update public.binders set name = 'Piraté' where id = k; get diagnostics n = row_count; r := r || ' | Louise renomme=' || n;
  delete from public.binders where id = k; get diagnostics n = row_count; r := r || ' | Louise supprime=' || n;
  delete from public.binder_slots where binder_id = k; get diagnostics n = row_count; r := r || ' | Louise vide case=' || n;
  begin
    insert into public.binder_slots (binder_id, position, card_id) values (k, 7, a); r := r || ' | Louise remplit chez Hugo=OUI (PROBLÈME)';
  exception when others then r := r || ' | Louise remplit chez Hugo=refusé';
  end;
  begin
    perform public.move_binder_slot(k, 0, 8); r := r || ' | Louise déplace chez Hugo=OUI (PROBLÈME)';
  exception when others then r := r || ' | Louise déplace chez Hugo=refusé';
  end;
  begin
    update public.binders set user_id = l where id = k; get diagnostics n = row_count;
    r := r || ' | Louise vole classeur=' || case when n = 0 then 'refusé' else 'OUI (PROBLÈME)' end;
  exception when others then r := r || ' | Louise vole classeur=refusé';
  end;
  execute 'reset role';

  -- Hugo supprime son classeur : les cases partent avec.
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.binders where id = k;
  select count(*) into n from public.binder_slots where binder_id = k; r := r || ' | suppression classeur vide les cases=' || n;
  execute 'reset role';

  -- Visiteur non connecté
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.binders; r := r || ' | visiteur lit classeurs=' || n;
  exception when others then r := r || ' | visiteur lit classeurs=refusé';
  end;
  begin
    select count(*) into n from public.binder_slots; r := r || ' | visiteur lit cases=' || n;
  exception when others then r := r || ' | visiteur lit cases=refusé';
  end;
  execute 'reset role';

  raise exception 'TEST (annulé) : %', r;
end $$;
