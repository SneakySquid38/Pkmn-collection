import Link from "next/link";
import type { Membre } from "@/lib/collection";

// Un onglet par membre : « Moi », puis Louise, Hugo… (lecture seule chez les autres).
// `chemin` peut déjà porter des paramètres (/classeurs?vue=binders).
export function OngletsMembres({ membres, actif, moi, chemin }: { membres: Membre[]; actif: string; moi: string; chemin: string }) {
  if (membres.length < 2) return null;
  const et = chemin.includes("?") ? "&" : "?";
  return (
    <nav aria-label="Choisir la personne" className="flex gap-2 overflow-x-auto">
      {membres.map((m) => (
        <Link
          key={m.id}
          href={m.id === moi ? chemin : `${chemin}${et}membre=${m.id}`}
          aria-current={m.id === actif ? "page" : undefined}
          className={`flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${m.id === actif ? "border-encre bg-encre text-fond" : "border-ligne bg-surface"}`}
        >
          {m.id === moi ? "Moi" : m.prenom}
        </Link>
      ))}
    </nav>
  );
}
