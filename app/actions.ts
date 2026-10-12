"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function choisirTheme(formData: FormData) {
  const valeur = String(formData.get("theme"));
  const store = await cookies();
  if (valeur === "clair" || valeur === "sombre") {
    store.set("theme", valeur, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    store.delete("theme");
  }
}

export async function seDeconnecter() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/connexion");
}
