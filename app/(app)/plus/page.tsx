import { cookies } from "next/headers";
import { choisirTheme, seDeconnecter } from "@/app/actions";
import { EnTete } from "@/components/EnTete";
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

        <section className="rounded-2xl border border-dashed border-ligne bg-surface p-4 text-sm text-encre-douce">
          Bientôt ici : la collection de l'autre, l'import Pokiframe et l'historique des imports.
        </section>
      </div>
    </>
  );
}
