"use server";

import { chercherCartes, libelleLangue, lireFiltres, versParams, type Filtres } from "@/lib/catalogue";
import { createSupabaseServer } from "@/lib/supabase-server";

// Page suivante des résultats, pour le défilement infini.
export async function pageSuivante(filtres: Filtres, offset: number) {
  const supabase = await createSupabaseServer();
  // Les filtres viennent du navigateur : on les revalide comme s'ils venaient de l'adresse.
  const propres = lireFiltres(Object.fromEntries(versParams(filtres)));
  return chercherCartes(supabase, propres, Math.max(0, Math.floor(Number(offset) || 0)));
}

export type OptionListe = { id: string; label: string; detail?: string };

// Listes des sets et des illustrateurs pour le tiroir de filtres, chargées à sa première ouverture.
export async function listesFiltres(): Promise<{ sets: OptionListe[]; illustrateurs: OptionListe[] }> {
  const supabase = await createSupabaseServer();
  const [sets, illustrateurs] = await Promise.all([
    // La vue applique la RLS de sets : seuls les sets publiés reviennent.
    supabase.from("sets_display").select("set_id, display_name, language, release_date").order("release_date", { ascending: false, nullsFirst: false }).limit(2000),
    supabase.from("illustrators").select("id, name").order("name").limit(2000),
  ]);
  return {
    sets: (sets.data ?? []).map((s) => ({
      id: s.set_id,
      label: s.display_name ?? "Set sans nom",
      detail: [libelleLangue(s.language), s.release_date?.slice(0, 4)].filter(Boolean).join(" · "),
    })),
    illustrateurs: (illustrateurs.data ?? []).map((i) => ({ id: i.id, label: i.name })),
  };
}
