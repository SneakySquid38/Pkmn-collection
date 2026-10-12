"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { listesFiltres, type OptionListe } from "@/app/(app)/recherche/actions";
import { ChoixListe } from "@/components/ChoixListe";
import { CATEGORIES, LANGUES, versParams, type Filtres } from "@/lib/catalogue";

type Option = { valeur: string; label: string };

// Champ de recherche, puces de langue et tiroir de filtres.
// Chaque changement réécrit l'adresse : la page serveur relance la recherche.
export function BarreRecherche({
  filtres,
  raretes,
  series,
  annees,
  nomSet,
  nomIllustrateur,
}: {
  filtres: Filtres;
  raretes: Option[];
  series: Option[];
  annees: number[];
  nomSet: string | null;
  nomIllustrateur: string | null;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const [q, setQ] = useState(filtres.q);
  // Langues cochées tout de suite à l'écran, sans attendre la réponse du serveur :
  // deux clics rapides ne s'écrasent plus.
  const [langues, setLangues] = useState(filtres.langues);
  const languesServeur = filtres.langues.join(",");
  useEffect(() => setLangues(languesServeur ? languesServeur.split(",") : []), [languesServeur]);
  const [, demarrer] = useTransition();
  const tiroir = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);

  const [listes, setListes] = useState<{ sets: OptionListe[]; illustrateurs: OptionListe[] } | null>(null);

  // Dernier texte envoyé dans l'adresse. Si l'adresse change avec un autre texte, c'est qu'elle
  // a changé ailleurs (lien vers un illustrateur, bouton retour) : on recale le champ.
  // Une réponse en retard pour un texte qu'on a nous-mêmes envoyé ne réécrit plus le champ.
  const envoye = useRef(filtres.q);
  useEffect(() => {
    if (filtres.q !== envoye.current) {
      envoye.current = filtres.q;
      setQ(filtres.q);
    }
  }, [filtres.q]);

  const aller = (f: Filtres) => {
    envoye.current = f.q;
    setLangues(f.langues);
    const p = versParams(f).toString();
    demarrer(() => router.replace(p ? `${chemin}?${p}` : chemin, { scroll: false }));
  };

  // Recherche lancée 300 ms après la dernière frappe.
  useEffect(() => {
    if (q.trim() === envoye.current) return;
    const t = setTimeout(() => aller({ ...filtres, langues, q: q.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const basculerLangue = (code: string) => {
    aller({
      ...filtres,
      q: q.trim(),
      langues: langues.includes(code) ? langues.filter((l) => l !== code) : [...langues, code],
    });
  };

  // Champ vidé (croix ou touche effacer) : retour tout de suite à l'accueil de la recherche.
  const effacer = () => {
    setQ("");
    aller({ ...filtres, langues, q: "" });
    champ.current?.focus();
  };

  const ouvrirFiltres = () => {
    tiroir.current?.showModal();
    if (!listes) listesFiltres().then(setListes).catch(() => setListes({ sets: [], illustrateurs: [] }));
  };

  const nbFiltres = [filtres.rarete, filtres.serie, filtres.annee, filtres.categorie, filtres.set, filtres.illustrateur].filter(Boolean).length;

  // Une puce par filtre actif, pour le voir et le retirer sans rouvrir le tiroir.
  type Actif = { cle: string; label: string; retirer: Partial<Filtres> };
  const actifs = ([
    filtres.set && { cle: "set", label: nomSet ?? "Set", retirer: { set: null } },
    filtres.illustrateur && { cle: "illustrateur", label: nomIllustrateur ?? "Illustrateur", retirer: { illustrateur: null } },
    filtres.rarete && { cle: "rarete", label: raretes.find((r) => r.valeur === filtres.rarete)?.label ?? filtres.rarete, retirer: { rarete: null } },
    filtres.serie && { cle: "serie", label: series.find((x) => x.valeur === filtres.serie)?.label ?? filtres.serie, retirer: { serie: null } },
    filtres.annee && { cle: "annee", label: String(filtres.annee), retirer: { annee: null } },
    filtres.categorie && { cle: "categorie", label: filtres.categorie, retirer: { categorie: null } },
  ] as (Actif | null | false | "" | 0)[]).filter((x): x is Actif => Boolean(x));

  const appliquer = (form: FormData) => {
    const val = (k: string) => (form.get(k) as string) || null;
    aller({
      ...filtres,
      q: q.trim(),
      langues,
      rarete: val("rarete"),
      serie: val("serie"),
      annee: val("annee") ? Number(val("annee")) : null,
      categorie: val("categorie"),
      set: val("set"),
      illustrateur: val("illustrateur"),
    });
    tiroir.current?.close();
  };

  const puce = "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold";
  const select = "h-11 w-full rounded-xl border border-ligne bg-fond px-3 text-[15px]";

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-12 items-center gap-2 rounded-2xl border border-ligne bg-surface px-3 focus-within:border-accent">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-encre-douce">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={champ}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pokémon, carte, set, numéro…"
          aria-label="Rechercher une carte"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-encre-douce"
        />
        {q && (
          <button type="button" onClick={effacer} aria-label="Effacer la recherche" className="flex size-8 items-center justify-center rounded-full bg-puce">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <button
          type="button"
          onClick={ouvrirFiltres}
          className={`${puce} ${nbFiltres ? "border-accent bg-accent-doux text-accent-texte" : "border-ligne bg-surface"}`}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filtres{nbFiltres ? ` · ${nbFiltres}` : ""}
        </button>
        {LANGUES.map((l) => {
          const actif = langues.includes(l.code);
          return (
            <button
              key={l.code}
              type="button"
              aria-pressed={actif}
              title={l.nom}
              onClick={() => basculerLangue(l.code)}
              className={`${puce} ${actif ? "border-encre bg-encre text-fond" : "border-ligne bg-surface"}`}
            >
              {l.label}
            </button>
          );
        })}
        {actifs.map((f) => (
          <button
            key={f.cle}
            type="button"
            onClick={() => aller({ ...filtres, q: q.trim(), langues, ...f.retirer })}
            className={`${puce} max-w-[16rem] border-accent bg-accent-doux text-accent-texte`}
          >
            <span className="truncate">{f.label}</span> <span aria-label="Retirer ce filtre">✕</span>
          </button>
        ))}
      </div>

      <dialog
        ref={tiroir}
        aria-label="Filtres"
        className="m-auto mb-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-0 text-encre backdrop:bg-black/40 lg:mb-auto lg:rounded-3xl"
      >
        <form key={versParams(filtres).toString()} action={appliquer} className="flex flex-col gap-4 p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          <div className="flex items-center justify-between">
            <h2 className="font-titre text-xl font-extrabold">Filtres</h2>
            <button type="button" onClick={() => tiroir.current?.close()} aria-label="Fermer" className="flex size-11 items-center justify-center rounded-full">
              ✕
            </button>
          </div>
          <ChoixListe
            nom="set"
            titre="Set"
            placeholder="Nom du set, code, année…"
            options={listes?.sets ?? null}
            valeur={filtres.set}
            libelleValeur={nomSet}
          />
          <ChoixListe
            nom="illustrateur"
            titre="Illustrateur"
            placeholder="Nom de l'illustrateur…"
            options={listes?.illustrateurs ?? null}
            valeur={filtres.illustrateur}
            libelleValeur={nomIllustrateur}
          />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Rareté
            <select name="rarete" defaultValue={filtres.rarete ?? ""} className={select}>
              <option value="">Toutes</option>
              {raretes.map((r) => <option key={r.valeur} value={r.valeur}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Série
            <select name="serie" defaultValue={filtres.serie ?? ""} className={select}>
              <option value="">Toutes</option>
              {series.map((s) => <option key={s.valeur} value={s.valeur}>{s.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Année
              <select name="annee" defaultValue={filtres.annee ?? ""} className={select}>
                <option value="">Toutes</option>
                {annees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Catégorie
              <select name="categorie" defaultValue={filtres.categorie ?? ""} className={select}>
                <option value="">Toutes</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                aller({ ...filtres, q: q.trim(), langues, rarete: null, serie: null, annee: null, categorie: null, set: null, illustrateur: null });
                tiroir.current?.close();
              }}
              className="h-12 rounded-2xl border border-ligne font-semibold"
            >
              Tout effacer
            </button>
            <button type="submit" className="h-12 rounded-2xl bg-accent font-bold text-[#1f1814]">
              Appliquer
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
