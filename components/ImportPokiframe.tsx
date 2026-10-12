"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { analyserImport, annulerImport, importer, type Analyse, type CarteTrouvee } from "@/app/(app)/import/actions";
import { CardImage } from "@/components/CardImage";
import { libelleLangue } from "@/lib/catalogue";
import { LANGUES_POKIFRAME, lireExport, type LignePokiframe } from "@/lib/pokiframe";

type Onglet = "reconnue" | "a_choisir" | "introuvable" | "deja" | "absentes";

const ONGLETS: { cle: Onglet; label: string; aide: string }[] = [
  { cle: "reconnue", label: "Reconnues", aide: "Ces cartes seront ajoutées à ta collection." },
  { cle: "a_choisir", label: "À choisir", aide: "Plusieurs cartes correspondent : choisis la bonne pour chacune." },
  { cle: "introuvable", label: "Introuvables", aide: "Pas encore dans le catalogue (souvent des sets très récents). Elles sont gardées de côté et seront retentées au prochain import." },
  { cle: "deja", label: "Déjà importées", aide: "Déjà ajoutées par un import précédent, avec la même quantité : rien ne change." },
  { cle: "absentes", label: "Plus dans le fichier", aide: "Importées avant, mais absentes de ce fichier. Rien n'est retiré sauf si tu choisis « Retirer »." },
];

// Écran d'import : lecture du fichier dans le navigateur, aperçu, puis import en une fois.
export function ImportPokiframe() {
  const [fichier, setFichier] = useState<{ nom: string; collection: string; lignes: LignePokiframe[] } | null>(null);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("reconnue");
  const [choix, setChoix] = useState<Record<number, string>>({});
  const [retirer, setRetirer] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [lot, setLot] = useState<string | null>(null);
  const [annule, setAnnule] = useState(false);
  const [enCours, demarrer] = useTransition();
  const champ = useRef<HTMLInputElement>(null);

  const lire = async (f: File) => {
    setErreur(null);
    setAnalyse(null);
    setLot(null);
    setAnnule(false);
    setChoix({});
    setRetirer(new Set());
    try {
      const { nom, lignes } = lireExport(await f.text());
      setFichier({ nom: f.name, collection: nom, lignes });
      demarrer(async () => {
        try {
          const a = await analyserImport(lignes);
          setAnalyse(a);
          setOnglet(a.lignes.some((l) => l.statut === "reconnue") ? "reconnue" : "introuvable");
        } catch {
          setErreur("L'analyse n'a pas abouti. Réessaie dans un instant.");
        }
      });
    } catch (e) {
      setFichier(null);
      setErreur(e instanceof Error ? e.message : "Fichier illisible.");
    }
  };

  const parLigne = new Map(fichier?.lignes.map((l) => [l.i, l]) ?? []);
  const compte = (s: Onglet) => (s === "absentes" ? analyse?.absentes.length ?? 0 : analyse?.lignes.filter((l) => l.statut === s).length ?? 0);
  const choisies = analyse?.lignes.filter((l) => l.statut === "a_choisir" && choix[l.i]).length ?? 0;
  const aAjouter = (analyse?.lignes.filter((l) => l.statut === "reconnue").length ?? 0) + choisies;

  const lancerImport = () => {
    if (!fichier || !analyse) return;
    setErreur(null);
    const lignes = analyse.lignes.map((a) => ({
      ...parLigne.get(a.i)!,
      card_id: a.statut === "reconnue" || a.statut === "deja" ? a.cartes[0]?.id ?? null : a.statut === "a_choisir" ? choix[a.i] ?? null : null,
    }));
    demarrer(async () => {
      try {
        setLot(await importer(fichier.nom, lignes, [...retirer]));
      } catch {
        setErreur("L'import n'a pas abouti, rien n'a été enregistré. Réessaie dans un instant.");
      }
    });
  };

  const annuler = () => {
    if (!lot) return;
    demarrer(async () => {
      try {
        await annulerImport(lot);
        setAnnule(true);
      } catch {
        setErreur("L'annulation n'a pas abouti. Tu peux réessayer depuis l'historique.");
      }
    });
  };

  if (lot) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-ligne bg-surface p-5">
        <h2 className="font-titre text-xl font-extrabold">{annule ? "Import annulé" : "Import terminé"}</h2>
        <p className="text-sm text-encre-douce">
          {annule
            ? "Ta collection est revenue à son état d'avant l'import."
            : `${aAjouter} carte${aAjouter > 1 ? "s" : ""} ajoutée${aAjouter > 1 ? "s" : ""} ou mise${aAjouter > 1 ? "s" : ""} à jour${retirer.size ? `, ${retirer.size} retirée${retirer.size > 1 ? "s" : ""}` : ""}. Les introuvables sont gardées pour le prochain import.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/collection" className="flex h-12 items-center justify-center rounded-2xl bg-accent font-bold text-[#1f1814]">
            Voir ma collection
          </Link>
          {!annule && (
            <button type="button" onClick={annuler} disabled={enCours} className="h-12 rounded-2xl border border-ligne font-semibold disabled:opacity-50">
              Annuler cet import
            </button>
          )}
        </div>
        {erreur && <p role="alert" className="text-sm text-terracotta">{erreur}</p>}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-3 rounded-2xl border border-ligne bg-surface p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{fichier ? fichier.nom : "Choisis ton export Pokiframe"}</p>
          <p className="text-sm text-encre-douce">
            {fichier
              ? `${fichier.lignes.length} ligne${fichier.lignes.length > 1 ? "s" : ""} · rien n'est enregistré avant validation`
              : "Dans Pokiframe : Collection, Exporter, JSON. Le fichier est lu sur ton appareil."}
          </p>
        </div>
        <input
          ref={champ}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) lire(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => champ.current?.click()}
          className={`h-11 shrink-0 rounded-xl px-4 font-semibold ${fichier ? "border border-ligne" : "bg-accent font-bold text-[#1f1814]"}`}
        >
          {fichier ? "Changer" : "Choisir le fichier"}
        </button>
      </section>

      {erreur && <p role="alert" className="rounded-xl border border-terracotta p-3 text-sm text-terracotta">{erreur}</p>}
      {enCours && !analyse && <p className="text-sm text-encre-douce" aria-live="polite">Recherche des cartes dans le catalogue…</p>}

      {analyse && fichier && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label="Résultat de l'analyse">
            {ONGLETS.filter((o) => o.cle !== "absentes" || compte("absentes") > 0).map((o) => (
              <button
                key={o.cle}
                type="button"
                role="tab"
                aria-selected={onglet === o.cle}
                onClick={() => setOnglet(o.cle)}
                className={`flex flex-col items-start rounded-2xl border p-3 text-left ${onglet === o.cle ? "border-accent bg-accent-doux" : "border-ligne bg-surface"}`}
              >
                <span className="font-titre text-2xl font-extrabold">{compte(o.cle)}</span>
                <span className="text-xs font-semibold text-encre-douce">{o.label}</span>
              </button>
            ))}
          </div>

          <p className="text-sm text-encre-douce">{ONGLETS.find((o) => o.cle === onglet)?.aide}</p>

          <ul className="flex flex-col gap-2">
            {onglet === "absentes"
              ? analyse.absentes.map((a) => (
                  <li key={a.ligne_id} className="flex items-center gap-3 rounded-xl border border-ligne bg-surface p-2">
                    <Vignette carte={a.carte} />
                    <Texte titre={a.carte?.nom ?? a.nom} detail={detailCarte(a.carte)} />
                    <div className="flex shrink-0 gap-1" role="group" aria-label="Garder ou retirer">
                      {[false, true].map((r) => (
                        <button
                          key={String(r)}
                          type="button"
                          aria-pressed={retirer.has(a.ligne_id) === r}
                          onClick={() => setRetirer((s) => { const n = new Set(s); if (r) n.add(a.ligne_id); else n.delete(a.ligne_id); return n; })}
                          className={`h-9 rounded-lg border px-2.5 text-xs font-semibold ${retirer.has(a.ligne_id) === r ? (r ? "border-terracotta bg-terracotta text-white" : "border-encre bg-encre text-fond") : "border-ligne"}`}
                        >
                          {r ? "Retirer" : "Garder"}
                        </button>
                      ))}
                    </div>
                  </li>
                ))
              : analyse.lignes
                  .filter((l) => l.statut === onglet)
                  .map((l) => {
                    const src = parLigne.get(l.i)!;
                    const carte = l.cartes[0] ?? null;
                    return (
                      <li key={l.i} className="flex flex-col gap-2 rounded-xl border border-ligne bg-surface p-2">
                        <div className="flex items-center gap-3">
                          {l.statut === "reconnue" || l.statut === "deja" ? <Vignette carte={carte} /> : <Vignette carte={null} langue={src.langue} />}
                          <Texte
                            titre={l.statut === "reconnue" || l.statut === "deja" ? carte?.nom ?? src.nom : src.nom}
                            detail={
                              l.statut === "reconnue" || l.statut === "deja"
                                ? detailCarte(carte)
                                : [LANGUES_POKIFRAME[src.langue] ?? src.langue, src.set, src.numero ? `n° ${src.numero}` : null].filter(Boolean).join(" · ")
                            }
                          />
                          <span className="shrink-0 text-sm font-bold">
                            ×{src.quantite}
                            {l.statut === "reconnue" && l.qte_deja > 0 && <span className="block text-xs font-normal text-encre-douce">avant ×{l.qte_deja}</span>}
                          </span>
                        </div>
                        {l.statut === "a_choisir" && (
                          <div className="flex gap-2 overflow-x-auto" role="radiogroup" aria-label={`Choisir la carte pour ${src.nom}`}>
                            {l.cartes.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                role="radio"
                                aria-checked={choix[l.i] === c.id}
                                onClick={() => setChoix((x) => ({ ...x, [l.i]: c.id }))}
                                className={`w-20 shrink-0 rounded-lg p-1 text-left text-[11px] ${choix[l.i] === c.id ? "bg-accent-doux ring-2 ring-accent" : "border border-ligne"}`}
                              >
                                <CardImage src={c.image_small} alt={c.nom} lang={libelleLangue(c.language)} />
                                <span className="mt-1 block truncate">{c.set_nom}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
          </ul>

          <div className="sticky bottom-24 flex flex-col gap-1 rounded-2xl border border-ligne bg-surface p-3 shadow-lg lg:bottom-4">
            <button
              type="button"
              onClick={lancerImport}
              disabled={enCours || (aAjouter === 0 && retirer.size === 0)}
              className="h-12 rounded-2xl bg-accent font-bold text-[#1f1814] disabled:opacity-50"
            >
              {enCours
                ? "Import en cours…"
                : `Importer ${aAjouter} carte${aAjouter > 1 ? "s" : ""}${retirer.size ? ` et en retirer ${retirer.size}` : ""}`}
            </button>
            <p className="text-center text-xs text-encre-douce">Annulable ensuite depuis l&apos;historique des imports</p>
          </div>
        </>
      )}
    </div>
  );
}

function detailCarte(c: CarteTrouvee | null) {
  if (!c) return "";
  return [libelleLangue(c.language), c.set_nom, c.number ? `n° ${c.number}` : null].filter(Boolean).join(" · ");
}

// Petite image de la carte ; sans image, un cadre avec la langue (le cadre complet de CardImage est trop chargé à cette taille).
function Vignette({ carte, langue }: { carte: CarteTrouvee | null; langue?: string }) {
  const lang = carte ? libelleLangue(carte.language) : LANGUES_POKIFRAME[langue ?? ""] ?? "?";
  return (
    <span className="w-11 shrink-0">
      {carte?.image_small ? (
        <CardImage src={carte.image_small} alt={carte.nom} lang={lang} />
      ) : (
        <span aria-hidden="true" className="flex aspect-[63/88] w-full items-end justify-start rounded-md border border-ligne bg-puce p-1">
          <span className="rounded bg-[#1f1814] px-1 text-[9px] font-bold text-[#fbf6f0]">{lang}</span>
        </span>
      )}
    </span>
  );
}

function Texte({ titre, detail }: { titre: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold">{titre}</span>
      <span className="truncate text-xs text-encre-douce">{detail}</span>
    </span>
  );
}
