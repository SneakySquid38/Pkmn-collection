"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lancerMiseAJour } from "@/app/(app)/plus/actions";
import type { Execution } from "@/lib/catalogue-maj";

const ETATS: Record<Execution["etat"], string> = {
  en_attente: "En attente",
  en_cours: "En cours",
  reussie: "Réussie",
  echouee: "Échouée",
  annulee: "Annulée",
};

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

// Boutons « Vérifier » (simulation) et « Appliquer », et les dernières exécutions.
export function MiseAJourCatalogue({ executions }: { executions: Execution[] | null }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const occupee = executions?.some((e) => e.etat === "en_cours" || e.etat === "en_attente");

  const lancerMode = (mode: "simulation" | "application") => {
    if (mode === "application" && !confirm("Appliquer la mise à jour du catalogue ? Les nouvelles cartes seront écrites dans la base.")) return;
    setMessage(null);
    demarrer(async () => {
      try {
        await lancerMiseAJour(mode);
        setMessage("C'est parti. Compte quelques minutes, puis actualise cette page.");
        setTimeout(() => router.refresh(), 4000);
      } catch {
        setMessage("Le lancement n'a pas abouti. Vérifie la configuration GitHub.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => lancerMode("simulation")} disabled={enCours || occupee} className="min-h-11 rounded-xl border border-ligne px-2 text-sm font-semibold disabled:opacity-50">
          Vérifier (simulation)
        </button>
        <button type="button" onClick={() => lancerMode("application")} disabled={enCours || occupee} className="min-h-11 rounded-xl bg-accent px-2 text-sm font-bold text-[#1f1814] disabled:opacity-50">
          Appliquer
        </button>
      </div>
      {message && <p role="status" className="text-sm text-encre-douce">{message}</p>}
      {executions === null ? (
        <p className="text-sm text-terracotta">Impossible de lire les exécutions sur GitHub.</p>
      ) : executions.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {executions.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="text-encre-douce">
                {date.format(new Date(e.debut))} · {e.mode === "application" ? "Application" : "Simulation"}
              </span>
              <a href={e.url} target="_blank" rel="noreferrer" className={`font-semibold underline ${e.etat === "echouee" ? "text-terracotta" : e.etat === "reussie" ? "text-vert" : "text-encre"}`}>
                {ETATS[e.etat]}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-encre-douce">Aucune mise à jour lancée pour l&apos;instant.</p>
      )}
    </div>
  );
}
