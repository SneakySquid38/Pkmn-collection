"use server";

import { revalidatePath } from "next/cache";
import { estAdmin, lancer, majConfiguree } from "@/lib/catalogue-maj";
import { createSupabaseServer } from "@/lib/supabase-server";

// Lance la mise à jour du catalogue sur GitHub. Réservé au compte administrateur.
export async function lancerMiseAJour(mode: "simulation" | "application") {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!estAdmin(data?.claims?.sub)) throw new Error("Réservé à l'administrateur");
  if (!majConfiguree()) throw new Error("Mise à jour non configurée");
  await lancer(mode === "application" ? "application" : "simulation");
  revalidatePath("/plus");
}
