"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ajouterAuClasseur } from "@/app/(app)/classeurs/actions";

type Choix = { id: string; nom: string };
type Place = { id: string; nom: string; page: number };

// Sur la fiche d'une carte : la ranger dans un de ses classeurs (première case libre).
export function AjoutClasseur({ carte, classeurs, dejaDans }: { carte: string; classeurs: Choix[]; dejaDans: Place[] }) {
  const router = useRouter();
  const [choisi, setChoisi] = useState(classeurs[0]?.id ?? "");
  const [message, setMessage] = useState<{ texte: string; lien?: string; erreur?: boolean } | null>(null);
  const [enCours, demarrer] = useTransition();

  const ajouter = () =>
    demarrer(async () => {
      const r = await ajouterAuClasseur(choisi, carte);
      const nom = classeurs.find((c) => c.id === choisi)?.nom ?? "";
      if (!r.ok) return setMessage({ texte: r.erreur, erreur: true });
      setMessage({ texte: `Rangée dans « ${nom} », page ${r.valeur.page}.`, lien: `/classeurs/${choisi}?page=${r.valeur.page}` });
      router.refresh();
    });

  return (
    <section aria-label="Mes classeurs" className="flex flex-col gap-2 rounded-2xl border border-ligne bg-surface p-4">
      <span className="text-sm font-semibold">Mes classeurs</span>
      {dejaDans.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-encre-douce">
          {dejaDans.map((d) => (
            <li key={`${d.id}-${d.page}`}>
              Déjà dans{" "}
              <Link href={`/classeurs/${d.id}?page=${d.page}`} className="font-semibold text-accent-texte underline">
                {d.nom}
              </Link>
              , page {d.page}
            </li>
          ))}
        </ul>
      )}
      {classeurs.length === 0 ? (
        <p className="text-sm text-encre-douce">
          <Link href="/classeurs" className="font-semibold text-accent-texte underline">
            Crée un classeur
          </Link>{" "}
          pour y ranger cette carte.
        </p>
      ) : (
        <div className="flex gap-2">
          {classeurs.length > 1 && (
            <select
              value={choisi}
              onChange={(e) => setChoisi(e.target.value)}
              aria-label="Classeur"
              className="h-11 min-w-0 flex-1 rounded-xl border border-ligne bg-fond px-2 text-sm"
            >
              {classeurs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={ajouter}
            disabled={enCours}
            className={`h-11 rounded-xl border border-accent px-4 text-sm font-semibold text-accent-texte disabled:opacity-50 ${classeurs.length > 1 ? "" : "flex-1"}`}
          >
            {classeurs.length > 1 ? "Ranger" : `Ranger dans « ${classeurs[0].nom} »`}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className={`text-sm ${message.erreur ? "text-terracotta" : "text-vert"}`}>
          {message.texte}{" "}
          {message.lien && (
            <Link href={message.lien} className="font-semibold underline">
              Voir
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
