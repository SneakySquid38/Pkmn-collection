-- Krikrou collection · Phase 5 : classeurs manuels
-- Un classeur est une vue sur le catalogue, jamais une copie de la collection :
-- chaque case pointe vers une carte précise, possédée ou non (« à trouver »).
-- 1. binders : un classeur (propriétaire, nom, cases par page : 2, 3, 4, 6, 9 ou 12, nombre de pages).
-- 2. binder_slots : une ligne par case remplie. « position » compte les cases depuis le début du classeur
--    (0 = page 1 en haut à gauche) ; une case vide n'a pas de ligne. Changer le format de page garde
--    l'ordre des cartes, elles se répartissent simplement sur plus ou moins de pages.
-- 3. move_binder_slot(classeur, de, vers) : déplace une carte, en échangeant si la case d'arrivée est prise.
-- Mêmes règles que la collection : lisibles par les membres connectés, modifiables par le propriétaire.
-- Retour arrière : drop function public.move_binder_slot(uuid, int, int);
--                  drop table public.binder_slots; drop table public.binders;
--
-- 1) Lance tel quel (ROLLBACK à la fin) : l'aperçu liste les règles des deux tables.
-- 2) Remplace le dernier ROLLBACK par COMMIT et relance.
-- 3) Lance ensuite 08-test-classeurs.sql (test des droits, rien n'est conservé).

begin;

-- 1. Classeurs
create table public.binders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slots_per_page smallint not null default 9 check (slots_per_page in (2, 3, 4, 6, 9, 12)),
  pages smallint not null default 1 check (pages between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index binders_user_id_idx on public.binders (user_id);

-- 2. Cases remplies
create table public.binder_slots (
  binder_id uuid not null references public.binders(id) on delete cascade,
  position integer not null check (position between 0 and 2399), -- 200 pages de 12 cases au plus
  card_id uuid not null references public.cards(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (binder_id, position)
);
create index binder_slots_card_id_idx on public.binder_slots (card_id);

alter table public.binders enable row level security;
create policy "Classeurs visibles par les membres" on public.binders
  for select to authenticated using (true);
create policy "Créer ses classeurs" on public.binders
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Modifier ses classeurs" on public.binders
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Supprimer ses classeurs" on public.binders
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.binder_slots enable row level security;
create policy "Cases visibles par les membres" on public.binder_slots
  for select to authenticated using (true);
create policy "Remplir ses classeurs" on public.binder_slots
  for insert to authenticated
  with check (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid())));
create policy "Modifier les cases de ses classeurs" on public.binder_slots
  for update to authenticated
  using (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid())))
  with check (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid())));
create policy "Vider les cases de ses classeurs" on public.binder_slots
  for delete to authenticated
  using (exists (select 1 from public.binders b where b.id = binder_id and b.user_id = (select auth.uid())));

revoke all on public.binders, public.binder_slots from public, anon, authenticated;
grant select, insert, update, delete on public.binders, public.binder_slots to authenticated;

-- 3. Déplacer une carte (échange si la case d'arrivée est occupée), en une seule fois.
-- Droits de l'utilisateur connecté : chez quelqu'un d'autre, rien n'est modifié (refus).
create or replace function public.move_binder_slot(p_binder uuid, p_from integer, p_to integer)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_capacite integer;
  v_depart uuid;
  v_arrivee uuid;
begin
  select b.pages * b.slots_per_page into v_capacite
  from public.binders b
  where b.id = p_binder and b.user_id = (select auth.uid())
  for update;
  if v_capacite is null then raise exception 'Classeur introuvable'; end if;
  if p_to < 0 or p_to >= v_capacite then raise exception 'Case hors du classeur'; end if;
  if p_from = p_to then return; end if;

  select card_id into v_depart from public.binder_slots where binder_id = p_binder and position = p_from;
  if v_depart is null then raise exception 'Case de départ vide'; end if;
  select card_id into v_arrivee from public.binder_slots where binder_id = p_binder and position = p_to;

  delete from public.binder_slots where binder_id = p_binder and position in (p_from, p_to);
  insert into public.binder_slots (binder_id, position, card_id) values (p_binder, p_to, v_depart);
  if v_arrivee is not null then
    insert into public.binder_slots (binder_id, position, card_id) values (p_binder, p_from, v_arrivee);
  end if;
  update public.binders set updated_at = now() where id = p_binder;
end
$fn$;

revoke all on function public.move_binder_slot(uuid, integer, integer) from public, anon;
grant execute on function public.move_binder_slot(uuid, integer, integer) to authenticated;

-- Aperçu : les règles des deux tables.
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('binders', 'binder_slots')
order by tablename, cmd;

rollback;
