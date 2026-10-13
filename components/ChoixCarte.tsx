"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cartesDeMaCollection, chercherDansCatalogue, versionsFamille, type Version } from "@/app/(app)/classeurs/actions";
import { CardImage } from "@/components/CardImage";
import { LANGUES, libelleLangue, type CarteResultat } from "@/lib/catalogue";
import type { CarteListe } from "@/lib/collection";

export type CarteChoisie = CarteListe & { possedee: boolean };

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Choix d'une carte pour une case : dans sa collection, ou dans tout le catalogue
// (une carte présente en plusieurs langues demande ensuite laquelle).
export function ChoixCarte({ titre, choisir, fermer }: { titre: string; choisir: (c: CarteChoisie) => void; fermer: () => void }) {
  const [onglet, setOnglet] = useState<"collection" | "catalogue">("collection");
  const [texte, setTexte] = useState("");
  const [langue, setLangue] = useState<string | null>(null);
  const [miennes, setMiennes] = useState<CarteListe[] | null>(null);
  const [resultats, setResultats] = useState<CarteResultat[] | null>(null);
  const [famille, setFamille] = useState<{
    tuile: CarteResultat;
    versions: Version[];
  } | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [placee, setPlacee] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  // Fermer avec Échap, et bloquer le défilement de la page derrière.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", touche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", touche);
      document.body.style.overflow = avant;
    };
  }, [fermer]);

  useEffect(() => {
    cartesDeMaCollection()
      .then(setMiennes)
      .catch(() => setErreur(true));
  }, []);
  const possedees = useMemo(() => new Set((miennes ?? []).map((c) => c.card_id)), [miennes]);

  // Recherche dans le catalogue, 300 ms après la dernière frappe ; une réponse en retard est ignorée.
  const demande = useRef(0);
  useEffect(() => {
    if (onglet !== "catalogue") return;
    const numero = ++demande.current;
    if (texte.trim().length < 2) return;
    const minuteur = setTimeout(() => {
      setCharge(true);
      chercherDansCatalogue(texte, langue)
        .then((r) => numero === demande.current && setResultats(r))
        .catch(() => numero === demande.current && setErreur(true))
        .finally(() => numero === demande.current && setCharge(false));
    }, 300);
    return () => clearTimeout(minuteur);
  }, [texte, langue, onglet]);

  const prendre = (c: CarteChoisie) => {
    choisir(c);
    setFamille(null);
    setPlacee(c.nom);
    champ.current?.focus();
  };

  const toucherTuile = async (r: CarteResultat) => {
    const nom = r.search_name_fr ?? r.name;
    if (r.card_entity_id && r.languages.length > 1 && !langue) {
      const versions = await versionsFamille(r.card_entity_id).catch(() => []);
      if (versions.length > 1) return setFamille({ tuile: r, versions });
    }
    prendre({
      card_id: r.card_id,
      nom,
      language: r.language,
      number: r.number,
      image_small: r.image_small,
      set_nom: r.set_display_name,
      possedee: possedees.has(r.card_id),
    });
  };

  const affiches = texte.trim().length < 2 ? null : resultats;

  const filtrees = useMemo(() => {
    const t = sansAccents(texte.trim());
    return (miennes ?? []).filter((c) => !t || sansAccents(`${c.nom} ${c.set_nom ?? ""} ${c.number ?? ""}`).includes(t));
  }, [miennes, texte]);

  return (
    <div role="dialog" aria-modal="true" aria-label={titre} className="fixed inset-0 z-40 flex justify-center bg-black/40 lg:items-center lg:p-6">
      <div className="flex h-full w-full flex-col bg-fond pt-[env(safe-area-inset-top)] lg:h-[85dvh] lg:max-w-3xl lg:rounded-3xl lg:border lg:border-ligne">
        <header className="flex flex-col gap-3 border-b border-ligne p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-titre text-lg font-extrabold">{titre}</h2>
            <button type="button" onClick={fermer} className="h-10 rounded-full border border-ligne bg-surface px-4 text-sm font-semibold">
              Terminé
            </button>
          </div>
          <div role="tablist" aria-label="Où chercher" className="grid grid-cols-2 rounded-xl bg-puce p-1">
            {(["collection", "catalogue"] as const).map((o) => (
              <button
                key={o}
                type="button"
                role="tab"
                aria-selected={onglet === o}
                onClick={() => {
                  setOnglet(o);
                  setFamille(null);
                }}
                className={`h-9 rounded-lg text-sm font-bold ${onglet === o ? "bg-surface" : "text-encre-douce"}`}
              >
                {o === "collection" ? "Ma collection" : "Tout le catalogue"}
              </button>
            ))}
          </div>
          <input
            ref={champ}
            type="search"
            autoFocus
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={onglet === "collection" ? "Filtrer mes cartes" : "Nom de la carte, en français"}
            aria-label={onglet === "collection" ? "Filtrer mes cartes" : "Chercher une carte"}
            className="h-12 rounded-xl border border-ligne bg-surface px-3 text-base"
          />
          {onglet === "catalogue" && (
            <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Langue">
              {[{ code: null, label: "Toutes" }, ...LANGUES].map((l) => (
                <button
                  key={l.label}
                  type="button"
                  aria-pressed={langue === l.code}
                  onClick={() => setLangue(l.code)}
                  className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${langue === l.code ? "border-encre bg-encre text-fond" : "border-ligne bg-surface"}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
          {placee && (
            <p role="status" className="text-sm text-vert">
              « {placee} » est placée. Choisis la suivante, ou touche Terminé.
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {erreur ? (
            <p className="text-sm text-terracotta">La recherche n&apos;a pas répondu. Réessaie dans un instant.</p>
          ) : famille ? (
            <div className="flex flex-col gap-3">
              <button type="button" onClick={() => setFamille(null)} className="h-10 w-fit text-sm font-semibold text-encre-douce">
                ‹ Retour aux résultats
              </button>
              <p className="font-bold">Quelle langue pour « {famille.tuile.search_name_fr ?? famille.tuile.name} » ?</p>
              <ul className="flex flex-col gap-2">
                {famille.versions.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() =>
                        prendre({
                          card_id: v.id,
                          nom: famille.tuile.search_name_fr ?? famille.tuile.name,
                          language: v.language,
                          number: v.number,
                          image_small: v.image_small,
                          set_nom: v.set_nom,
                          possedee: possedees.has(v.id),
                        })
                      }
                      className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-ligne bg-surface p-2 text-left hover:bg-puce"
                    >
                      <span className="w-11 shrink-0">
                        <CardImage src={v.image_small} alt="" lang={libelleLangue(v.language)} />
                      </span>
                      <span className="rounded-md bg-[#1f1814] px-1.5 py-0.5 text-[11px] font-bold text-[#fbf6f0]">{libelleLangue(v.language)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {v.set_nom ?? ""}
                        {v.number ? ` · ${v.number}` : ""}
                      </span>
                      {possedees.has(v.id) && <span className="text-xs font-bold text-vert">Possédée</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : onglet === "collection" ? (
            miennes === null ? (
              <p className="text-sm text-encre-douce">Chargement de ta collection…</p>
            ) : filtrees.length === 0 ? (
              <p className="text-sm text-encre-douce">
                {miennes.length === 0 ? "Ta collection est vide : cherche dans tout le catalogue." : "Aucune de tes cartes ne correspond."}
              </p>
            ) : (
              <Tuiles>
                {filtrees.map((c) => (
                  <Tuile
                    key={c.card_id}
                    image={c.image_small}
                    nom={c.nom}
                    langues={[c.language]}
                    detail={`${c.set_nom ?? ""}${c.number ? ` · ${c.number}` : ""}`}
                    possedee={false}
                    onClick={() => prendre({ ...c, possedee: true })}
                  />
                ))}
              </Tuiles>
            )
          ) : affiches === null ? (
            <p className="text-sm text-encre-douce">{charge ? "Recherche…" : "Tape au moins 2 lettres du nom de la carte."}</p>
          ) : affiches.length === 0 ? (
            <p className="text-sm text-encre-douce">{charge ? "Recherche…" : "Aucune carte trouvée."}</p>
          ) : (
            <Tuiles>
              {affiches.map((r) => (
                <Tuile
                  key={r.card_id}
                  image={r.image_small}
                  nom={r.search_name_fr ?? r.name}
                  langues={r.languages?.length ? r.languages : [r.language]}
                  detail={`${r.set_display_name ?? ""}${r.number ? ` · ${r.number}` : ""}`}
                  possedee={possedees.has(r.card_id)}
                  onClick={() => toucherTuile(r)}
                />
              ))}
            </Tuiles>
          )}
        </div>
      </div>
    </div>
  );
}

function Tuiles({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">{children}</ul>;
}

function Tuile({
  image,
  nom,
  langues,
  detail,
  possedee,
  onClick,
}: {
  image: string | null;
  nom: string;
  langues: string[];
  detail: string;
  possedee: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full flex-col gap-1 rounded-xl p-1 text-left hover:bg-puce">
        <span className="relative block">
          <CardImage src={image} alt={nom} lang={libelleLangue(langues[0])} />
          {image && (
            <span className="absolute bottom-1 left-1 flex gap-0.5">
              {langues.map((l) => (
                <span key={l} className="rounded bg-[#1f1814] px-1 py-0.5 text-[9px] font-bold text-[#fbf6f0]">
                  {libelleLangue(l)}
                </span>
              ))}
            </span>
          )}
          {possedee && <span className="absolute top-1 right-1 rounded bg-vert px-1 py-0.5 text-[9px] font-bold text-sur-vert">Possédée</span>}
        </span>
        <span className="truncate text-xs font-semibold">{nom}</span>
        <span className="truncate text-[11px] text-encre-douce">{detail}</span>
      </button>
    </li>
  );
}
