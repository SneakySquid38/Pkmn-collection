import Link from "next/link";
import { redirect } from "next/navigation";
import { AvecFiche } from "@/components/AvecFiche";
import { ClasseurAuto, type Voir } from "@/components/ClasseurAuto";
import { ClasseurPages } from "@/components/ClasseurPages";
import { EtatVide } from "@/components/EtatVide";
import { Progression } from "@/components/Progression";
import { ReglagesClasseur } from "@/components/ReglagesClasseur";
import { CARTES_MAX, cheminClasseur, libellesRegle, lireClasseur, nettoyerRegle, RACINE, type Sorte } from "@/lib/classeurs";
import { profilConnecte } from "@/lib/profil";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

// Un classeur automatique (/classeurs/[id]) ou un binder (/binders/[id]).
// Ouvert depuis le mauvais menu, il est renvoyé vers le bon (anciens liens).
export async function VueClasseur({ id, sp, sorte }: { id: string; sp: Params; sorte: Sorte }) {
  const nom = sorte === "binder" ? "Le binder" : "Le classeur";
  const profil = await profilConnecte();
  if (!profil) return null;
  const { supabase, id: moi } = profil;

  let lu: Awaited<ReturnType<typeof lireClasseur>> = null;
  let erreur = false;
  if (UUID.test(id)) {
    try {
      lu = await lireClasseur(supabase, id);
    } catch {
      erreur = true;
    }
  }

  if (!lu) {
    return (
      <div className="flex flex-col gap-4">
        <Retour href={RACINE[sorte]} libelle={sorte === "binder" ? "Binders" : "Classeurs"} />
        {erreur ? (
          <EtatVide titre={`${nom} n'a pas répondu`}>Réessaie dans un instant.</EtatVide>
        ) : (
          <EtatVide titre={`${sorte === "binder" ? "Binder" : "Classeur"} introuvable`}>Il a peut-être été supprimé.</EtatVide>
        )}
      </div>
    );
  }

  const { classeur, cases } = lu;
  if (classeur.kind !== sorte) {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`${cheminClasseur(classeur)}${q.size ? `?${q}` : ""}`);
  }
  const proprietaire = classeur.user_id === moi;
  const { data: auteur } = proprietaire
    ? { data: null }
    : await supabase.from("profiles").select("display_name").eq("id", classeur.user_id).maybeSingle();

  const pageDemandee = Number(typeof sp.page === "string" ? sp.page : 1);
  const page = Number.isInteger(pageDemandee) ? Math.min(Math.max(pageDemandee, 1), classeur.pages) : 1;
  const carte = typeof sp.carte === "string" ? sp.carte : null;
  const base = cheminClasseur(classeur);
  const possedees = cases.filter((c) => c.possedee).length;
  const auto = classeur.kind === "classeur";
  const retour = proprietaire ? RACINE[sorte] : `${RACINE[sorte]}?membre=${classeur.user_id}`;
  const voir: Voir = sp.voir === "a-trouver" || sp.voir === "possedees" ? sp.voir : "toutes";
  const suite = auto && voir !== "toutes" ? `&voir=${voir}` : "";
  const libelles = auto ? await libellesRegle(supabase, nettoyerRegle(classeur.rule)) : [];

  return (
    <AvecFiche
      carte={carte}
      fermer={`${base}?page=${page}${suite}`}
      lienCarte={(c) => `${base}?page=${page}${suite}&carte=${c}`}
      pleinEcran
    >
      {/* Sur téléphone, l'en-tête tient en deux lignes pour laisser toute la place à la page du classeur. */}
      <header className="flex shrink-0 flex-col gap-3 max-lg:gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Retour
            href={retour}
            libelle={`${auto ? "Classeurs" : "Binders"}${proprietaire ? "" : ` de ${auteur?.display_name ?? "ce membre"}`}`}
          />
          <h1 className="min-w-0 flex-1 truncate text-base font-extrabold lg:hidden">{classeur.name}</h1>
          {proprietaire &&
            (auto ? (
              <Link
                href={`${base}/filtres`}
                className="flex h-10 shrink-0 items-center rounded-full border border-ligne bg-surface px-4 text-sm font-semibold max-lg:h-8 max-lg:px-3 max-lg:text-xs"
              >
                Modifier
              </Link>
            ) : (
              <ReglagesClasseur classeur={classeur} />
            ))}
        </div>
        {/* Un seul des deux titres est affiché (et lu) selon la taille d'écran. */}
        <h1 className="font-titre text-[26px] leading-tight font-extrabold tracking-tight max-lg:hidden lg:text-3xl">{classeur.name}</h1>
        {auto && (
          <ul aria-label="Filtres du classeur" className="flex flex-wrap gap-1.5 max-lg:hidden">
            {libelles.map((l) => (
              <li key={l} className="rounded-full bg-accent-doux px-3 py-1 text-xs font-semibold text-accent-texte">
                {l}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1.5 max-lg:flex-row-reverse max-lg:items-center max-lg:gap-2.5">
          <div className="flex justify-between text-sm max-lg:shrink-0 max-lg:gap-1.5 max-lg:text-xs">
            <span>
              <strong>
                {possedees} / {cases.length}
              </strong>{" "}
              possédée{possedees > 1 ? "s" : ""}
              {!proprietaire && auteur?.display_name ? ` par ${auteur.display_name}` : ""}
            </span>
            <span className="text-encre-douce">{cases.length ? Math.round((possedees / cases.length) * 100) : 0} %</span>
          </div>
          <span className="max-lg:min-w-0 max-lg:flex-1">
            <Progression possedees={possedees} total={cases.length} grande />
          </span>
        </div>
      </header>

      {auto && cases.length >= CARTES_MAX && (
        <p className="shrink-0 text-sm text-terracotta max-lg:text-xs">Ce classeur s&apos;arrête aux {CARTES_MAX.toLocaleString("fr-FR")} premières cartes : ajoute un filtre.</p>
      )}
      {auto ? (
        <ClasseurAuto key={classeur.slots_per_page} classeur={classeur} cases={cases} voirInitial={voir} pageInitiale={page} ouverte={carte} />
      ) : (
        <ClasseurPages key={classeur.slots_per_page} classeur={classeur} cases={cases} pageInitiale={page} proprietaire={proprietaire} ouverte={carte} />
      )}
    </AvecFiche>
  );
}

function Retour({ href, libelle = "Classeurs" }: { href: string; libelle?: string }) {
  return (
    <Link
      href={href}
      aria-label={`Retour : ${libelle}`}
      className="flex h-11 min-w-0 items-center gap-1 rounded-xl pr-3 text-sm font-semibold text-encre-douce max-lg:size-9 max-lg:shrink-0 max-lg:justify-center max-lg:pr-0"
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="truncate max-lg:hidden">{libelle}</span>
    </Link>
  );
}
