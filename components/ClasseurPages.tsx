"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ajouterAuClasseur, ajouterPage, deplacerCarte, placerCarte, retirerPage, viderCase, type Resultat } from "@/app/(app)/classeurs/actions";
import { ChoixCarte, type CarteChoisie } from "@/components/ChoixCarte";
import { libelleLangue } from "@/lib/catalogue";
import { cheminClasseur, DISPOSITION, type Case, type Classeur } from "@/lib/classeurs";

// Les pages d'un classeur, une à la fois. Dans un binder, le propriétaire remplit les cases vides (choix d'une carte),
// déplace les cartes par glisser-déposer (maintenir le doigt, ou cliquer-glisser à la souris), et en mode « Ranger »
// les déplace ou les retire au toucher : une carte, puis la case où la mettre.
export function ClasseurPages({
  classeur,
  cases,
  pageInitiale,
  proprietaire,
  ouverte,
  parametres = "",
}: {
  classeur: Classeur;
  cases: Case[];
  pageInitiale: number;
  proprietaire: boolean;
  ouverte: string | null;
  parametres?: string; // gardés dans le lien vers la fiche (filtre d'un classeur automatique)
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
  const [aLaSuite, setALaSuite] = useState(false);
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
    if (depart.current === null || sansClic.current) return;
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

  // « Ajouter des cartes » : chaque carte choisie va dans la première case libre, avec une page en plus si le binder est plein.
  const ajouterSuite = (carte: CarteChoisie) => {
    let pos = 0;
    while (locales.has(pos)) pos++;
    const pageCible = Math.floor(pos / n) + 1;
    enregistrer(
      () => {
        setLocales((avant) => new Map(avant).set(pos, { ...carte, position: pos, possedee: carte.possedee }));
        if (pos >= capacite) setPages((p) => Math.max(p, pageCible));
        setPage(pageCible);
        const params = new URLSearchParams(window.location.search);
        params.set("page", String(pageCible));
        window.history.replaceState(null, "", `?${params}`);
      },
      () => ajouterAuClasseur(classeur.id, carte.card_id),
    );
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

  // --- Glisser-déposer -------------------------------------------------------------------------
  // Souris : la carte part après 6 px. Doigt : après 300 ms d'appui sans bouger (sinon c'est un défilement).
  // La carte lâchée sur une case y va ; si la case est prise, les deux cartes s'échangent.
  // Survoler une flèche de page tourne la page, pour déposer ailleurs dans le binder.
  const glisse = useRef<{ de: number; x: number; y: number; id: number; souris: boolean; largeur: number; actif: boolean; minuteur?: number } | null>(
    null,
  );
  const [deplace, setDeplace] = useState<{ de: number; survol: number | null; x: number; y: number; largeur: number } | null>(null);
  const fantome = useRef<HTMLDivElement>(null);
  const sansClic = useRef(false);
  const tourne = useRef<{ sens: number; minuteur: number } | null>(null);

  // Pendant un glisser au doigt, la page ne doit pas défiler (écouteur non passif, impossible en React).
  useEffect(() => {
    if (!proprietaire) return;
    const bloquer = (e: TouchEvent) => glisse.current?.actif && e.cancelable && e.preventDefault();
    document.addEventListener("touchmove", bloquer, { passive: false });
    return () => document.removeEventListener("touchmove", bloquer);
  }, [proprietaire]);

  const arreterTourne = () => {
    if (tourne.current) clearTimeout(tourne.current.minuteur);
    tourne.current = null;
  };

  const finirGlisse = () => {
    if (glisse.current?.minuteur) clearTimeout(glisse.current.minuteur);
    glisse.current = null;
    arreterTourne();
    setDeplace(null);
  };

  const sous = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const caseEl = el?.closest<HTMLElement>("[data-case]");
    const fleche = el?.closest<HTMLElement>("[data-tourne]");
    return { pos: caseEl ? Number(caseEl.dataset.case) : null, sens: fleche && !(fleche as HTMLButtonElement).disabled ? Number(fleche.dataset.tourne) : 0 };
  };

  const lancer = (x: number, y: number) => {
    const g = glisse.current;
    if (!g) return;
    g.actif = true;
    sansClic.current = true;
    setSelection(null);
    setDeplace({ de: g.de, survol: g.de, x, y, largeur: g.largeur });
    navigator.vibrate?.(15);
  };

  const appui = (e: React.PointerEvent<HTMLElement>, pos: number) => {
    if (!proprietaire || !locales.has(pos) || e.button !== 0 || enCours) return;
    const souris = e.pointerType === "mouse";
    glisse.current = { de: pos, x: e.clientX, y: e.clientY, id: e.pointerId, souris, largeur: e.currentTarget.offsetWidth, actif: false };
    if (!souris) {
      const { clientX, clientY } = e;
      glisse.current.minuteur = window.setTimeout(() => lancer(clientX, clientY), 300);
    }
  };

  const bouge = (e: React.PointerEvent) => {
    const g = glisse.current;
    if (!g || e.pointerId !== g.id) return;
    if (!g.actif) {
      const distance = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (g.souris && distance > 6) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        lancer(e.clientX, e.clientY);
      } else if (!g.souris && distance > 10) finirGlisse();
      return;
    }
    if (fantome.current) fantome.current.style.transform = `translate(${e.clientX - g.largeur / 2}px, ${e.clientY - g.largeur * 0.7}px)`;
    const { pos, sens } = sous(e.clientX, e.clientY);
    setDeplace((d) => (d && d.survol !== pos ? { ...d, survol: pos } : d));
    if (sens !== (tourne.current?.sens ?? 0)) {
      arreterTourne();
      if (sens) {
        const tourner = () => {
          setPage((p) => {
            const suivante = Math.min(Math.max(p + sens, 1), pages);
            const params = new URLSearchParams(window.location.search);
            params.set("page", String(suivante));
            window.history.replaceState(null, "", `?${params}`);
            return suivante;
          });
          tourne.current = { sens, minuteur: window.setTimeout(tourner, 800) };
        };
        tourne.current = { sens, minuteur: window.setTimeout(tourner, 450) };
      }
    }
  };

  const lache = (e: React.PointerEvent) => {
    const g = glisse.current;
    if (!g || e.pointerId !== g.id) return;
    if (g.actif) {
      const { pos } = sous(e.clientX, e.clientY);
      if (pos !== null && pos !== g.de && pos < capacite) deplacer(g.de, pos);
    }
    finirGlisse();
  };

  // Après un glisser, le relâchement ne doit pas ouvrir la fiche ni choisir la case.
  const clicApresGlisse = (e: React.MouseEvent) => {
    if (!sansClic.current) return;
    sansClic.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const fermerChoix = useCallback(() => setCible(null), []);
  const fermerSuite = useCallback(() => setALaSuite(false), []);
  const choisie = selection !== null ? locales.get(selection) : null;
  const numero = (pos: number) => `case ${(pos % n) + 1}, page ${Math.floor(pos / n) + 1}`;
  const lienFiche = (id: string) => `${cheminClasseur(classeur)}?page=${page}${parametres ? `&${parametres}` : ""}&carte=${id}`;
  const carteGlissee = deplace ? locales.get(deplace.de) : null;

  return (
    <section aria-label={`Page ${page} sur ${pages}`} aria-busy={enCours} className="flex flex-col gap-3">
      {proprietaire && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-48 flex-1 text-sm text-encre-douce">
            {ranger ? "Touche une carte, puis la case où la mettre." : "Touche une case vide pour la remplir. Maintiens une carte pour la déplacer."}
          </p>
          {!ranger && (
            <button
              type="button"
              onClick={() => setALaSuite(true)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-[#1f1814]"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Ajouter des cartes
            </button>
          )}
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

      <div
        onTouchStart={toucherDebut}
        onTouchEnd={toucherFin}
        onPointerDownCapture={() => (sansClic.current = false)}
        onPointerMove={proprietaire ? bouge : undefined}
        onPointerUp={proprietaire ? lache : undefined}
        onPointerCancel={proprietaire ? finirGlisse : undefined}
        className="rounded-2xl border border-ligne bg-puce p-3 sm:p-4"
      >
        <ol
          onClickCapture={proprietaire ? clicApresGlisse : undefined}
          className={`mx-auto grid gap-2 sm:gap-3 ${proprietaire ? "select-none [-webkit-touch-callout:none]" : ""}`}
          style={{
            gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))`,
            maxWidth: `${colonnes * 170}px`,
          }}
        >
          {Array.from({ length: n }, (_, i) => {
            const pos = debut + i;
            const c = locales.get(pos);
            const choisi = selection === pos;
            const source = deplace?.de === pos;
            const survolee = deplace !== null && deplace.survol === pos && !source;
            const contenu = c ? (
              <Visuel carte={c} />
            ) : (
              <CaseVide ajout={proprietaire && !ranger && !deplace} cible={selection !== null || survolee} />
            );
            const classe = `block w-full rounded-lg text-left outline-offset-2 transition-opacity ${choisi || survolee ? "ring-3 ring-accent" : ""} ${c && c.card_id === ouverte ? "ring-2 ring-accent" : ""} ${source ? "opacity-30" : ""}`;
            return (
              <li
                key={pos}
                data-case={proprietaire ? pos : undefined}
                onPointerDown={proprietaire && c ? (e) => appui(e, pos) : undefined}
                onContextMenu={proprietaire && c ? (e) => e.preventDefault() : undefined}
                onDragStart={proprietaire ? (e) => e.preventDefault() : undefined}
              >
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
                    draggable={!proprietaire}
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
              Retirer du binder
            </button>
            <button type="button" onClick={() => setSelection(null)} className="h-11 flex-1 rounded-xl border border-ligne font-semibold">
              Annuler
            </button>
          </div>
        </div>
      )}

      <nav aria-label="Pages du classeur" className="flex items-center justify-between gap-2">
        <BoutonPage sens="precedente" onClick={() => aller(page - 1)} disabled={page <= 1} survol={deplace !== null} />
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
        <BoutonPage sens="suivante" onClick={() => aller(page + 1)} disabled={page >= pages} survol={deplace !== null} />
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

      {deplace && (
        <>
          {page > 1 && <BordTourne sens={-1} />}
          {page < pages && <BordTourne sens={1} />}
        </>
      )}
      {deplace && carteGlissee && (
        <div
          ref={fantome}
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 z-50"
          style={{ width: deplace.largeur, transform: `translate(${deplace.x - deplace.largeur / 2}px, ${deplace.y - deplace.largeur * 0.7}px)` }}
        >
          <span className="block scale-105 -rotate-3 rounded-lg shadow-2xl">
            <Visuel carte={carteGlissee} />
          </span>
        </div>
      )}

      {aLaSuite && <ChoixCarte titre="Ajouter des cartes à la suite" choisir={ajouterSuite} fermer={fermerSuite} />}
      {cible !== null && <ChoixCarte titre={`Choisir une carte · ${numero(cible)}`} choisir={(carte) => placer(cible, carte)} fermer={fermerChoix} />}
    </section>
  );
}

// Carte d'une case : normale si possédée, en transparence sinon (à trouver).
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
          draggable={false}
          referrerPolicy="no-referrer"
          className={`aspect-[63/88] h-auto w-full rounded-lg bg-surface object-cover ${carte.possedee ? "" : "opacity-35"}`}
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

// Pendant un glisser, bandes au bord de l'écran : y amener la carte tourne la page.
function BordTourne({ sens }: { sens: -1 | 1 }) {
  return (
    <div
      data-tourne={sens}
      aria-hidden="true"
      className={`fixed inset-y-0 z-40 flex w-9 items-center justify-center bg-accent/25 text-2xl font-bold text-accent-texte ${sens < 0 ? "left-0" : "right-0"}`}
    >
      {sens < 0 ? "‹" : "›"}
    </div>
  );
}

// Flèche de page ; pendant un glisser, elle grossit : la survoler tourne la page.
function BoutonPage({ sens, onClick, disabled, survol }: { sens: "precedente" | "suivante"; onClick: () => void; disabled: boolean; survol: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-tourne={sens === "precedente" ? -1 : 1}
      aria-label={sens === "precedente" ? "Page précédente" : "Page suivante"}
      className={`flex items-center justify-center rounded-full border bg-surface transition-all disabled:opacity-40 ${survol && !disabled ? "size-16 border-accent" : "size-11 border-ligne"}`}
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
