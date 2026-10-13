import Link from "next/link";
import { cookies } from "next/headers";
import { choisirTheme, seDeconnecter } from "@/app/actions";
import { EnTete } from "@/components/EnTete";
import { MiseAJourCatalogue } from "@/components/MiseAJourCatalogue";
import { dernieresExecutions, estAdmin, majConfiguree, type Execution } from "@/lib/catalogue-maj";
import { LEGAL } from "@/lib/legal";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Plus · Krikrou collection" };

const THEMES = [
  { valeur: "auto", label: "Comme le téléphone" },
  { valeur: "clair", label: "Clair" },
  { valeur: "sombre", label: "Sombre" },
];

export default async function Plus() {
  const profil = await profilConnecte();
  const actuel = (await cookies()).get("theme")?.value ?? "auto";
  const admin = estAdmin(profil?.id);
  let executions: Execution[] | null = [];
  if (admin && majConfiguree()) executions = await dernieresExecutions().catch(() => null);

  return (
    <>
      <EnTete titre="Plus" />
      <div className="flex max-w-xl flex-col gap-4">
        <section className="flex items-center gap-3 rounded-2xl border border-ligne bg-surface p-4">
          <div aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-vert font-bold text-sur-vert">
            {profil?.prenom.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-bold">{profil?.prenom}</p>
            <p className="text-sm text-encre-douce">Connecté</p>
          </div>
          <form action={seDeconnecter}>
            <button className="h-11 rounded-xl border border-ligne px-4 text-sm font-semibold">Se déconnecter</button>
          </form>
        </section>

        <section className="flex flex-col gap-2 rounded-2xl border border-ligne bg-surface p-4">
          <h2 className="font-bold">Thème</h2>
          <form action={choisirTheme} className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.valeur}
                name="theme"
                value={t.valeur}
                aria-pressed={actuel === t.valeur}
                className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${actuel === t.valeur ? "border-accent bg-accent text-[#1f1814]" : "border-ligne"}`}
              >
                {t.label}
              </button>
            ))}
          </form>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-ligne bg-surface p-4">
          <h2 className="font-bold">Mes données</h2>
          <a
            href="/mes-donnees"
            download
            className="flex min-h-11 items-center justify-center rounded-xl border border-ligne px-4 text-sm font-semibold"
          >
            Télécharger toutes mes données
          </a>
          <p className="text-sm text-encre-douce">
            Pour corriger une information ou supprimer ton compte et toute ta collection, écris à{" "}
            <a href={`mailto:${LEGAL.contact}`} className="font-semibold text-accent-texte underline">{LEGAL.contact}</a>.
          </p>
          <p className="flex gap-4 text-sm">
            <Link href="/confidentialite" className="text-accent-texte underline">Confidentialité</Link>
            <Link href="/mentions-legales" className="text-accent-texte underline">Mentions légales</Link>
          </p>
        </section>

        {admin && (
          <section className="flex flex-col gap-2 rounded-2xl border border-ligne bg-surface p-4">
            <h2 className="font-bold">Catalogue</h2>
            <p className="text-sm text-encre-douce">
              Ajoute les nouvelles extensions (TCGdex, PTCG-database, chinois). Lance d&apos;abord une simulation, regarde
              qu&apos;elle réussit, puis applique. Pense ensuite à réimporter ton fichier Pokiframe pour retenter les
              cartes introuvables.
            </p>
            {majConfiguree() ? (
              <MiseAJourCatalogue executions={executions} />
            ) : (
              <p className="text-sm text-terracotta">Pas encore configuré : il manque GITHUB_TOKEN ou GITHUB_REPO dans Vercel.</p>
            )}
          </section>
        )}

        <Link
          href="/import"
          className="flex items-center gap-3 rounded-2xl border border-ligne bg-surface p-4 hover:bg-puce"
        >
          <div className="flex-1">
            <p className="font-bold">Import Pokiframe</p>
            <p className="text-sm text-encre-douce">Ajouter ta collection depuis un export JSON, et l&apos;historique des imports</p>
          </div>
          <span aria-hidden="true" className="text-xl text-encre-douce">›</span>
        </Link>
      </div>
    </>
  );
}
