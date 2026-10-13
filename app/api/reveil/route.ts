import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Appelée chaque jour par Vercel Cron (vercel.json) : une petite lecture suffit pour que
// Supabase gratuit ne mette pas la base en pause après 7 jours sans activité.
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » ; sans ce secret, la route refuse.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("rarities").select("code").limit(1);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, date: new Date().toISOString() });
}
