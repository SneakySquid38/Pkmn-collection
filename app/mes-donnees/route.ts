import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// Droit d'accès et de portabilité : toutes les données du compte connecté, en JSON.
// Les règles RLS limitent chaque requête aux lignes de l'utilisateur.
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return NextResponse.json({ erreur: "Non connecté" }, { status: 401 });

  const [profil, collection] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", claims.sub).single(),
    supabase.from("collection_items").select("*").eq("user_id", claims.sub),
  ]);

  const export_ = {
    exporte_le: new Date().toISOString(),
    compte: { id: claims.sub, email: claims.email ?? null },
    profil: profil.data,
    collection: collection.data ?? [],
  };

  return new NextResponse(JSON.stringify(export_, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="krikrou-mes-donnees.json"',
      "Cache-Control": "no-store",
    },
  });
}
