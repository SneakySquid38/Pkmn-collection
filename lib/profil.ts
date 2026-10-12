import { createSupabaseServer } from "@/lib/supabase-server";

// Utilisateur connecté et son prénom affiché (table profiles).
export async function profilConnecte() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: profil } = await supabase.from("profiles").select("display_name").eq("id", id).single();
  return { id, prenom: profil?.display_name ?? "toi", supabase };
}
