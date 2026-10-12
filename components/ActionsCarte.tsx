"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changerEnvie, changerQuantite, marquerAchetee } from "@/app/(app)/collection/actions";
import { PRIORITES } from "@/lib/collection";

// Boutons de la fiche : exemplaires dans ma collection, et place dans mes envies.
// L'écran change tout de suite ; en cas d'erreur, on revient à l'état du serveur.
export function ActionsCarte({ carte, quantite, priorite }: { carte: string; quantite: number; priorite: number | null }) {
  const router = useRouter();
  const [qte, setQte] = useState(quantite);
  const [envie, setEnvie] = useState(priorite);
  const [erreur, setErreur] = useState(false);
  const [enCours, demarrer] = useTransition();

  const lancer = (avant: () => void, action: () => Promise<unknown>) => {
    setErreur(false);
    avant();
    demarrer(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setQte(quantite);
        setEnvie(priorite);
        setErreur(true);
      }
    });
  };

  const ajouter = (ecart: 1 | -1) => lancer(() => setQte((q) => Math.max(0, q + ecart)), () => changerQuantite(carte, ecart));
  const choisirEnvie = (p: 1 | 2 | 3 | null) => lancer(() => setEnvie(p), () => changerEnvie(carte, p));
  const achetee = () => lancer(() => { setQte((q) => q + 1); setEnvie(null); }, () => marquerAchetee(carte));

  const rond = "flex size-11 items-center justify-center rounded-full border border-ligne bg-fond text-xl font-bold disabled:opacity-50";

  return (
    <section aria-label="Ma collection et mes envies" aria-busy={enCours} className="flex flex-col gap-3 rounded-2xl border border-ligne bg-surface p-4">
      {qte === 0 ? (
        <button type="button" onClick={() => ajouter(1)} className="h-12 rounded-2xl bg-accent font-bold text-[#1f1814]">
          Ajouter à ma collection
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs text-encre-douce">Dans ma collection</span>
            <span className="font-titre text-xl font-extrabold">
              {qte} exemplaire{qte > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => ajouter(-1)} aria-label="Retirer un exemplaire" className={rond}>
              −
            </button>
            <button type="button" onClick={() => ajouter(1)} aria-label="Ajouter un exemplaire" className={rond}>
              +
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-ligne pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{envie ? "Dans mes envies" : "Mes envies"}</span>
          {envie && (
            <button type="button" onClick={() => choisirEnvie(null)} className="h-9 rounded-full px-3 text-sm font-semibold text-encre-douce">
              Retirer
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Priorité de l'envie">
          {PRIORITES.map((p) => (
            <button
              key={p.valeur}
              type="button"
              aria-pressed={envie === p.valeur}
              onClick={() => choisirEnvie(p.valeur)}
              className={`flex h-11 items-center justify-center gap-1 rounded-xl border text-sm font-semibold ${envie === p.valeur ? "border-accent bg-accent-doux text-accent-texte" : "border-ligne bg-fond"}`}
            >
              {envie === p.valeur && <span aria-hidden="true">♥</span>}
              {p.label}
            </button>
          ))}
        </div>
        {envie && (
          <button
            type="button"
            onClick={achetee}
            aria-label="Je l'ai acheté : retirer des envies et ajouter à ma collection"
            className="h-11 rounded-xl border border-vert font-semibold text-vert"
          >
            Je l&apos;ai acheté
          </button>
        )}
      </div>

      {erreur && <p role="alert" className="text-sm text-terracotta">Ça n&apos;a pas marché. Réessaie dans un instant.</p>}
    </section>
  );
}
