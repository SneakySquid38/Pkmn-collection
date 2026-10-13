"use client";

import { useState } from "react";

type Option = { id: string; label: string; detail?: string };

const simplifier = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Champ avec suggestions pour choisir dans une longue liste (sets, illustrateurs).
// La valeur choisie part dans le formulaire par un champ caché nommé `nom`.
export function ChoixListe({
  nom,
  titre,
  placeholder,
  options,
  valeur,
  libelleValeur,
  changer,
}: {
  nom: string;
  titre: string;
  placeholder: string;
  options: Option[] | null;
  valeur: string | null;
  libelleValeur: string | null;
  changer?: (choix: Option | null) => void; // prévenu à chaque choix (aperçu en direct)
}) {
  const [choix, setChoix] = useState<{ id: string; label: string } | null>(
    valeur ? { id: valeur, label: libelleValeur ?? "…" } : null,
  );
  const [texte, setTexte] = useState("");
  const choisir = (o: Option | null) => {
    setChoix(o);
    changer?.(o);
  };

  const mots = simplifier(texte).split(/\s+/).filter(Boolean);
  const trouves = mots.length && options
    ? options.filter((o) => {
        const t = simplifier(`${o.label} ${o.detail ?? ""}`);
        return mots.every((m) => t.includes(m));
      }).slice(0, 8)
    : [];

  return (
    <div className="flex flex-col gap-1.5 text-sm font-semibold">
      <span>{titre}</span>
      <input type="hidden" name={nom} value={choix?.id ?? ""} />
      {choix ? (
        <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-accent bg-accent-doux px-3 text-[15px] text-accent-texte">
          <span className="truncate">{options?.find((o) => o.id === choix.id)?.label ?? choix.label}</span>
          <button type="button" onClick={() => choisir(null)} aria-label={`Retirer ${choix.label}`} className="flex size-8 shrink-0 items-center justify-center">
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              // Entrée choisit la première suggestion au lieu d'envoyer le formulaire.
              if (e.key === "Enter") {
                e.preventDefault();
                if (trouves[0]) { choisir(trouves[0]); setTexte(""); }
              }
            }}
            placeholder={options ? placeholder : "Chargement…"}
            disabled={!options}
            aria-label={titre}
            className="h-11 w-full rounded-xl border border-ligne bg-fond px-3 text-[15px] font-normal"
          />
          {mots.length > 0 && options && (
            <ul className="flex flex-col overflow-hidden rounded-xl border border-ligne bg-fond font-normal">
              {trouves.length === 0 && <li className="px-3 py-2.5 text-encre-douce">Aucun résultat</li>}
              {trouves.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => { choisir(o); setTexte(""); }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-puce"
                  >
                    <span className="truncate">{o.label}</span>
                    {o.detail && <span className="shrink-0 text-xs text-encre-douce">{o.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
