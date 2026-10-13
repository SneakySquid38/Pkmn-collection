"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { creerClasseur } from "@/app/(app)/classeurs/actions";
import { ChoixFormat } from "@/components/ChoixFormat";
import { NOM_MAX, type Format } from "@/lib/classeurs";

// Bouton « Nouveau classeur », qui s'ouvre en petit formulaire : nom et format de page.
export function NouveauClasseur() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [format, setFormat] = useState<Format>(9);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex h-13 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-accent font-bold"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nouveau classeur
      </button>
    );
  }

  const creer = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    demarrer(async () => {
      const r = await creerClasseur(nom, format);
      if (r.ok) router.push(`/classeurs/${r.valeur}`);
      else setErreur(r.erreur);
    });
  };

  return (
    <form onSubmit={creer} className="flex flex-col gap-4 rounded-2xl border border-ligne bg-surface p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Nom du classeur</span>
        <input
          autoFocus
          required
          maxLength={NOM_MAX}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Dracaufeu toutes langues"
          className="h-12 rounded-xl border border-ligne bg-fond px-3 text-base"
        />
      </label>
      <ChoixFormat valeur={format} changer={setFormat} />
      {erreur && <p role="alert" className="text-sm text-terracotta">{erreur}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={enCours || !nom.trim()} className="h-12 flex-1 rounded-2xl bg-accent font-bold text-[#1f1814] disabled:opacity-50">
          {enCours ? "Création…" : "Créer"}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="h-12 rounded-2xl px-4 font-semibold text-encre-douce">
          Annuler
        </button>
      </div>
    </form>
  );
}
