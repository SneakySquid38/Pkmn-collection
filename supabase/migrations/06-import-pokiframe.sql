-- Krikrou collection · Phase 4 : import Pokiframe
-- 1. match_pokiframe(lignes) : retrouve chaque ligne du fichier dans le catalogue
--    (code de set + numéro, sinon nom du set + numéro, toujours dans la bonne langue).
-- 2. Valeur des cartes : collection_items reçoit le prix Pokiframe (market_price, en euros).
-- 3. Trace des imports : import_lots (un par fichier importé) et import_lines (une par ligne du fichier),
--    visibles seulement par leur propriétaire.
-- 4. apply_pokiframe_import(...) écrit tout en une transaction ; undo_import(lot) l'annule.
-- Les fonctions s'exécutent avec les droits de l'utilisateur connecté (RLS appliquée) :
-- chacun ne peut écrire que dans sa propre collection.
-- Retour arrière : drop function des 3 fonctions, drop table import_lines, import_lots,
-- alter table collection_items drop column market_price, drop column market_price_at.
--
-- 1) Lance tel quel (ROLLBACK à la fin) : l'aperçu montre la reconnaissance de 4 lignes de test.
-- 2) Remplace le dernier ROLLBACK par COMMIT et relance.

begin;

-- 1. Correspondance
create or replace function public.match_pokiframe(p_lignes jsonb)
returns table(i int, card_ids uuid[], methode text)
language sql stable
set search_path = public, pg_temp
as $fn$
  with l as (
    select (x->>'i')::int as i,
           nullif(lower(regexp_replace(btrim(coalesce(x->>'code', '')), '-TW$', '', 'i')), '') as code,
           nullif(lower(btrim(coalesce(x->>'set', ''))), '') as set_nom,
           nullif(upper(ltrim(split_part(btrim(coalesce(x->>'num', '')), '/', 1), '0')), '') as num,
           case upper(x->>'lang')
             when 'FRENCH' then array['FR'] when 'JAPANESE' then array['JP']
             when 'KOREAN' then array['KR'] when 'CHINESE' then array['TC', 'SC']
             else array[]::text[] end as langues
    from jsonb_array_elements(p_lignes) x
  ),
  par_code as (
    select l.i, c.id, c.variant_type
    from l
    join public.sets s on lower(s.code) = l.code and s.language = any (l.langues)
    join public.cards c on c.set_id = s.id and upper(ltrim(c.number, '0')) = l.num
    where l.code is not null and l.num is not null
  ),
  par_nom as (
    select l.i, c.id, c.variant_type
    from l
    join public.sets s on s.language = any (l.langues)
     and (lower(s.name) = l.set_nom
          or lower(substring(s.name from '「(.*)」')) = l.set_nom  -- noms coréens « … 「Nom」 »
          or exists (select 1 from public.set_translations t where t.set_id = s.id and lower(t.name) = l.set_nom))
    join public.cards c on c.set_id = s.id and upper(ltrim(c.number, '0')) = l.num
    where l.set_nom is not null and l.num is not null
      and not exists (select 1 from par_code p where p.i = l.i)
  ),
  tout as (
    select i, id, variant_type, 'code' as methode from par_code
    union all
    select i, id, variant_type, 'nom' from par_nom
  ),
  -- Une seconde impression (alt_print) ne crée pas d'ambiguïté si l'impression principale existe.
  tri as (
    select t.*, bool_or(t.variant_type is distinct from 'alt_print') over (partition by t.i) as a_principale
    from tout t
  )
  select l.i,
         coalesce(array_agg(t.id order by t.id) filter (where t.id is not null and (not t.a_principale or t.variant_type is distinct from 'alt_print')), array[]::uuid[]),
         max(t.methode)
  from l left join tri t on t.i = l.i
  group by l.i
  order by l.i;
$fn$;

revoke execute on function public.match_pokiframe(jsonb) from public, anon;
grant execute on function public.match_pokiframe(jsonb) to authenticated;

-- 2. Valeur des cartes (prix Pokiframe au moment de l'import)
alter table public.collection_items
  add column market_price numeric(10, 2) check (market_price >= 0),
  add column market_price_at timestamptz;

-- 3. Trace des imports
create table public.import_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  source text not null default 'pokiframe',
  file_name text check (char_length(file_name) <= 200),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index import_lots_user_idx on public.import_lots (user_id, created_at desc);

create table public.import_lines (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.import_lots(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  external_id text not null check (char_length(external_id) <= 100), -- identifiant Pokiframe de la ligne
  card_id uuid references public.cards(id) on delete set null,
  quantity integer not null default 0,        -- exemplaires ajoutés (ou retirés si négatif) par ce lot
  price numeric(10, 2),
  status text not null check (status in ('importee', 'deja_importee', 'introuvable', 'retiree')),
  removed_by_lot uuid references public.import_lots(id) on delete set null, -- pour « retiree »
  payload jsonb not null default '{}'::jsonb  -- nom, set, numéro, langue tels que dans le fichier
);
create index import_lines_lot_idx on public.import_lines (lot_id);
create index import_lines_user_ext_idx on public.import_lines (user_id, external_id);

alter table public.import_lots enable row level security;
alter table public.import_lines enable row level security;
create policy "Voir ses imports" on public.import_lots for select to authenticated using ((select auth.uid()) = user_id);
create policy "Créer ses imports" on public.import_lots for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Annuler ses imports" on public.import_lots for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Voir ses lignes importées" on public.import_lines for select to authenticated using ((select auth.uid()) = user_id);
create policy "Créer ses lignes importées" on public.import_lines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Modifier ses lignes importées" on public.import_lines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.import_lots, public.import_lines from public, anon, authenticated;
grant select, insert, update on public.import_lots, public.import_lines to authenticated;

-- Ajoute (ou retire si négatif) des exemplaires dans la collection de l'utilisateur connecté.
create or replace function public.ajuster_collection(p_card uuid, p_ecart integer, p_prix numeric default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  moi uuid := auth.uid();
begin
  if p_ecart > 0 then
    insert into public.collection_items (user_id, card_id, quantity, market_price, market_price_at)
    values (moi, p_card, p_ecart, p_prix, case when p_prix is not null then now() end)
    on conflict (user_id, card_id) do update
      set quantity = collection_items.quantity + excluded.quantity,
          market_price = coalesce(excluded.market_price, collection_items.market_price),
          market_price_at = coalesce(excluded.market_price_at, collection_items.market_price_at);
  elsif p_ecart < 0 then
    update public.collection_items set quantity = quantity + p_ecart
    where user_id = moi and card_id = p_card and quantity + p_ecart > 0;
    if not found then
      delete from public.collection_items where user_id = moi and card_id = p_card;
    end if;
  elsif p_prix is not null then
    update public.collection_items set market_price = p_prix, market_price_at = now()
    where user_id = moi and card_id = p_card;
  end if;
end
$fn$;

-- 4. Import en une transaction.
-- p_lignes : [{ "external_id", "card_id" (ou null), "quantity", "price", "payload" }]
-- p_retirer : lignes d'imports précédents (import_lines.id) dont la carte n'est plus dans le fichier
--             et que l'utilisateur a choisi de retirer de sa collection.
create or replace function public.apply_pokiframe_import(p_fichier text, p_lignes jsonb, p_retirer uuid[] default '{}')
returns uuid
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  moi uuid := auth.uid();
  lot uuid;
  l record;
  deja_carte uuid;
  deja_qte int;
  ecart int;
begin
  if moi is null then raise exception 'Non connecté'; end if;
  insert into public.import_lots (user_id, file_name) values (moi, left(p_fichier, 200)) returning id into lot;

  for l in
    select x->>'external_id' as ext, nullif(x->>'card_id', '')::uuid as card,
           greatest(coalesce((x->>'quantity')::int, 1), 1) as qte,
           (x->>'price')::numeric as prix, coalesce(x->'payload', '{}'::jsonb) as payload
    from jsonb_array_elements(p_lignes) x
    where coalesce(x->>'external_id', '') <> ''
  loop
    -- Déjà importée par un lot encore actif : on n'applique que la différence de quantité.
    deja_carte := null;
    deja_qte := 0;
    select li.card_id, sum(li.quantity)::int into deja_carte, deja_qte
    from public.import_lines li join public.import_lots lo on lo.id = li.lot_id
    where li.user_id = moi and li.external_id = l.ext and li.status in ('importee', 'retiree')
      and lo.undone_at is null and li.card_id is not null
    group by li.card_id
    limit 1;

    if deja_carte is not null then
      ecart := l.qte - coalesce(deja_qte, 0);
      perform public.ajuster_collection(deja_carte, ecart, l.prix);
      insert into public.import_lines (lot_id, user_id, external_id, card_id, quantity, price, status, payload)
      values (lot, moi, l.ext, deja_carte, ecart, l.prix, case when ecart = 0 then 'deja_importee' else 'importee' end, l.payload);
    elsif l.card is not null then
      perform public.ajuster_collection(l.card, l.qte, l.prix);
      insert into public.import_lines (lot_id, user_id, external_id, card_id, quantity, price, status, payload)
      values (lot, moi, l.ext, l.card, l.qte, l.prix, 'importee', l.payload);
    else
      insert into public.import_lines (lot_id, user_id, external_id, card_id, quantity, price, status, payload)
      values (lot, moi, l.ext, null, 0, l.prix, 'introuvable', l.payload);
    end if;
  end loop;

  -- Cartes qui ne sont plus dans le fichier, retirées à la demande.
  for l in
    select li.external_id as ext, li.card_id as card, sum(li.quantity)::int as qte
    from public.import_lines li join public.import_lots lo on lo.id = li.lot_id
    where li.user_id = moi and li.status in ('importee', 'retiree') and lo.undone_at is null and li.card_id is not null
      and li.external_id in (select r.external_id from public.import_lines r where r.id = any (p_retirer) and r.user_id = moi)
    group by li.external_id, li.card_id
    having sum(li.quantity) > 0
  loop
    perform public.ajuster_collection(l.card, -l.qte);
    insert into public.import_lines (lot_id, user_id, external_id, card_id, quantity, status, removed_by_lot)
    values (lot, moi, l.ext, l.card, -l.qte, 'retiree', lot);
  end loop;

  return lot;
end
$fn$;

-- Annule un import : chaque exemplaire ajouté est retiré, chaque carte retirée revient.
create or replace function public.undo_import(p_lot uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  moi uuid := auth.uid();
  l record;
begin
  perform 1 from public.import_lots where id = p_lot and user_id = moi and undone_at is null for update;
  if not found then raise exception 'Import introuvable ou déjà annulé'; end if;
  for l in
    select card_id, quantity from public.import_lines
    where lot_id = p_lot and user_id = moi and status in ('importee', 'retiree') and card_id is not null
  loop
    perform public.ajuster_collection(l.card_id, -l.quantity);
  end loop;
  update public.import_lots set undone_at = now() where id = p_lot and user_id = moi;
end
$fn$;

revoke execute on function public.ajuster_collection(uuid, integer, numeric) from public, anon;
revoke execute on function public.apply_pokiframe_import(text, jsonb, uuid[]) from public, anon;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.ajuster_collection(uuid, integer, numeric) to authenticated;
grant execute on function public.apply_pokiframe_import(text, jsonb, uuid[]) to authenticated;
grant execute on function public.undo_import(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Aperçu 1 : 4 lignes de ton fichier (attendu : 1 carte pour les 3 premières, 0 pour Ninja Spinner).
select m.i, cardinality(m.card_ids) as cartes_trouvees, m.methode, c.search_name_fr, c.language, c.number
from public.match_pokiframe('[
  {"i":0,"code":"sm12A","set":"Tag Team GX All Stars","num":"102","lang":"JAPANESE"},
  {"i":1,"code":null,"set":"Flammes Fantasmagoriques","num":"104","lang":"FRENCH"},
  {"i":2,"code":"kr-470","set":"인페르노X","num":"113/080","lang":"KOREAN"},
  {"i":3,"code":null,"set":"Ninja Spinner","num":"085","lang":"JAPANESE"}]'::jsonb) m
left join public.cards c on c.id = m.card_ids[1]
order by m.i;

-- Aperçu 2 : import d'essai au nom de Hugo, réimport, retrait, puis annulation (tout est annulé par le ROLLBACK).
-- Attendu : apres_import=2 | apres_reimport=2 | apres_reimport_qte2=3 | apres_retrait=1 | apres_annulations=0
create function pg_temp.essai_import() returns text language plpgsql as $t$
declare
  h uuid := (select id from public.profiles where display_name = 'Hugo');
  c1 uuid := (select id from public.cards where language = 'FR' order by id limit 1);
  c2 uuid := (select id from public.cards where language = 'JP' order by id limit 1);
  lot1 uuid; lot2 uuid; lot3 uuid; lot4 uuid; n int; n0 int; r text := '';
  lignes jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  lignes := jsonb_build_array(
    jsonb_build_object('external_id', 'essai-1', 'card_id', c1, 'quantity', 1, 'price', 2.5),
    jsonb_build_object('external_id', 'essai-2', 'card_id', c2, 'quantity', 1, 'price', 10),
    jsonb_build_object('external_id', 'essai-3', 'card_id', null, 'quantity', 1));
  select coalesce(sum(quantity), 0) into n0 from public.collection_items where user_id = h and card_id in (c1, c2);
  lot1 := public.apply_pokiframe_import('essai.json', lignes);
  select coalesce(sum(quantity), 0) into n from public.collection_items where user_id = h and card_id in (c1, c2); n := n - n0; r := 'apres_import=' || n;
  lot2 := public.apply_pokiframe_import('essai.json', lignes);
  select coalesce(sum(quantity), 0) into n from public.collection_items where user_id = h and card_id in (c1, c2); n := n - n0; r := r || ' | apres_reimport=' || n;
  lignes := jsonb_set(lignes, '{1,quantity}', '2');
  lot3 := public.apply_pokiframe_import('essai.json', lignes);
  select coalesce(sum(quantity), 0) into n from public.collection_items where user_id = h and card_id in (c1, c2); n := n - n0; r := r || ' | apres_reimport_qte2=' || n;
  lot4 := public.apply_pokiframe_import('essai.json', jsonb_build_array(lignes->0),
            array(select id from public.import_lines where lot_id = lot1 and external_id = 'essai-2'));
  select coalesce(sum(quantity), 0) into n from public.collection_items where user_id = h and card_id in (c1, c2); n := n - n0; r := r || ' | apres_retrait=' || n;
  perform public.undo_import(lot4); perform public.undo_import(lot3); perform public.undo_import(lot2); perform public.undo_import(lot1);
  select coalesce(sum(quantity), 0) into n from public.collection_items where user_id = h and card_id in (c1, c2); n := n - n0; r := r || ' | apres_annulations=' || n;
  execute 'reset role';
  return r;
end $t$;
select pg_temp.essai_import() as resultat;

rollback;
