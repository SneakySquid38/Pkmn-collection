import type { SupabaseClient } from "@supabase/supabase-js";

export const PRIORITES = [
  { valeur: 1, label: "Très envie" },
  { valeur: 2, label: "Envie" },
  { valeur: 3, label: "Un jour" },
] as const;

export function libellePriorite(p: number) {
  return PRIORITES.find((x) => x.valeur === p)?.label ?? "Envie";
}

export type Membre = { id: string; prenom: string };

// Tous les membres du site (Hugo, Louise…), l'utilisateur connecté en premier.
export async function lireMembres(supabase: SupabaseClient, moi: string): Promise<Membre[]> {
  const { data } = await supabase.from("profiles").select("id, display_name").order("display_name");
  const membres = (data ?? []).map((p) => ({ id: p.id as string, prenom: (p.display_name as string | null) ?? "Membre" }));
  return [...membres.filter((m) => m.id === moi), ...membres.filter((m) => m.id !== moi)];
}

// Cartes possédées par un membre : quantité par carte, et par famille multilingue
// (une tuile de recherche représente toute la famille JP/KR/CN).
export async function lirePossessions(supabase: SupabaseClient, membre: string) {
  const { data } = await supabase
    .from("collection_items")
    .select("card_id, quantity, cards(card_entity_id)")
    .eq("user_id", membre)
    .limit(10000);
  const parCarte = new Map<string, number>();
  const parFamille = new Map<string, number>();
  for (const l of data ?? []) {
    parCarte.set(l.card_id, l.quantity);
    const famille = (l.cards as unknown as { card_entity_id: string | null } | null)?.card_entity_id;
    if (famille) parFamille.set(famille, (parFamille.get(famille) ?? 0) + l.quantity);
  }
  return { parCarte, parFamille };
}

export type CarteListe = {
  card_id: string;
  nom: string;
  language: string;
  number: string | null;
  image_small: string | null;
  set_nom: string | null;
  quantite?: number;
  priorite?: number;
  possedee?: boolean;
};

type LigneCarte = {
  id: string;
  name: string;
  search_name_fr: string | null;
  language: string;
  number: string | null;
  image_small: string | null;
  set_id: string;
};

const CHAMPS_CARTE = "id, name, search_name_fr, language, number, image_small, set_id";

async function nomsSets(supabase: SupabaseClient, cartes: LigneCarte[]) {
  const ids = [...new Set(cartes.map((c) => c.set_id))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabase.from("sets_display").select("set_id, display_name").in("set_id", ids);
  return new Map((data ?? []).map((s) => [s.set_id as string, s.display_name as string]));
}

function versListe(c: LigneCarte, sets: Map<string, string>): CarteListe {
  return {
    card_id: c.id,
    nom: c.search_name_fr ?? c.name,
    language: c.language,
    number: c.number,
    image_small: c.image_small,
    set_nom: sets.get(c.set_id) ?? null,
  };
}

// Collection d'un membre, les ajouts les plus récents d'abord.
export async function lireCollection(supabase: SupabaseClient, membre: string) {
  const { data, error } = await supabase
    .from("collection_items")
    .select(`quantity, added_at, cards(${CHAMPS_CARTE})`)
    .eq("user_id", membre)
    .order("added_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []).filter((l) => l.cards) as unknown as { quantity: number; cards: LigneCarte }[];
  const sets = await nomsSets(supabase, lignes.map((l) => l.cards));
  return lignes.map((l) => ({ ...versListe(l.cards, sets), quantite: l.quantity }));
}

// Envies d'un membre, triées par priorité puis les plus récentes ; « possédée » si le membre l'a déjà.
export async function lireEnvies(supabase: SupabaseClient, membre: string) {
  const { data, error } = await supabase
    .from("wishlist_items")
    .select(`priority, added_at, cards(${CHAMPS_CARTE})`)
    .eq("user_id", membre)
    .order("priority")
    .order("added_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []).filter((l) => l.cards) as unknown as { priority: number; cards: LigneCarte }[];
  const [sets, { parCarte }] = await Promise.all([
    nomsSets(supabase, lignes.map((l) => l.cards)),
    lirePossessions(supabase, membre),
  ]);
  return lignes.map((l) => ({ ...versListe(l.cards, sets), priorite: l.priority, possedee: parCarte.has(l.cards.id) }));
}
