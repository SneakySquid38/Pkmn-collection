import Link from "next/link";
import { CreationClasseur } from "@/components/CreationClasseur";
import { ANNEES, listesCourtes } from "@/lib/catalogue";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Nouveau classeur · Krikrou collection" };

export default async function NouveauClasseurAuto() {
  const profil = await profilConnecte();
  if (!profil) return null;
  const { raretes, series } = await listesCourtes(profil.supabase);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link href="/classeurs" className="flex h-11 w-fit items-center gap-1 rounded-xl pr-3 text-sm font-semibold text-encre-douce">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Classeurs
      </Link>
      <h1 className="font-titre text-[26px] leading-tight font-extrabold tracking-tight lg:text-3xl">Nouveau classeur</h1>
      <p className="text-sm text-encre-douce">
        Le classeur se remplit tout seul avec les cartes qui correspondent aux filtres, y compris celles qui sortiront plus tard. Celles que tu as
        apparaissent normalement, les autres en transparence.
      </p>
      <CreationClasseur raretes={raretes} series={series} annees={ANNEES} />
    </div>
  );
}
