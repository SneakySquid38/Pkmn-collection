import type { SupabaseClient } from "@supabase/supabase-js";

// Langue des images empruntées, dans l'ordre de préférence, quand une carte n'a pas d'image à elle.
const ORDRE = ["JP", "SC", "TC", "KR", "FR", "EN"];
const rang = (l: string) => (ORDRE.indexOf(l) + 1 || ORDRE.length + 1);

export type Repli = { small: string; large: string | null; langue: string };

// Choisit l'image d'une autre version de la même carte (même famille multilingue).
export function choisirRepli(versions: { language: string; image_small: string | null; image_large?: string | null }[]): Repli | null {
  const v = versions.filter((x) => x.image_small).sort((a, b) => rang(a.language) - rang(b.language))[0];
  return v ? { small: v.image_small!, large: v.image_large ?? null, langue: v.language } : null;
}

// Pour les cartes sans image : l'image d'une autre version de la même famille (JP, CN, KR…), avec sa langue.
export async function imagesDeRepli(supabase: SupabaseClient, ids: string[]) {
  const repli = new Map<string, Repli>();
  // Par paquets : les identifiants passent dans l'adresse de la requête.
  const paquets = (t: string[]) => Array.from({ length: Math.ceil(t.length / 150) }, (_, i) => t.slice(i * 150, i * 150 + 150));
  const manquantes = [...new Set(ids)];
  if (!manquantes.length) return repli;
  const cartes = (
    await Promise.all(
      paquets(manquantes).map((p) => supabase.from("cards").select("id, card_entity_id").in("id", p).not("card_entity_id", "is", null)),
    )
  ).flatMap((r) => r.data ?? []);
  const familles = [...new Set(cartes.map((c) => c.card_entity_id as string))];
  if (!familles.length) return repli;
  const versions = (
    await Promise.all(
      paquets(familles).map((p) =>
        supabase.from("cards").select("card_entity_id, language, image_small, image_large").in("card_entity_id", p).not("image_small", "is", null).limit(2000),
      ),
    )
  ).flatMap((r) => r.data ?? []);
  const parFamille = new Map<string, { language: string; image_small: string | null; image_large: string | null }[]>();
  for (const v of versions) {
    const f = v.card_entity_id as string;
    parFamille.set(f, [...(parFamille.get(f) ?? []), v]);
  }
  for (const c of cartes) {
    const r = choisirRepli(parFamille.get(c.card_entity_id as string) ?? []);
    if (r) repli.set(c.id as string, r);
  }
  return repli;
}

// Complète une liste de cartes : image_small vide → image d'une autre version, langue notée dans image_repli.
export async function completerImages<T extends { card_id: string; image_small: string | null; image_repli?: string | null }>(
  supabase: SupabaseClient,
  cartes: T[],
): Promise<T[]> {
  const repli = await imagesDeRepli(supabase, cartes.filter((c) => !c.image_small).map((c) => c.card_id));
  if (!repli.size) return cartes;
  return cartes.map((c) => {
    const r = c.image_small ? undefined : repli.get(c.card_id);
    return r ? { ...c, image_small: r.small, image_repli: r.langue } : c;
  });
}
