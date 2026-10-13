"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { ajouterPage, deplacerCarte, placerCarte, retirerPage, viderCase, type Resultat } from "@/app/(app)/classeurs/actions";
import { ChoixCarte, type CarteChoisie } from "@/components/ChoixCarte";
import { libelleLangue } from "@/lib/catalogue";
import { DISPOSITION, type Case, type Classeur } from "@/lib/classeurs";

// Les pages d'un classeur, une à la fois. Le propriétaire remplit les cases vides (choix d'une carte),
// et en mode « Ranger » déplace ou retire les cartes : toucher une carte, puis la case où la mettre.
export function ClasseurPages({
  classeur,
  cases,
  pageInitiale,
  proprietaire,
  ouverte,
}: {
  classeur: Classeur;
  cases: Case[];
  pageInitiale: number;
  proprietaire: boolean;
  ouverte: string | null;
}) {
  const router = useRouter();
  const n = classeur.slots_per_page;
  const [colonnes] = DISPOSITION[n];

  const [locales, setLocales] = useState(() => new Map(cases.map((c) => [c.position, c])));
  const [pages, setPages] = useState(classeur.pages);
  const [page, setPage] = useState(pageInitiale);
  const [ranger, setRanger] = useState(false);
  const [selection, setSelection] = useState<number | null>(null);
  const [cible, setCible] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  // Le serveur fait foi : à chaque rafraîchissement, on reprend ses cases, ses pages et la page demandée.
  const [recu, setRecu] = useState({
    cases,
    pages: classeur.pages,
    page: pageInitiale,
  });
  if (recu.cases !== cases || recu.pages !== classeur.pages || recu.page !== pageInitiale) {
    if (recu.cases !== cases) setLocales(new Map(cases.map((c) => [c.position, c])));
    if (recu.pages !== classeur.pages) setPages(classeur.pages);
    if (recu.page !== pageInitiale) setPage(pageInitiale);
    setRecu({ cases, pages: classeur.pages, page: pageInitiale });
  }

  const capacite = pages * n;
  const debut = (page - 1) * n;
  const pageVide = useMemo(() => [...locales.keys()].every((p) => p < debut || p >= debut + n), [locales, debut, n]);

  const aller = (p: number) => {
    const suivante = Math.min(Math.max(p, 1), pages);
    setPage(suivante);
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(suivante));
    window.history.replaceState(null, "", `?${params}`);
  };

  // Glisser le doigt vers la gauche ou la droite pour tourner les pages.
  const depart = useRef<number | null>(null);
  const toucherDebut = (e: React.TouchEvent) => (depart.current = e.touches[0].clientX);
  const toucherFin = (e: React.TouchEvent) => {
    if (depart.current === null) return;
    const ecart = e.changedTouches[0].clientX - depart.current;
    depart.current = null;
    if (Math.abs(ecart) > 60) aller(page + (ecart < 0 ? 1 : -1));
  };

  // Change l'écran tout de suite, puis enregistre ; en cas d'échec, le serveur remet le bon état.
  const enregistrer = (local: () => void, action: () => Promise<Resultat<unknown>>) => {
    setErreur(null);
    local();
    demarrer(async () => {
      const r = await action();
      if (!r.ok) setErreur(r.erreur);
      router.refresh();
    });
  };

  const deplacer = (de: number, vers: number) =>
    enregistrer(
      () => {
        setLocales((avant) => {
          const m = new Map(avant);
          const a = m.get(de);
          const b = m.get(vers);
          m.delete(de);
          m.delete(vers);
          if (a) m.set(vers, { ...a, position: vers });
          if (b) m.set(de, { ...b, position: de });
          return m;
        });
        setSelection(null);
      },
      () => deplacerCarte(classeur.id, de, vers),
    );

  const retirer = (pos: number) =>
    enregistrer(
      () => {
        setLocales((avant) => {
          const m = new Map(avant);
          m.delete(pos);
          return m;
        });
        setSelection(null);
      },
      () => viderCase(classeur.id, pos),
    );

  const placer = (pos: number, carte: CarteChoisie) => {
    enregistrer(
      () =>
        setLocales((avant) =>
          new Map(avant).set(pos, {
            ...carte,
            card_id: carte.card_id,
            position: pos,
            possedee: carte.possedee,
          }),
        ),
      () => placerCarte(classeur.id, pos, carte.card_id),
    );
    // Case libre suivante, pour remplir le classeur à la suite.
    let suivante = pos + 1;
    while (suivante < capacite && locales.has(suivante)) suivante++;
    setCible(suivante < capacite ? suivante : null);
    if (suivante < capacite && Math.floor(suivante / n) + 1 !== page) aller(Math.floor(suivante / n) + 1);
  };

  const nouvellePage = () =>
    enregistrer(
      () => {
        setPages((p) => p + 1);
        setPage(pages + 1);
        const params = new URLSearchParams(window.location.search);
        params.set("page", String(pages + 1));
        window.history.replaceState(null, "", `?${params}`);
      },
      () => ajouterPage(classeur.id),
    );

  const enleverPage = () =>
    enregistrer(
      () => {
        setPages((p) => p - 1);
        aller(page - 1);
      },
      () => retirerPage(classeur.id),
    );

  const toucherCase = (pos: number) => {
    const carte = locales.get(pos);
    if (selection !== null) {
      if (selection === pos) setSelection(null);
      else deplacer(selection, pos);
    } else if (carte) {
      setSelection(pos);
    } else {
      setCible(pos);
    }
  };

  const fermerChoix = useCallback(() => setCible(null), []);
  const choisie = selection !== null ? locales.get(selection) : null;
  const numero = (pos: number) => `case ${(pos % n) + 1}, page ${Math.floor(pos / n) + 1}`;
  const lienFiche = (id: string) => `/classeurs/${classeur.id}?page=${page}&carte=${id}`;

  return (
    <section aria-label={`Page ${page} sur ${pages}`} aria-busy={enCours} className="flex flex-col gap-3">
      {proprietaire && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-encre-douce">
            {ranger ? "Touche une carte, puis la case où la mettre." : "Touche une case vide pour y mettre une carte."}
          </p>
          <button
            type="button"
            aria-pressed={ranger}
            onClick={() => {
              setRanger((r) => !r);
              setSelection(null);
            }}
            className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${ranger ? "border-accent bg-accent text-[#1f1814]" : "border-ligne bg-surface"}`}
          >
            {ranger ? "Terminé" : "Ranger"}
          </button>
        </div>
      )}

      <div onTouchStart={toucherDebut} onTouchEnd={toucherFin} className="rounded-2xl border border-ligne bg-puce p-3 sm:p-4">
        <ol
          className="mx-auto grid gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))`,
            maxWidth: `${colonnes * 170}px`,
          }}
        >
          {Array.from({ length: n }, (_, i) => {
            const pos = debut + i;
            const c = locales.get(pos);
            const choisi = selection === pos;
            const contenu = c ? <Visuel carte={c} /> : <CaseVide ajout={proprietaire && !ranger} cible={selection !== null} />;
            const classe = `block w-full rounded-lg text-left outline-offset-2 ${choisi ? "ring-3 ring-accent" : ""} ${c && c.card_id === ouverte ? "ring-2 ring-accent" : ""}`;
            return (
              <li key={pos}>
                {proprietaire && (ranger || !c) ? (
                  <button
                    type="button"
                    onClick={() => toucherCase(pos)}
                    aria-pressed={ranger && c ? choisi : undefined}
                    aria-label={
                      c
                        ? `${c.nom}, ${c.possedee ? "possédée" : "à trouver"}, ${numero(pos)}`
                        : `${numero(pos)}, vide${selection !== null ? " : déplacer ici" : " : ajouter une carte"}`
                    }
                    className={classe}
                  >
                    {contenu}
                  </button>
                ) : c ? (
                  <Link
                    href={lienFiche(c.card_id)}
                    scroll={false}
                    className={classe}
                    aria-label={`${c.nom}, ${c.possedee ? "possédée" : "à trouver"}`}
                  >
                    {contenu}
                  </Link>
                ) : (
                  <div className={classe}>{contenu}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {choisie && selection !== null && (
        <div className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3">
          <p className="text-sm">
            <strong>{choisie.nom}</strong> · {numero(selection)}. Touche une case, sur n&apos;importe quelle page, pour l&apos;y mettre.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => retirer(selection)}
              className="h-11 flex-1 rounded-xl border border-terracotta font-semibold text-terracotta"
            >
              Retirer du classeur
            </button>
            <button type="button" onClick={() => setSelection(null)} className="h-11 flex-1 rounded-xl border border-ligne font-semibold">
              Annuler
            </button>
          </div>
        </div>
      )}

      <nav aria-label="Pages du classeur" className="flex items-center justify-between gap-2">
        <BoutonPage sens="precedente" onClick={() => aller(page - 1)} disabled={page <= 1} />
        {pages > 3 ? (
          <label className="flex items-center gap-1.5 text-sm font-semibold">
            Page
            <select value={page} onChange={(e) => aller(Number(e.target.value))} className="h-10 rounded-xl border border-ligne bg-surface px-2">
              {Array.from({ length: pages }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
            / {pages}
          </label>
        ) : (
          <span className="text-sm font-semibold">
            Page {page} / {pages}
          </span>
        )}
        <BoutonPage sens="suivante" onClick={() => aller(page + 1)} disabled={page >= pages} />
      </nav>

      {proprietaire && ranger && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={nouvellePage} className="h-11 rounded-xl border border-ligne bg-surface px-4 text-sm font-semibold">
            Ajouter une page
          </button>
          {page === pages && pages > 1 && pageVide && (
            <button
              type="button"
              onClick={enleverPage}
              className="h-11 rounded-xl border border-ligne bg-surface px-4 text-sm font-semibold text-terracotta"
            >
              Retirer cette page
            </button>
          )}
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-sm text-terracotta">
          {erreur}
        </p>
      )}

      {cible !== null && <ChoixCarte titre={`Choisir une carte · ${numero(cible)}`} choisir={(carte) => placer(cible, carte)} fermer={fermerChoix} />}
    </section>
  );
}

// Carte d'une case : en couleur si possédée, en grisé « À trouver » sinon.
function Visuel({ carte }: { carte: Case }) {
  const langue = libelleLangue(carte.language);
  return (
    <span className="relative block">
      {carte.image_small ? (
        <img
          src={carte.image_small}
          alt=""
          width={245}
          height={342}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={`aspect-[63/88] h-auto w-full rounded-lg bg-surface object-cover ${carte.possedee ? "" : "opacity-40 grayscale"}`}
        />
      ) : (
        <span
          className={`flex aspect-[63/88] w-full flex-col items-center justify-center gap-1 rounded-lg border border-ligne bg-surface p-2 text-center ${carte.possedee ? "" : "opacity-60"}`}
        >
          <span className="line-clamp-3 text-xs leading-tight font-bold">{carte.nom}</span>
          <span className="text-[10px] text-encre-douce">
            {langue}
            {carte.number ? ` · ${carte.number}` : ""}
          </span>
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded-md bg-[#1f1814] px-1.5 py-0.5 text-[10px] font-bold text-[#fbf6f0]">{langue}</span>
      {!carte.possedee && (
        <span className="absolute inset-x-1 top-1 rounded-md bg-surface/90 px-1 py-0.5 text-center text-[10px] font-bold text-terracotta">
          À trouver
        </span>
      )}
    </span>
  );
}

function CaseVide({ ajout, cible }: { ajout: boolean; cible: boolean }) {
  return (
    <span
      className={`flex aspect-[63/88] w-full items-center justify-center rounded-lg border-[1.5px] border-dashed ${cible ? "border-accent bg-accent-doux" : "border-ligne bg-fond/60"}`}
    >
      {(ajout || cible) && (
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-encre-douce"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </span>
  );
}

function BoutonPage({ sens, onClick, disabled }: { sens: "precedente" | "suivante"; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={sens === "precedente" ? "Page précédente" : "Page suivante"}
      className="flex size-11 items-center justify-center rounded-full border border-ligne bg-surface disabled:opacity-40"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={sens === "precedente" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
