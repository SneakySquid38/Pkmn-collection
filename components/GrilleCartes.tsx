"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { pageSuivante } from "@/app/(app)/recherche/actions";
import { CardImage } from "@/components/CardImage";
import { libelleLangue, TAILLE_PAGE, versParams, type CarteResultat, type Filtres } from "@/lib/catalogue";

// Grille des résultats avec défilement infini : la page suivante se charge
// quand le bas de la grille approche de l'écran.
export function GrilleCartes({
  filtres,
  premiers,
  total,
  carteOuverte,
}: {
  filtres: Filtres;
  premiers: CarteResultat[];
  total: number;
  carteOuverte: string | null;
}) {
  const [cartes, setCartes] = useState(premiers);
  const [fin, setFin] = useState(premiers.length < TAILLE_PAGE);
  const [erreur, setErreur] = useState(false);
  const [enCours, demarrer] = useTransition();
  const sentinelle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelle.current;
    if (!el || fin || erreur) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || enCours) return;
        demarrer(async () => {
          try {
            const suite = await pageSuivante(filtres, cartes.length);
            setCartes((c) => [...c, ...suite]);
            if (suite.length < TAILLE_PAGE) setFin(true);
          } catch {
            setErreur(true);
          }
        });
      },
      { rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtres, cartes.length, fin, erreur, enCours]);

  const base = versParams(filtres);
  const lien = (id: string) => {
    const p = new URLSearchParams(base);
    p.set("carte", id);
    return `/recherche?${p}`;
  };

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {cartes.map((c, i) => {
          const nom = c.search_name_fr ?? c.name;
          const ouverte = c.card_id === carteOuverte;
          const langues = c.languages?.length ? c.languages : [c.language];
          return (
            <li key={c.card_id}>
              <Link
                href={lien(c.card_id)}
                scroll={false}
                aria-current={ouverte ? "true" : undefined}
                className={`flex flex-col gap-1.5 rounded-xl p-1 ${ouverte ? "bg-accent-doux ring-2 ring-accent" : "hover:bg-puce"}`}
              >
                <div className="relative">
                  <CardImage src={c.image_small} alt={nom} lang={langues.map(libelleLangue).join(" · ")} prioritaire={i < 4} />
                  {c.image_small && (
                    <span className="absolute bottom-1.5 left-1.5 flex gap-1">
                      {langues.map((l) => (
                        <span key={l} className="rounded-md bg-[#1f1814] px-1.5 py-0.5 text-[10px] font-bold text-[#fbf6f0]">
                          {libelleLangue(l)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col px-0.5">
                  <span className="truncate text-sm font-semibold">{nom}</span>
                  <span className="truncate text-xs text-encre-douce">
                    {c.set_display_name ?? c.set_code}
                    {c.number ? ` · ${c.number}` : ""}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div ref={sentinelle} className="flex min-h-16 items-center justify-center py-6 text-sm text-encre-douce" aria-live="polite">
        {erreur ? (
          <button onClick={() => setErreur(false)} className="h-11 rounded-xl border border-ligne px-4 font-semibold">
            Erreur de chargement · Réessayer
          </button>
        ) : enCours ? (
          "Chargement…"
        ) : fin && total > TAILLE_PAGE ? (
          `Les ${total.toLocaleString("fr-FR")} cartes sont affichées`
        ) : null}
      </div>
    </>
  );
}
