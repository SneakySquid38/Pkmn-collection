import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAMPS_CARTE, lirePossessions, nomsSets, versListe, type CarteListe, type LigneCarte } from "@/lib/collection";

// Formats de page proposés, avec leur disposition [colonnes, lignes] (pages de classeur du commerce).
export const FORMATS = [2, 3, 4, 6, 9, 12] as const;
export type Format = (typeof FORMATS)[number];
export const DISPOSITION: Record<Format, [number, number]> = {
  2: [2, 1],
  3: [3, 1],
  4: [2, 2],
  6: [2, 3],
  9: [3, 3],
  12: [3, 4],
};
export const PAGES_MAX = 200;
export const NOM_MAX = 80;

export function estFormat(n: unknown): n is Format {
  return FORMATS.includes(n as Format);
}

export type Classeur = {
  id: string;
  user_id: string;
  name: string;
  slots_per_page: Format;
  pages: number;
};

// Une case remplie : la carte, et si le propriétaire du classeur la possède.
export type Case = CarteListe & { position: number; possedee: boolean };

// État des cases de la première page, pour la vignette de couverture.
export type EtatCase = "possedee" | "a-trouver" | "vide";

export type ResumeClasseur = Classeur & {
  total: number; // cases remplies
  possedees: number; // cases dont la carte est dans la collection du propriétaire
  couverture: EtatCase[];
};

const CHAMPS_CLASSEUR = "id, user_id, name, slots_per_page, pages";

// Classeurs d'un membre, avec leur compteur « possédées / total ».
export async function lireClasseurs(supabase: SupabaseClient, membre: string): Promise<ResumeClasseur[]> {
  const { data, error } = await supabase
    .from("binders")
    .select(CHAMPS_CLASSEUR)
    .eq("user_id", membre)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const classeurs = (data ?? []) as Classeur[];
  if (!classeurs.length) return [];

  const [{ data: cases, error: e2 }, { parCarte }] = await Promise.all([
    supabase
      .from("binder_slots")
      .select("binder_id, position, card_id")
      .in("binder_id", classeurs.map((c) => c.id))
      .limit(20000),
    lirePossessions(supabase, membre),
  ]);
  if (e2) throw new Error(e2.message);

  return classeurs.map((c) => {
    const miennes = (cases ?? []).filter((s) => s.binder_id === c.id);
    const parPosition = new Map(miennes.map((s) => [s.position as number, s.card_id as string]));
    const couverture = Array.from({ length: c.slots_per_page }, (_, i): EtatCase => {
      const carte = parPosition.get(i);
      return !carte ? "vide" : parCarte.has(carte) ? "possedee" : "a-trouver";
    });
    return {
      ...c,
      total: miennes.length,
      possedees: miennes.filter((s) => parCarte.has(s.card_id)).length,
      couverture,
    };
  });
}

// Un classeur et toutes ses cases remplies (la page affichée est choisie à l'écran).
export async function lireClasseur(supabase: SupabaseClient, id: string) {
  const { data: classeur } = await supabase.from("binders").select(CHAMPS_CLASSEUR).eq("id", id).maybeSingle();
  if (!classeur) return null;
  const c = classeur as Classeur;

  const [{ data, error }, { parCarte }] = await Promise.all([
    supabase
      .from("binder_slots")
      .select(`position, cards(${CHAMPS_CARTE})`)
      .eq("binder_id", id)
      .order("position")
      .limit(PAGES_MAX * 12),
    lirePossessions(supabase, c.user_id),
  ]);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []).filter((l) => l.cards) as unknown as { position: number; cards: LigneCarte }[];
  const sets = await nomsSets(supabase, lignes.map((l) => l.cards));
  const cases: Case[] = lignes.map((l) => ({
    ...versListe(l.cards, sets),
    position: l.position,
    possedee: parCarte.has(l.cards.id),
    quantite: parCarte.get(l.cards.id),
  }));
  return { classeur: c, cases };
}

// Nombre de pages nécessaire pour garder toutes les cartes quand on change de format.
export function pagesApresFormat(pages: number, ancien: Format, nouveau: Format, dernierePosition: number | null) {
  const pourLesCartes = dernierePosition === null ? 1 : Math.floor(dernierePosition / nouveau) + 1;
  const pourLesCases = Math.ceil((pages * ancien) / nouveau);
  return Math.min(PAGES_MAX, Math.max(1, pourLesCartes, pourLesCases));
}
