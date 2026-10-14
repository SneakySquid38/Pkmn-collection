"use server";

import { revalidatePath } from "next/cache";
import { LIMITE_LIGNES, type LignePokiframe } from "@/lib/pokiframe";
import { createSupabaseServer } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CarteTrouvee = {
  id: string;
  nom: string;
  language: string;
  number: string | null;
  set_nom: string | null;
  image_small: string | null;
};

export type Analyse = {
  lignes: {
    i: number;
    statut: "reconnue" | "a_choisir" | "introuvable" | "deja";
    cartes: CarteTrouvee[]; // 1 carte si reconnue, plusieurs si à choisir
    qte_deja: number; // exemplaires déjà importés par un import précédent
  }[];
  absentes: { ligne_id: string; nom: string; carte: CarteTrouvee | null; quantite: number }[];
};

async function connecte() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const moi = data?.claims?.sub;
  if (!moi) throw new Error("Non connecté");
  return { supabase, moi };
}

function valider<T extends LignePokiframe>(lignes: T[]): T[] {
  if (!Array.isArray(lignes) || lignes.length > LIMITE_LIGNES) throw new Error("Fichier trop long");
  return lignes.filter((l) => typeof l?.external_id === "string" && l.external_id.length <= 100 && Number.isInteger(l.i));
}

// Aperçu : retrouve chaque ligne dans le catalogue et la compare aux imports précédents. N'écrit rien.
export async function analyserImport(entree: LignePokiframe[]): Promise<Analyse> {
  const lignes = valider(entree);
  const { supabase, moi } = await connecte();

  // 1. Correspondance dans le catalogue, par paquets de 500 lignes.
  const correspondances = new Map<number, string[]>();
  for (let k = 0; k < lignes.length; k += 500) {
    const paquet = lignes.slice(k, k + 500).map((l) => ({ i: l.i, code: l.code, set: l.set, num: l.numero, lang: l.langue }));
    const { data, error } = await supabase.rpc("match_pokiframe", { p_lignes: paquet });
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { i: number; card_ids: string[] }[]) correspondances.set(r.i, r.card_ids ?? []);
  }

  // 2. Imports précédents encore actifs : quantité déjà importée par ligne Pokiframe.
  const { data: anciennes } = await supabase
    .from("import_lines")
    .select("id, external_id, card_id, quantity, status, payload, import_lots!inner(undone_at)")
    .eq("user_id", moi)
    .in("status", ["importee", "retiree"])
    .is("import_lots.undone_at", null)
    .limit(20000);
  const deja = new Map<string, { qte: number; card_id: string | null; ligne_id: string; nom: string }>();
  for (const a of anciennes ?? []) {
    const d = deja.get(a.external_id) ?? { qte: 0, card_id: a.card_id, ligne_id: a.id, nom: (a.payload as { nom?: string })?.nom ?? "" };
    d.qte += a.quantity;
    if (a.status === "importee" && a.quantity > 0) d.ligne_id = a.id;
    deja.set(a.external_id, d);
  }

  // 3. Fiches des cartes trouvées, pour l'aperçu.
  const ids = new Set<string>();
  correspondances.forEach((c) => c.slice(0, 6).forEach((id) => ids.add(id)));
  deja.forEach((d) => d.card_id && ids.add(d.card_id));
  const fiches = new Map<string, CarteTrouvee>();
  const liste = [...ids];
  for (let k = 0; k < liste.length; k += 300) {
    const { data } = await supabase
      .from("cards")
      .select("id, name, search_name_fr, language, number, image_small, set_id")
      .in("id", liste.slice(k, k + 300));
    const sets = new Map<string, string>();
    const setIds = [...new Set((data ?? []).map((c) => c.set_id))];
    if (setIds.length) {
      const { data: s } = await supabase.from("sets_display").select("set_id, display_name").in("set_id", setIds);
      (s ?? []).forEach((x) => sets.set(x.set_id, x.display_name));
    }
    for (const c of data ?? []) {
      fiches.set(c.id, {
        id: c.id,
        nom: c.search_name_fr ?? c.name,
        language: c.language,
        number: c.number,
        set_nom: sets.get(c.set_id) ?? null,
        image_small: c.image_small,
      });
    }
  }

  const presentes = new Set(lignes.map((l) => l.external_id));
  return {
    lignes: lignes.map((l) => {
      const d = deja.get(l.external_id);
      if (d && d.qte > 0 && d.card_id) {
        const carte = fiches.get(d.card_id);
        return { i: l.i, statut: d.qte === l.quantite ? "deja" : "reconnue", cartes: carte ? [carte] : [], qte_deja: d.qte };
      }
      const trouvees = (correspondances.get(l.i) ?? []).map((id) => fiches.get(id)).filter((c): c is CarteTrouvee => !!c);
      return {
        i: l.i,
        statut: trouvees.length === 1 ? "reconnue" : trouvees.length > 1 ? "a_choisir" : "introuvable",
        cartes: trouvees,
        qte_deja: 0,
      };
    }),
    absentes: [...deja.entries()]
      .filter(([ext, d]) => !presentes.has(ext) && d.qte > 0)
      .map(([, d]) => ({ ligne_id: d.ligne_id, nom: d.nom, carte: d.card_id ? fiches.get(d.card_id) ?? null : null, quantite: d.qte })),
  };
}

// Import : écrit tout en une transaction (fonction apply_pokiframe_import).
export async function importer(
  fichier: string,
  entree: (LignePokiframe & { card_id: string | null })[],
  retirer: string[],
) {
  const lignes = valider(entree);
  const { supabase } = await connecte();
  const { data, error } = await supabase.rpc("apply_pokiframe_import", {
    p_fichier: String(fichier).slice(0, 200),
    p_lignes: lignes.map((l) => ({
      external_id: l.external_id,
      card_id: l.card_id && UUID.test(l.card_id) ? l.card_id : null,
      quantity: l.quantite,
      price: l.prix,
      payload: { nom: l.nom, set: l.set, code: l.code, numero: l.numero, langue: l.langue, quantite: l.quantite },
    })),
    p_retirer: retirer.filter((r) => UUID.test(r)),
  });
  if (error) throw new Error(error.message);
  for (const p of ["/collection", "/import", "/recherche"]) revalidatePath(p);
  return data as string;
}

export async function annulerImport(lot: string) {
  if (!UUID.test(lot)) throw new Error("Import inconnu");
  const { supabase } = await connecte();
  const { error } = await supabase.rpc("undo_import", { p_lot: lot });
  if (error) throw new Error(error.message);
  for (const p of ["/collection", "/import", "/recherche"]) revalidatePath(p);
}

// ——— Cartes à trouver à la main (lignes « introuvable » des imports actifs) ———

export type Candidate = CarteTrouvee & { score: number; meme_numero: boolean; sure: boolean };

// Cartes candidates d'une ligne à trouver, les plus probables d'abord.
export async function candidatsLigne(ligne: string): Promise<Candidate[]> {
  if (!UUID.test(ligne)) throw new Error("Ligne inconnue");
  const { supabase } = await connecte();
  const { data, error } = await supabase.rpc("candidats_import", { p_lignes: [ligne], p_max: 60 });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: Record<string, unknown>) => ({
    id: c.card_id as string,
    nom: c.nom as string,
    language: c.language as string,
    number: (c.number as string | null) ?? null,
    set_nom: (c.set_nom as string | null) ?? null,
    image_small: (c.image_small as string | null) ?? null,
    score: c.score as number,
    meme_numero: !!c.meme_numero,
    sure: !!c.sure,
  }));
}

// Rattache des lignes à la carte choisie et l'ajoute à la collection.
export async function choisirCartes(choix: { ligne: string; card: string }[]) {
  const valides = (Array.isArray(choix) ? choix : []).filter((c) => UUID.test(c?.ligne) && UUID.test(c?.card)).slice(0, 500);
  if (!valides.length) return 0;
  const { supabase } = await connecte();
  const { data, error } = await supabase.rpc("choisir_cartes_import", { p_choix: valides });
  if (error) throw new Error(error.message);
  for (const p of ["/collection", "/import", "/import/a-trouver", "/recherche"]) revalidatePath(p);
  return data as number;
}

// Range une ligne dans « Absentes du catalogue », ou l'en sort.
export async function marquerAbsente(ligne: string, absente: boolean) {
  if (!UUID.test(ligne)) throw new Error("Ligne inconnue");
  const { supabase } = await connecte();
  const { error } = await supabase.rpc("marquer_absente", { p_ligne: ligne, p_absente: !!absente });
  if (error) throw new Error(error.message);
  for (const p of ["/import", "/import/a-trouver"]) revalidatePath(p);
}
