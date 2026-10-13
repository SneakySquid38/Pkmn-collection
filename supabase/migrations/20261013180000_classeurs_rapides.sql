-- Classeurs automatiques plus rapides (phase 6) : classeur_cards ne met dans la requête que les filtres choisis,
-- ce qui permet à Postgres de partir directement du Pokémon, de l'illustrateur ou du set (200-500 ms → 5-15 ms).
-- Même résultat qu'avant. Supprime aussi un index en double sur cards.card_entity_id.

create or replace function public.classeur_cards(p_rule jsonb, p_limit integer default 2400)
returns table(card_id uuid, name text, search_name_fr text, language text, number text, image_small text, set_id uuid, set_display_name text)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_langues text[] := coalesce(nullif(array(select jsonb_array_elements_text(p_rule->'langues')), '{}'), array['FR']);
  v_pokemon uuid := nullif(p_rule->>'pokemon', '')::uuid;
  v_illustrateur uuid := nullif(p_rule->>'illustrateur', '')::uuid;
  v_serie text := nullif(p_rule->>'serie', '');
  v_set uuid := nullif(p_rule->>'set', '')::uuid;
  v_rarete text := nullif(p_rule->>'rarete', '');
  v_categorie text := nullif(p_rule->>'categorie', '');
  v_annee int := nullif(p_rule->>'annee', '')::int;
  v_nom text := nullif(btrim(extensions.unaccent(lower(coalesce(p_rule->>'nom', '')))), '');
  v_limite int := greatest(1, least(coalesce(p_limit, 2400), 2400));
  filtres text := '';
begin
  -- Seuls les filtres choisis entrent dans la requête : Postgres peut alors partir du Pokémon, du set…
  if v_pokemon is not null then
    filtres := filtres || ' and exists (select 1 from public.card_pokemon p where p.card_id = c.id and p.pokemon_entity_id = $2)';
  end if;
  if v_illustrateur is not null then filtres := filtres || ' and c.illustrator_id = $3'; end if;
  if v_serie is not null then filtres := filtres || ' and s.series_id = $4'; end if;
  if v_set is not null then filtres := filtres || ' and c.set_id = $5'; end if;
  if v_rarete is not null then filtres := filtres || ' and c.rarity_code = $6'; end if;
  if v_categorie is not null then filtres := filtres || ' and c.category = $7'; end if;
  if v_annee is not null then filtres := filtres || ' and extract(year from s.release_date) = $8'; end if;
  if v_nom is not null then
    filtres := filtres || ' and extensions.unaccent(lower(coalesce(c.search_name_fr, '''') || '' '' || c.name)) like ''%'' || $9 || ''%''';
  end if;

  return query execute
    'select c.id, c.name, c.search_name_fr, c.language, c.number, c.image_small, c.set_id, d.display_name
     from public.cards c
     join public.sets s on s.id = c.set_id and s.is_published
     join public.sets_display d on d.set_id = c.set_id
     where c.language = any ($1)' || filtres || '
     order by s.release_date nulls last, s.id, c.sort_number nulls last, c.number
     limit $10'
  using v_langues, v_pokemon, v_illustrateur, v_serie, v_set, v_rarete, v_categorie, v_annee, v_nom, v_limite;
end
$fn$;

revoke all on function public.classeur_cards(jsonb, integer) from public, anon;
grant execute on function public.classeur_cards(jsonb, integer) to authenticated, service_role;

drop index if exists public.cards_card_entity_idx; -- doublon exact de idx_cards_card_entity
