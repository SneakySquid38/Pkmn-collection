"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Version = { code: "SC" | "TC"; nom: string; href: string | null };

// Choix entre chinois simplifié et traditionnel, sur la fiche d'une carte CN.
// Le bouton s'allume tout de suite ; la fiche de l'autre version se charge à la place.
export function ChoixChinois({ actuelle, versions }: { actuelle: "SC" | "TC"; versions: Version[] }) {
  const router = useRouter();
  const [choisie, setChoisie] = useState(actuelle);
  const [enCours, demarrer] = useTransition();

  return (
    <div role="group" aria-label="Version chinoise" aria-busy={enCours} className="mx-auto grid w-full max-w-[300px] grid-cols-2 gap-2">
      {versions.map((v) => {
        const active = choisie === v.code;
        return (
          <button
            key={v.code}
            type="button"
            aria-pressed={active}
            disabled={!v.href && !active}
            title={v.href || active ? v.nom : `${v.nom} : pas de version pour cette carte`}
            onClick={() => {
              if (active || !v.href) return;
              setChoisie(v.code);
              demarrer(() => router.replace(v.href!, { scroll: false }));
            }}
            className={`flex h-11 flex-col items-center justify-center rounded-xl border text-sm font-semibold leading-tight disabled:opacity-40 ${active ? "border-accent bg-accent-doux text-accent-texte" : "border-ligne bg-fond"}`}
          >
            {v.code}
            <span className="text-[11px] font-normal">{v.code === "SC" ? "simplifié" : "traditionnel"}</span>
          </button>
        );
      })}
    </div>
  );
}
