import Link from "next/link";
import { EnTete } from "@/components/EnTete";
import { EtatVide } from "@/components/EtatVide";
import { NouveauClasseur } from "@/components/NouveauClasseur";
import { OngletsMembres } from "@/components/OngletsMembres";
import { Progression } from "@/components/Progression";
import { SupprimerClasseur } from "@/components/SupprimerClasseur";
import { cheminClasseur, DISPOSITION, lireClasseurs, RACINE, type ResumeClasseur, type Sorte } from "@/lib/classeurs";
import { lireMembres } from "@/lib/collection";
import { profilConnecte } from "@/lib/profil";

const TEXTES: Record<Sorte, { titre: string; intro: string; vide: string; videAutre: (prenom: string) => string; exemple: string }> = {
  classeur: {
    titre: "Classeurs",
    intro: "Un classeur se remplit tout seul à partir de filtres (illustrateur, Pokémon, série…). Les cartes à trouver sont en transparence.",
    vide: "Pas encore de classeur",
    videAutre: (p) => `${p} n'a pas encore de classeur`,
    exemple: "Par exemple : toutes les cartes de sowsow en japonais, pour voir d'un coup d'œil celles qui te manquent.",
  },
  binder: {
    titre: "Binders",
    intro: "Un binder reproduit tes vrais classeurs : tu places chaque carte dans la case de ton choix.",
    vide: "Pas encore de binder",
    videAutre: (p) => `${p} n'a pas encore de binder`,
    exemple: "Crée un binder par classeur que tu as chez toi, avec le même nombre de cases par page.",
  },
};

// Liste des classeurs (automatiques) ou des binders (rangés à la main) d'un membre.
export async function ListeClasseurs({ sorte, membreDemande }: { sorte: Sorte; membreDemande: string | null }) {
  const profil = await profilConnecte();
  if (!profil) return null;
  const { supabase, id: moi } = profil;
  const t = TEXTES[sorte];

  const membres = await lireMembres(supabase, moi);
  const membre = membres.find((m) => m.id === membreDemande) ?? membres.find((m) => m.id === moi) ?? { id: moi, prenom: profil.prenom };
  const chezMoi = membre.id === moi;

  let classeurs: ResumeClasseur[] = [];
  let erreur = false;
  try {
    ({ liste: classeurs } = await lireClasseurs(supabase, membre.id, sorte));
  } catch {
    erreur = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <EnTete titre={chezMoi ? t.titre : `${t.titre} de ${membre.prenom}`} />
      <OngletsMembres membres={membres} actif={membre.id} moi={moi} chemin={RACINE[sorte]} />
      <p className="text-sm text-encre-douce">{t.intro}</p>

      {erreur ? (
        <EtatVide titre={`Les ${t.titre.toLowerCase()} n'ont pas répondu`}>Réessaie dans un instant.</EtatVide>
      ) : (
        <>
          {classeurs.length === 0 && <EtatVide titre={chezMoi ? t.vide : t.videAutre(membre.prenom)}>{chezMoi && t.exemple}</EtatVide>}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classeurs.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-2xl border border-ligne bg-surface pr-1.5 hover:bg-puce">
                <Link href={cheminClasseur(c)} className="flex min-w-0 flex-1 items-center gap-3.5 p-3">
                  <Couverture classeur={c} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-bold">{c.name}</span>
                    <span className="text-[13px] text-encre-douce">
                      {c.possedees} / {c.total} possédée{c.possedees > 1 ? "s" : ""}
                      {c.kind === "binder" && ` · ${c.pages} page${c.pages > 1 ? "s" : ""} de ${c.slots_per_page}`}
                    </span>
                    <Progression possedees={c.possedees} total={c.total} />
                  </span>
                </Link>
                {chezMoi && <SupprimerClasseur id={c.id} nom={c.name} sorte={sorte} />}
              </li>
            ))}
          </ul>
          {chezMoi &&
            (sorte === "binder" ? (
              <NouveauClasseur />
            ) : (
              <Link
                href="/classeurs/nouveau"
                className="flex h-13 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-accent font-bold"
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nouveau classeur
              </Link>
            ))}
        </>
      )}
    </div>
  );
}

// Vignette de la première page : une pastille par case (possédée, à trouver, vide).
function Couverture({ classeur }: { classeur: ResumeClasseur }) {
  const [colonnes, lignes] = DISPOSITION[classeur.slots_per_page];
  return (
    <span
      aria-hidden="true"
      className="grid h-20 w-16 shrink-0 gap-[3px] rounded-lg bg-accent-texte p-1.5"
      style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${lignes}, minmax(0, 1fr))` }}
    >
      {classeur.couverture.map((etat, i) => (
        <span
          key={i}
          className={`rounded-[2px] ${etat === "possedee" ? "bg-[#f6c99a]" : etat === "a-trouver" ? "bg-white/45" : "bg-white/15"}`}
        />
      ))}
    </span>
  );
}
