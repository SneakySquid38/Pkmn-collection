import Link from "next/link";
import { EnTete } from "@/components/EnTete";
import { ATrouver, type LigneATrouver } from "@/components/ATrouver";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Cartes à trouver · Krikrou collection" };

type Payload = { nom?: string; set?: string | null; code?: string | null; numero?: string | null; langue?: string; quantite?: number };

export default async function CartesATrouver() {
  const profil = await profilConnecte();
  const lignes: LigneATrouver[] = [];

  if (profil) {
    const { data } = await profil.supabase.rpc("import_a_trouver");
    const brutes = (data ?? []) as { ligne: string; payload: Payload | null; fichier: string | null; importe_le: string; absente: boolean }[];

    // Meilleure candidate de chaque ligne, pour l'afficher tout de suite.
    const suggestions = new Map<string, LigneATrouver["suggestion"]>();
    if (brutes.length) {
      const { data: cands } = await profil.supabase.rpc("candidats_import", { p_lignes: brutes.map((b) => b.ligne), p_max: 1 });
      for (const c of (cands ?? []) as Record<string, unknown>[]) {
        suggestions.set(c.ligne as string, {
          id: c.card_id as string,
          nom: c.nom as string,
          language: c.language as string,
          number: (c.number as string | null) ?? null,
          set_nom: (c.set_nom as string | null) ?? null,
          image_small: (c.image_small as string | null) ?? null,
          score: c.score as number,
          meme_numero: !!c.meme_numero,
          sure: !!c.sure,
        });
      }
    }

    for (const b of brutes) {
      const p = b.payload ?? {};
      lignes.push({
        ligne: b.ligne,
        nom: p.nom ?? "Carte sans nom",
        set: p.set ?? null,
        code: p.code ?? null,
        numero: p.numero ?? null,
        langue: p.langue ?? "",
        quantite: p.quantite ?? 1,
        fichier: b.fichier,
        importe_le: b.importe_le,
        absente: b.absente,
        suggestion: suggestions.get(b.ligne) ?? null,
      });
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <EnTete titre="Cartes à trouver">
        <Link href="/import" className="h-10 shrink-0 rounded-xl border border-ligne px-3 text-sm font-semibold leading-10">
          Import
        </Link>
      </EnTete>
      <ATrouver lignes={lignes} />
    </div>
  );
}
