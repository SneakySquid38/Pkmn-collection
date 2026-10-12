"use server";

import { chercherCartes, lireFiltres, versParams, type Filtres } from "@/lib/catalogue";
import { createSupabaseServer } from "@/lib/supabase-server";

// Page suivante des résultats, pour le défilement infini.
export async function pageSuivante(filtres: Filtres, offset: number) {
  const supabase = await createSupabaseServer();
  // Les filtres viennent du navigateur : on les revalide comme s'ils venaient de l'adresse.
  const propres = lireFiltres(Object.fromEntries(versParams(filtres)));
  return chercherCartes(supabase, propres, Math.max(0, Math.floor(Number(offset) || 0)));
}
