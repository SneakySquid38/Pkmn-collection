"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { candidatsLigne, choisirCartes, marquerAbsente, type Candidate } from "@/app/(app)/import/actions";
import { CardImage } from "@/components/CardImage";
import { libelleVersion } from "@/lib/catalogue";
import { LANGUES_POKIFRAME } from "@/lib/pokiframe";

export type LigneATrouver = {
  ligne: string;
  nom: string; // nom Pokiframe (anglais pour les cartes asiatiques)
  set: string | null;
  code: string | null;
  numero: string | null;
  langue: string;
  quantite: number;
  fichier: string | null;
  importe_le: string;
  absente: boolean;
  suggestion: Candidate | null;
};

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Cartes Pokiframe que l'import n'a pas reconnues : on choisit la bonne version à la main,
// parmi des candidates triées (même Pokémon, même langue, même numéro, set proche).
export function ATrouver({ lignes }: { lignes: LigneATrouver[] }) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<"a_trouver" | "absentes">("a_trouver");
  const [faites, setFaites] = useState<Set<string>>(new Set());
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const restantes = lignes.filter((l) => !faites.has(l.ligne));
  const aTrouver = restantes.filter((l) => !l.absente);
  const absentes = restantes.filter((l) => l.absente);
  const sures = aTrouver.filter((l) => l.suggestion?.sure);
  const affichees = onglet === "a_trouver" ? aTrouver : absentes;

  const terminer = (ids: string[], texte: string) => {
    setFaites((f) => new Set([...f, ...ids]));
    setOuverte(null);
    setMessage(texte);
    router.refresh();
  };

  const choisir = (choix: { ligne: string; card: string }[]) => {
    setErreur(null);
    demarrer(async () => {
      try {
        const n = await choisirCartes(choix);
        terminer(choix.map((c) => c.ligne), `${n} carte${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} à ta collection.`);
      } catch {
        setErreur("L'ajout n'a pas abouti. Réessaie dans un instant.");
      }
    });
  };

  const absente = (l: LigneATrouver, valeur: boolean) => {
    setErreur(null);
    demarrer(async () => {
      try {
        await marquerAbsente(l.ligne, valeur);
        terminer([l.ligne], valeur ? `${l.nom} est rangée dans « Absentes du catalogue ».` : `${l.nom} est de nouveau à trouver.`);
      } catch {
        setErreur("Le changement n'a pas abouti. Réessaie dans un instant.");
      }
    });
  };

  if (!lignes.length) {
    return <p className="rounded-2xl border border-ligne bg-surface p-5 text-sm text-encre-douce">Toutes les cartes de tes imports Pokiframe ont été reconnues. Rien à trouver à la main.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-encre-douce">
        Les cartes de tes imports Pokiframe que le site n&apos;a pas reconnues. Touche une carte pour choisir la bonne version : les plus probables
        (même Pokémon, même langue, même numéro) sont en tête.
      </p>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Cartes à trouver">
        {(
          [
            ["a_trouver", aTrouver.length, "À trouver"],
            ["absentes", absentes.length, "Absentes du catalogue"],
          ] as const
        ).map(([cle, n, label]) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={onglet === cle}
            onClick={() => {
              setOnglet(cle);
              setOuverte(null);
            }}
            className={`flex flex-col items-start rounded-2xl border p-3 text-left ${onglet === cle ? "border-accent bg-accent-doux" : "border-ligne bg-surface"}`}
          >
            <span className="font-titre text-2xl font-extrabold">{n}</span>
            <span className="text-xs font-semibold text-encre-douce">{label}</span>
          </button>
        ))}
      </div>

      {message && <p aria-live="polite" className="rounded-xl border border-ligne bg-surface p-3 text-sm">{message}</p>}
      {erreur && <p role="alert" className="rounded-xl border border-terracotta p-3 text-sm text-terracotta">{erreur}</p>}

      {onglet === "a_trouver" && sures.length > 0 && (
        <section className="flex items-center gap-3 rounded-2xl border border-ligne bg-surface p-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{sures.length} suggestion{sures.length > 1 ? "s" : ""} sûre{sures.length > 1 ? "s" : ""}</span>
            <span className="block text-xs text-encre-douce">Même Pokémon, même numéro et même set, sans autre carte proche. Vérifie-les dans la liste.</span>
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => choisir(sures.map((l) => ({ ligne: l.ligne, card: l.suggestion!.id })))}
            className="h-11 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-[#1f1814] disabled:opacity-50"
          >
            Tout valider
          </button>
        </section>
      )}

      {affichees.length === 0 && (
        <p className="text-sm text-encre-douce">{onglet === "a_trouver" ? "Plus rien à trouver." : "Aucune carte rangée ici."}</p>
      )}

      <ul className="flex flex-col gap-2">
        {affichees.map((l) => {
          const s = l.suggestion;
          const ouvert = ouverte === l.ligne;
          return (
            <li key={l.ligne} className={`flex flex-col gap-2 rounded-xl border bg-surface p-2 ${ouvert ? "border-accent" : "border-ligne"}`}>
              <button type="button" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : l.ligne)} className="flex items-center gap-3 text-left">
                <span className="w-11 shrink-0">
                  {s && !l.absente ? (
                    <CardImage src={s.image_small} alt={s.nom} lang={libelleVersion(s.language)} />
                  ) : (
                    <span aria-hidden="true" className="flex aspect-[63/88] w-full items-end rounded-md border border-ligne bg-puce p-1">
                      <span className="rounded bg-[#1f1814] px-1 text-[9px] font-bold text-[#fbf6f0]">{LANGUES_POKIFRAME[l.langue] ?? "?"}</span>
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {l.nom}
                    {l.quantite > 1 && <span className="font-normal text-encre-douce"> ×{l.quantite}</span>}
                  </span>
                  <span className="truncate text-xs text-encre-douce">
                    {[LANGUES_POKIFRAME[l.langue] ?? l.langue, l.set, l.numero?.trim() ? `n° ${l.numero.trim()}` : "sans numéro"].filter(Boolean).join(" · ")}
                  </span>
                  {s && !l.absente && (
                    <span className="truncate text-xs">
                      {s.sure ? "✓ " : ""}
                      {s.nom} · {s.set_nom} · n° {s.number}
                      <span className="text-encre-douce">{s.sure ? " (sûre)" : s.meme_numero ? " (à vérifier)" : " (pas au même numéro)"}</span>
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="shrink-0 text-sm font-semibold text-encre-douce">{ouvert ? "Fermer" : "Choisir"}</span>
              </button>
              {ouvert && <Choix ligne={l} enCours={enCours} choisir={(card) => choisir([{ ligne: l.ligne, card }])} absente={(v) => absente(l, v)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Les candidates d'une ligne : même numéro d'abord, puis les autres cartes du Pokémon, filtrables.
function Choix({
  ligne,
  enCours,
  choisir,
  absente,
}: {
  ligne: LigneATrouver;
  enCours: boolean;
  choisir: (card: string) => void;
  absente: (valeur: boolean) => void;
}) {
  const [cartes, setCartes] = useState<Candidate[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");

  // Chargement des candidates à l'ouverture.
  useEffect(() => {
    let actif = true;
    candidatsLigne(ligne.ligne)
      .then((c) => {
        if (!actif) return;
        setCartes(c);
        if (c[0]?.meme_numero) setChoisie(c[0].id);
      })
      .catch(() => actif && setErreur(true));
    return () => {
      actif = false;
    };
  }, [ligne.ligne]);

  const memeNumero = useMemo(() => (cartes ?? []).filter((c) => c.meme_numero), [cartes]);
  const autres = useMemo(() => {
    const t = sansAccents(filtre.trim());
    return (cartes ?? []).filter((c) => !c.meme_numero && (!t || sansAccents(`${c.nom} ${c.set_nom ?? ""} ${c.number ?? ""}`).includes(t)));
  }, [cartes, filtre]);

  if (erreur) return <p role="alert" className="text-sm text-terracotta">Les cartes candidates n&apos;ont pas pu être chargées.</p>;
  if (!cartes) return <p className="text-sm text-encre-douce" aria-live="polite">Recherche des cartes candidates…</p>;

  const tuiles = (liste: Candidate[]) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`Choisir la carte pour ${ligne.nom}`}>
      {liste.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={choisie === c.id}
          onClick={() => setChoisie(c.id)}
          className={`rounded-lg p-1 text-left text-[11px] ${choisie === c.id ? "bg-accent-doux ring-2 ring-accent" : "border border-ligne"}`}
        >
          <CardImage src={c.image_small} alt={c.nom} lang={libelleVersion(c.language)} />
          <span className="mt-1 block truncate font-semibold">{c.nom}</span>
          <span className="block truncate text-encre-douce">{c.set_nom}</span>
          <span className="block truncate text-encre-douce">
            n° {c.number} · {libelleVersion(c.language)}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 border-t border-ligne pt-2">
      {memeNumero.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-bold text-encre-douce">Même numéro ({memeNumero.length})</h3>
          {tuiles(memeNumero)}
        </section>
      ) : (
        <p className="text-xs text-encre-douce">
          Aucune carte de ce Pokémon au n° {ligne.numero?.trim() || "?"} dans le catalogue : la bonne version manque peut-être. Les plus proches sont ci-dessous.
        </p>
      )}

      {autres.length > 0 || filtre ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-bold text-encre-douce">{memeNumero.length ? "Autres cartes proches" : "Cartes proches"}</h3>
          {(cartes.length > 12 || filtre) && (
            <input
              type="search"
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              placeholder="Filtrer par set, numéro ou nom"
              className="h-10 rounded-xl border border-ligne bg-fond px-3 text-sm"
            />
          )}
          {tuiles(autres)}
        </section>
      ) : null}

      {cartes.length === 0 && <p className="text-xs text-encre-douce">Aucune carte candidate dans cette langue.</p>}

      <div className="sticky bottom-24 flex gap-2 rounded-xl bg-surface py-1 lg:bottom-4">
        <button
          type="button"
          disabled={!choisie || enCours}
          onClick={() => choisie && choisir(choisie)}
          className="h-11 flex-1 rounded-xl bg-accent text-sm font-bold text-[#1f1814] disabled:opacity-50"
        >
          {enCours ? "Ajout…" : `Ajouter cette carte${ligne.quantite > 1 ? ` ×${ligne.quantite}` : ""}`}
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => absente(!ligne.absente)}
          className="h-11 shrink-0 rounded-xl border border-ligne px-3 text-sm font-semibold disabled:opacity-50"
        >
          {ligne.absente ? "Remettre à trouver" : "Absente du catalogue"}
        </button>
      </div>
    </div>
  );
}
