"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { apercuClasseur, creerClasseurAuto, listesClasseur, modifierClasseurAuto, supprimerClasseur, type Apercu } from "@/app/(app)/classeurs/actions";
import type { OptionListe } from "@/app/(app)/recherche/actions";
import { ChoixFormat } from "@/components/ChoixFormat";
import { ChoixListe } from "@/components/ChoixListe";
import { CATEGORIES, LANGUES, libelleLangue } from "@/lib/catalogue";
import { CARTES_MAX, NOM_MAX, regleAssezPrecise, type Format, type Regle } from "@/lib/classeurs";

type Option = { valeur: string; label: string };
type Listes = { pokemons: OptionListe[]; sets: OptionListe[]; illustrateurs: OptionListe[] };
// Libellés des choix faits dans les longues listes, pour le nom proposé.
type Libelles = { pokemon?: string; illustrateur?: string; set?: string };

// Formulaire d'un classeur automatique : des filtres, un aperçu en direct, un nom proposé à partir des filtres.
// Sert à la création et à la modification (`existant`).
export function CreationClasseur({
  raretes,
  series,
  annees,
  existant,
}: {
  raretes: Option[];
  series: Option[];
  annees: number[];
  existant?: { id: string; nom: string; format: Format; regle: Regle; libelles: Libelles };
}) {
  const router = useRouter();
  const [regle, setRegle] = useState<Regle>(existant?.regle ?? { langues: ["FR"] });
  const [libelles, setLibelles] = useState<Libelles>(existant?.libelles ?? {});
  const [nomSaisi, setNomSaisi] = useState<string | null>(existant?.nom ?? null);
  const [format, setFormat] = useState<Format>(existant?.format ?? 9);
  const [listes, setListes] = useState<Listes | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [calcul, setCalcul] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    listesClasseur()
      .then(setListes)
      .catch(() => setListes({ pokemons: [], sets: [], illustrateurs: [] }));
  }, []);

  // Aperçu 400 ms après le dernier changement ; une réponse en retard est ignorée.
  const precise = regleAssezPrecise(regle);
  const demande = useRef(0);
  useEffect(() => {
    const numero = ++demande.current;
    if (!precise) return;
    const minuteur = setTimeout(() => {
      setCalcul(true);
      apercuClasseur(regle)
        .then((r) => numero === demande.current && setApercu(r.ok ? r.valeur : null))
        .finally(() => numero === demande.current && setCalcul(false));
    }, 400);
    return () => clearTimeout(minuteur);
  }, [regle, precise]);

  const changer = (champ: Partial<Regle>) => {
    setErreur(null);
    setRegle((r) => {
      const suivante = { ...r, ...champ };
      for (const cle of Object.keys(champ) as (keyof Regle)[]) if (suivante[cle] === undefined || suivante[cle] === "") delete suivante[cle];
      return suivante;
    });
  };
  const choixListe = (cle: keyof Libelles) => (o: OptionListe | null) => {
    setLibelles((l) => ({ ...l, [cle]: o?.label }));
    changer({ [cle]: o?.id });
  };
  const basculerLangue = (code: string) => {
    const langues = regle.langues.includes(code) ? regle.langues.filter((l) => l !== code) : [...regle.langues, code];
    if (langues.length) changer({ langues: LANGUES.map((l) => l.code as string).filter((c) => langues.includes(c)) });
  };

  // Nom proposé : « Pikachu · sowsow · JP ». Il suit les filtres tant qu'on ne l'a pas écrit soi-même.
  const nomPropose = useMemo(() => {
    const morceaux = [
      libelles.pokemon && regle.pokemon ? libelles.pokemon : null,
      libelles.illustrateur && regle.illustrateur ? libelles.illustrateur : null,
      libelles.set && regle.set ? libelles.set : null,
      series.find((s) => s.valeur === regle.serie)?.label,
      raretes.find((r) => r.valeur === regle.rarete)?.label,
      regle.categorie,
      regle.annee ? String(regle.annee) : null,
      regle.nom ? `« ${regle.nom} »` : null,
    ].filter(Boolean);
    return [...morceaux, regle.langues.map(libelleLangue).join(" + ")].join(" · ").slice(0, NOM_MAX);
  }, [regle, libelles, series, raretes]);
  const nom = nomSaisi ?? (precise ? nomPropose : "");

  const affiche = precise ? apercu : null;
  const bloque = !precise || !affiche || affiche.plein || affiche.total === 0;

  const valider = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    demarrer(async () => {
      if (existant) {
        const r = await modifierClasseurAuto(existant.id, nom, format, regle);
        if (!r.ok) return setErreur(r.erreur);
        router.push(`/classeurs/${existant.id}`);
        router.refresh();
      } else {
        const r = await creerClasseurAuto(nom, format, regle);
        if (!r.ok) return setErreur(r.erreur);
        router.push(`/classeurs/${r.valeur}`);
      }
    });
  };

  const supprimer = () => {
    if (!existant || !window.confirm(`Supprimer le classeur « ${existant.nom} » ? Les cartes restent dans ta collection.`)) return;
    demarrer(async () => {
      const r = await supprimerClasseur(existant.id);
      if (!r.ok) return setErreur(r.erreur);
      router.push("/classeurs");
    });
  };

  const select = "h-11 w-full rounded-xl border border-ligne bg-fond px-3 text-[15px] font-normal";
  const puce = "flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold";

  return (
    <form onSubmit={valider} className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-ligne bg-surface p-4">
        <h2 className="font-titre text-lg font-extrabold">Quelles cartes ?</h2>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Langues</legend>
          <div className="flex flex-wrap gap-2">
            {LANGUES.map((l) => {
              const actif = regle.langues.includes(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={actif}
                  title={l.nom}
                  onClick={() => basculerLangue(l.code)}
                  className={`${puce} ${actif ? "border-encre bg-encre text-fond" : "border-ligne bg-fond"}`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <ChoixListe
          nom="pokemon"
          titre="Pokémon"
          placeholder="Pikachu, Évoli…"
          options={listes?.pokemons ?? null}
          valeur={regle.pokemon ?? null}
          libelleValeur={libelles.pokemon ?? null}
          changer={choixListe("pokemon")}
        />
        <ChoixListe
          nom="illustrateur"
          titre="Illustrateur"
          placeholder="sowsow, Mitsuhiro Arita…"
          options={listes?.illustrateurs ?? null}
          valeur={regle.illustrateur ?? null}
          libelleValeur={libelles.illustrateur ?? null}
          changer={choixListe("illustrateur")}
        />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Série
          <select value={regle.serie ?? ""} onChange={(e) => changer({ serie: e.target.value || undefined })} className={select}>
            <option value="">Toutes</option>
            {series.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <ChoixListe
          nom="set"
          titre="Set"
          placeholder="Nom du set, code, année…"
          options={listes?.sets ?? null}
          valeur={regle.set ?? null}
          libelleValeur={libelles.set ?? null}
          changer={choixListe("set")}
        />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Rareté
          <select value={regle.rarete ?? ""} onChange={(e) => changer({ rarete: e.target.value || undefined })} className={select}>
            <option value="">Toutes</option>
            {raretes.map((r) => (
              <option key={r.valeur} value={r.valeur}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Catégorie
            <select value={regle.categorie ?? ""} onChange={(e) => changer({ categorie: e.target.value || undefined })} className={select}>
              <option value="">Toutes</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Année
            <select
              value={regle.annee ?? ""}
              onChange={(e) => changer({ annee: e.target.value ? Number(e.target.value) : undefined })}
              className={select}
            >
              <option value="">Toutes</option>
              {annees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Nom de carte contenant
          <input
            type="search"
            value={regle.nom ?? ""}
            maxLength={40}
            onChange={(e) => changer({ nom: e.target.value || undefined })}
            placeholder="dracaufeu, ex, méga…"
            className="h-11 rounded-xl border border-ligne bg-fond px-3 text-[15px] font-normal"
          />
        </label>
      </section>

      <section aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-ligne bg-surface p-4">
        <h2 className="font-titre text-lg font-extrabold">Aperçu</h2>
        {!precise ? (
          <p className="text-sm text-encre-douce">Choisis au moins un filtre en plus de la langue : un Pokémon, un illustrateur, une série…</p>
        ) : !affiche ? (
          <p className="text-sm text-encre-douce">{calcul ? "Calcul…" : "L'aperçu n'a pas répondu. Change un filtre pour réessayer."}</p>
        ) : affiche.total === 0 ? (
          <p className="text-sm text-encre-douce">Aucune carte ne correspond à ces filtres.</p>
        ) : (
          <>
            <p className={`text-sm ${calcul ? "opacity-60" : ""}`}>
              <strong>
                {affiche.plein ? `Plus de ${CARTES_MAX.toLocaleString("fr-FR")}` : affiche.total.toLocaleString("fr-FR")} carte{affiche.total > 1 ? "s" : ""}
              </strong>
              {!affiche.plein && ` · ${affiche.possedees} déjà possédée${affiche.possedees > 1 ? "s" : ""}`}
            </p>
            {affiche.plein && <p className="text-sm text-terracotta">C&apos;est trop pour un classeur : ajoute un filtre.</p>}
            <ul className="grid grid-cols-6 gap-1.5">
              {affiche.cartes.map((c) => (
                <li key={c.card_id}>
                  {c.image_small ? (
                    <img
                      src={c.image_small}
                      alt={c.nom}
                      width={245}
                      height={342}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className={`aspect-[63/88] h-auto w-full rounded-md object-cover ${c.possedee ? "" : "opacity-35"}`}
                    />
                  ) : (
                    <span className={`flex aspect-[63/88] items-center justify-center rounded-md border border-ligne p-0.5 text-center text-[9px] ${c.possedee ? "" : "opacity-50"}`}>
                      {c.nom}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-ligne bg-surface p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Nom du classeur</span>
          <input
            required
            maxLength={NOM_MAX}
            value={nom}
            onChange={(e) => setNomSaisi(e.target.value)}
            placeholder="Proposé à partir des filtres"
            className="h-12 rounded-xl border border-ligne bg-fond px-3 text-base"
          />
          {nomSaisi !== null && precise && nomSaisi !== nomPropose && (
            <button type="button" onClick={() => setNomSaisi(null)} className="w-fit text-sm font-semibold text-accent-texte underline">
              Reprendre le nom proposé : {nomPropose}
            </button>
          )}
        </label>
        <ChoixFormat valeur={format} changer={setFormat} />
      </section>

      {erreur && (
        <p role="alert" className="text-sm text-terracotta">
          {erreur}
        </p>
      )}
      <button type="submit" disabled={enCours || bloque || !nom.trim()} className="h-13 rounded-2xl bg-accent font-bold text-[#1f1814] disabled:opacity-50">
        {enCours ? "Enregistrement…" : existant ? "Enregistrer" : "Créer le classeur"}
      </button>
      {existant && (
        <button type="button" onClick={supprimer} disabled={enCours} className="h-11 rounded-xl border border-terracotta font-semibold text-terracotta">
          Supprimer le classeur
        </button>
      )}
    </form>
  );
}
