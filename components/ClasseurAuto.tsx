"use client";

import { useMemo, useState } from "react";
import { ClasseurPages } from "@/components/ClasseurPages";
import type { Case, Classeur } from "@/lib/classeurs";

export type Voir = "toutes" | "a-trouver" | "possedees";

const CHOIX: { valeur: Voir; label: string }[] = [
  { valeur: "toutes", label: "Toutes" },
  { valeur: "a-trouver", label: "À trouver" },
  { valeur: "possedees", label: "Possédées" },
];

// Pages d'un classeur automatique, en lecture : toutes les cartes, ou seulement celles à trouver / possédées.
export function ClasseurAuto({
  classeur,
  cases,
  voirInitial,
  pageInitiale,
  ouverte,
}: {
  classeur: Classeur;
  cases: Case[];
  voirInitial: Voir;
  pageInitiale: number;
  ouverte: string | null;
}) {
  const [voir, setVoir] = useState(voirInitial);
  const [recu, setRecu] = useState(voirInitial);
  if (recu !== voirInitial) {
    setRecu(voirInitial);
    setVoir(voirInitial);
  }

  const affichees = useMemo(
    () =>
      cases
        .filter((c) => voir === "toutes" || (voir === "possedees") === c.possedee)
        .map((c, i) => ({ ...c, position: i })),
    [cases, voir],
  );
  const nombres: Record<Voir, number> = {
    toutes: cases.length,
    possedees: cases.filter((c) => c.possedee).length,
    "a-trouver": cases.filter((c) => !c.possedee).length,
  };
  const pages = Math.max(1, Math.ceil(affichees.length / classeur.slots_per_page));
  const page = voir === voirInitial ? Math.min(Math.max(pageInitiale, 1), pages) : 1;

  const changer = (v: Voir) => {
    setVoir(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "toutes") params.delete("voir");
    else params.set("voir", v);
    params.set("page", "1");
    params.delete("carte");
    window.history.replaceState(null, "", `?${params}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Cartes affichées" className="grid grid-cols-3 rounded-xl bg-puce p-1">
        {CHOIX.map((c) => (
          <button
            key={c.valeur}
            type="button"
            aria-pressed={voir === c.valeur}
            onClick={() => changer(c.valeur)}
            className={`flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-bold ${voir === c.valeur ? "bg-surface" : "text-encre-douce"}`}
          >
            {c.label} <span className="text-xs font-semibold text-encre-douce">{nombres[c.valeur]}</span>
          </button>
        ))}
      </div>
      {affichees.length === 0 ? (
        <p className="rounded-2xl border border-ligne bg-surface p-4 text-sm text-encre-douce">
          {voir === "a-trouver" ? "Tu as toutes les cartes de ce classeur. Bravo !" : "Aucune carte possédée pour l'instant."}
        </p>
      ) : (
        <ClasseurPages
          key={voir}
          classeur={{ ...classeur, pages }}
          cases={affichees}
          pageInitiale={page}
          proprietaire={false}
          ouverte={ouverte}
          parametres={voir === "toutes" ? "" : `voir=${voir}`}
        />
      )}
    </div>
  );
}
