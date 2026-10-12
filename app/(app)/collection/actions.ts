"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function connecte(carte: string) {
  if (!UUID.test(carte)) throw new Error("Carte inconnue");
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const moi = data?.claims?.sub;
  if (!moi) throw new Error("Non connecté");
  return { supabase, moi };
}

function rafraichir() {
  for (const p of ["/collection", "/envies", "/recherche"]) revalidatePath(p);
}

// Ajoute (+1) ou retire (-1) un exemplaire de la carte dans sa collection.
// À 0 exemplaire, la ligne disparaît.
export async function changerQuantite(carte: string, ecart: 1 | -1) {
  const { supabase, moi } = await connecte(carte);
  const { data: ligne } = await supabase
    .from("collection_items")
    .select("id, quantity")
    .eq("user_id", moi)
    .eq("card_id", carte)
    .maybeSingle();

  let erreur;
  if (!ligne) {
    if (ecart < 0) return 0;
    ({ error: erreur } = await supabase.from("collection_items").insert({ user_id: moi, card_id: carte, quantity: 1 }));
  } else if (ligne.quantity + ecart <= 0) {
    ({ error: erreur } = await supabase.from("collection_items").delete().eq("id", ligne.id));
  } else {
    ({ error: erreur } = await supabase.from("collection_items").update({ quantity: ligne.quantity + ecart }).eq("id", ligne.id));
  }
  if (erreur) throw new Error(erreur.message);
  rafraichir();
  return Math.max(0, (ligne?.quantity ?? 0) + ecart);
}

// Met la carte dans ses envies avec une priorité (1 très envie, 2 envie, 3 un jour), ou l'en retire (null).
export async function changerEnvie(carte: string, priorite: 1 | 2 | 3 | null) {
  const { supabase, moi } = await connecte(carte);
  const { error } =
    priorite === null
      ? await supabase.from("wishlist_items").delete().eq("user_id", moi).eq("card_id", carte)
      : await supabase
          .from("wishlist_items")
          .upsert({ user_id: moi, card_id: carte, priority: [1, 2, 3].includes(priorite) ? priorite : 2 }, { onConflict: "user_id,card_id" });
  if (error) throw new Error(error.message);
  rafraichir();
}

// « Acheté » : la carte quitte les envies et entre dans la collection.
export async function marquerAchetee(carte: string) {
  await changerQuantite(carte, 1);
  await changerEnvie(carte, null);
}
