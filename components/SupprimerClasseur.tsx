"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { supprimerClasseur } from "@/app/(app)/classeurs/actions";
import { RACINE, type Sorte } from "@/lib/classeurs";

// Supprimer un classeur ou un binder, après confirmation. Les cartes restent dans la collection.
// « icone » : petite corbeille sur la liste ; « bouton » : bouton large dans les réglages.
export function SupprimerClasseur({ id, nom, sorte, variante = "icone" }: { id: string; nom: string; sorte: Sorte; variante?: "icone" | "bouton" }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const mot = sorte === "binder" ? "le binder" : "le classeur";

  const supprimer = () => {
    if (!window.confirm(`Supprimer ${mot} « ${nom} » ? Les cartes restent dans ta collection.`)) return;
    demarrer(async () => {
      const r = await supprimerClasseur(id);
      if (!r.ok) return window.alert(r.erreur);
      if (variante === "bouton") router.push(RACINE[sorte]);
      else router.refresh();
    });
  };

  if (variante === "bouton") {
    return (
      <button type="button" onClick={supprimer} disabled={enCours} className="h-11 rounded-xl border border-terracotta font-semibold text-terracotta disabled:opacity-50">
        {enCours ? "Suppression…" : `Supprimer ${mot}`}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={supprimer}
      disabled={enCours}
      aria-label={`Supprimer ${mot} « ${nom} »`}
      title={`Supprimer ${mot}`}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-encre-douce hover:bg-puce hover:text-terracotta disabled:opacity-40"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </svg>
    </button>
  );
}
