"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { modifierClasseur, supprimerClasseur } from "@/app/(app)/classeurs/actions";
import { ChoixFormat } from "@/components/ChoixFormat";
import { NOM_MAX, type Classeur, type Format } from "@/lib/classeurs";

// Renommer le classeur, changer le nombre de cases par page, ou le supprimer.
export function ReglagesClasseur({ classeur }: { classeur: Classeur }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(classeur.name);
  const [format, setFormat] = useState<Format>(classeur.slots_per_page);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    demarrer(async () => {
      const r = await modifierClasseur(classeur.id, nom, format);
      if (!r.ok) return setErreur(r.erreur);
      setOuvert(false);
      router.replace(`/classeurs/${classeur.id}`, { scroll: false });
      router.refresh();
    });
  };

  const supprimer = () => {
    if (!window.confirm(`Supprimer le classeur « ${classeur.name} » ? Les cartes restent dans ta collection.`)) return;
    demarrer(async () => {
      const r = await supprimerClasseur(classeur.id);
      if (!r.ok) return setErreur(r.erreur);
      router.push("/classeurs");
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className="h-10 shrink-0 rounded-full border border-ligne bg-surface px-4 text-sm font-semibold">
        Réglages
      </button>
      {ouvert && (
        <div role="dialog" aria-modal="true" aria-label="Réglages du classeur" className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center">
          <form onSubmit={enregistrer} className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-fond p-5 pb-[max(env(safe-area-inset-bottom),20px)] lg:rounded-3xl">
            <h2 className="font-titre text-lg font-extrabold">Réglages du classeur</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Nom</span>
              <input
                required
                maxLength={NOM_MAX}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="h-12 rounded-xl border border-ligne bg-surface px-3 text-base"
              />
            </label>
            <ChoixFormat valeur={format} changer={setFormat} />
            {format !== classeur.slots_per_page && (
              <p className="text-sm text-encre-douce">Les cartes gardent leur ordre et se répartissent sur des pages de {format} cases.</p>
            )}
            {erreur && <p role="alert" className="text-sm text-terracotta">{erreur}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={enCours || !nom.trim()} className="h-12 flex-1 rounded-2xl bg-accent font-bold text-[#1f1814] disabled:opacity-50">
                Enregistrer
              </button>
              <button type="button" onClick={() => setOuvert(false)} className="h-12 rounded-2xl px-4 font-semibold text-encre-douce">
                Annuler
              </button>
            </div>
            <button type="button" onClick={supprimer} disabled={enCours} className="h-11 rounded-xl border border-terracotta font-semibold text-terracotta">
              Supprimer le classeur
            </button>
          </form>
        </div>
      )}
    </>
  );
}
