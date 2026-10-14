import type { SupabaseClient } from "@supabase/supabase-js";
import type { Filtres } from "@/lib/catalogue";
import { completerImages } from "@/lib/images";

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
  image_repli?: string | null; // langue de l'image empruntée à une autre version
  set_nom: string | null;
  quantite?: number;
  prix?: number | null; // valeur d'un exemplaire en euros (prix Pokiframe à l'import)
  priorite?: number;
  possedee?: boolean;
};

export type LigneCarte = {
  id: string;
  name: string;
  search_name_fr: string | null;
  language: string;
  number: string | null;
  image_small: string | null;
  set_id: string;
};

export const CHAMPS_CARTE = "id, name, search_name_fr, language, number, image_small, set_id";

export async function nomsSets(supabase: SupabaseClient, cartes: LigneCarte[]) {
  const ids = [...new Set(cartes.map((c) => c.set_id))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabase.from("sets_display").select("set_id, display_name").in("set_id", ids);
  return new Map((data ?? []).map((s) => [s.set_id as string, s.display_name as string]));
}

export function versListe(c: LigneCarte, sets: Map<string, string>): CarteListe {
  return {
    card_id: c.id,
    nom: c.search_name_fr ?? c.name,
    language: c.language,
    number: c.number,
    image_small: c.image_small,
    set_nom: sets.get(c.set_id) ?? null,
  };
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Collection d'un membre, les ajouts les plus récents d'abord.
// Les filtres (mêmes que la recherche) ne gardent que les cartes qui y répondent.
export async function lireCollection(supabase: SupabaseClient, membre: string, f?: Filtres) {
  const parSet = !!(f?.serie || f?.annee);
  const champs = `quantity, market_price, added_at, cards!inner(${CHAMPS_CARTE}${parSet ? ", sets!inner(series_id, release_date)" : ""})`;
  let requete = supabase.from("collection_items").select(champs).eq("user_id", membre);
  if (f) {
    // Texte : chaque mot doit apparaître dans le texte de recherche de la carte (noms FR/EN/local, set, illustrateur).
    for (const mot of sansAccents(f.q).split(/\s+/).filter(Boolean).slice(0, 5)) {
      requete = requete.like("cards.search_text", `%${mot.replace(/[%_\\]/g, "")}%`);
    }
    if (f.langues.length) requete = requete.in("cards.language", f.langues.flatMap((l) => (l === "CN" ? ["SC", "TC"] : [l])));
    if (f.rarete) requete = requete.eq("cards.rarity_code", f.rarete);
    if (f.set) requete = requete.eq("cards.set_id", f.set);
    if (f.illustrateur) requete = requete.eq("cards.illustrator_id", f.illustrateur);
    if (f.categorie) requete = requete.eq("cards.category", f.categorie);
    if (f.serie) requete = requete.eq("cards.sets.series_id", f.serie);
    if (f.annee) requete = requete.gte("cards.sets.release_date", `${f.annee}-01-01`).lte("cards.sets.release_date", `${f.annee}-12-31`);
  }
  const { data, error } = await requete.order("added_at", { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  const lignes = ((data ?? []) as unknown as { quantity: number; market_price: number | null; cards: LigneCarte | null }[]).filter(
    (l): l is { quantity: number; market_price: number | null; cards: LigneCarte } => !!l.cards,
  );
  const sets = await nomsSets(supabase, lignes.map((l) => l.cards));
  return completerImages(
    supabase,
    lignes.map((l) => ({ ...versListe(l.cards, sets), quantite: l.quantity, prix: l.market_price === null ? null : Number(l.market_price) })),
  );
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
  return completerImages(
    supabase,
    lignes.map((l) => ({ ...versListe(l.cards, sets), priorite: l.priority, possedee: parCarte.has(l.cards.id) })),
  );
}
