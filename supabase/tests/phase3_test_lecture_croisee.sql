-- Krikrou collection · Test après la phase 3 (à lancer APRÈS le COMMIT de 04-collection-envies.sql)
-- À coller dans Supabase > SQL Editor, puis Run.
-- Le résultat s'affiche comme une ERREUR rouge « TEST (annulé) : ... » : c'est voulu,
-- l'erreur annule tout ce que le test a fait. Aucune donnée n'est modifiée.
--
-- Résultat attendu :
--   Louise lit Hugo=1 | Louise modifie Hugo=0 | Louise supprime Hugo=0 | Louise ajoute chez Hugo=refusé
--   | Louise transfère vers Hugo=refusé | Louise lit envies Hugo=1 | Louise modifie envie Hugo=0
--   | Louise supprime envie Hugo=0 | Louise ajoute envie chez Hugo=refusé
--   | visiteur lit collections=refusé | visiteur lit envies=refusé

do $$
declare
  h uuid := (select id from public.profiles where display_name = 'Hugo');
  l uuid := (select id from public.profiles where display_name = 'Louise');
  c uuid := (select id from public.cards limit 1);
  c2 uuid := (select id from public.cards offset 1 limit 1);
  n int; r text := '';
begin
  insert into public.collection_items (user_id, card_id, quantity) values (h, c, 1), (l, c, 1);
  insert into public.wishlist_items (user_id, card_id) values (h, c), (l, c);

  -- Louise connectée
  perform set_config('request.jwt.claims', json_build_object('sub', l, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.collection_items where user_id = h; r := r || 'Louise lit Hugo=' || n;
  update public.collection_items set quantity = 99 where user_id = h; get diagnostics n = row_count; r := r || ' | Louise modifie Hugo=' || n;
  delete from public.collection_items where user_id = h; get diagnostics n = row_count; r := r || ' | Louise supprime Hugo=' || n;
  begin
    insert into public.collection_items (user_id, card_id) values (h, c2); r := r || ' | Louise ajoute chez Hugo=OUI (PROBLÈME)';
  exception when others then r := r || ' | Louise ajoute chez Hugo=refusé';
  end;
  begin
    update public.collection_items set user_id = h where user_id = l; get diagnostics n = row_count; r := r || ' | Louise transfère vers Hugo=' || n;
  exception when others then r := r || ' | Louise transfère vers Hugo=refusé';
  end;
  select count(*) into n from public.wishlist_items where user_id = h; r := r || ' | Louise lit envies Hugo=' || n;
  update public.wishlist_items set priority = 1 where user_id = h; get diagnostics n = row_count; r := r || ' | Louise modifie envie Hugo=' || n;
  delete from public.wishlist_items where user_id = h; get diagnostics n = row_count; r := r || ' | Louise supprime envie Hugo=' || n;
  begin
    insert into public.wishlist_items (user_id, card_id) values (h, c2); r := r || ' | Louise ajoute envie chez Hugo=OUI (PROBLÈME)';
  exception when others then r := r || ' | Louise ajoute envie chez Hugo=refusé';
  end;
  execute 'reset role';

  -- Visiteur non connecté
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.collection_items; r := r || ' | visiteur lit collections=' || n;
  exception when others then r := r || ' | visiteur lit collections=refusé';
  end;
  begin
    select count(*) into n from public.wishlist_items; r := r || ' | visiteur lit envies=' || n;
  exception when others then r := r || ' | visiteur lit envies=refusé';
  end;
  execute 'reset role';

  raise exception 'TEST (annulé) : %', r;
end $$;
