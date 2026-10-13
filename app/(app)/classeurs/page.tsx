import Link from "next/link";
import { EnTete } from "@/components/EnTete";
import { EtatVide } from "@/components/EtatVide";
import { NouveauClasseur } from "@/components/NouveauClasseur";
import { OngletsMembres } from "@/components/OngletsMembres";
import { Progression } from "@/components/Progression";
import { DISPOSITION, lireClasseurs, type ResumeClasseur } from "@/lib/classeurs";
import { lireMembres } from "@/lib/collection";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Classeurs · Krikrou collection" };

export default async function Classeurs({ searchParams }: PageProps<"/classeurs">) {
  const params = await searchParams;
  const profil = await profilConnecte();
  if (!profil) return null;
  const { supabase, id: moi } = profil;

  const membres = await lireMembres(supabase, moi);
  const demande = typeof params.membre === "string" ? params.membre : null;
  const membre = membres.find((m) => m.id === demande) ?? membres.find((m) => m.id === moi) ?? { id: moi, prenom: profil.prenom };
  const chezMoi = membre.id === moi;

  let classeurs: ResumeClasseur[] = [];
  let erreur = false;
  try {
    classeurs = await lireClasseurs(supabase, membre.id);
  } catch {
    erreur = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <EnTete titre={chezMoi ? "Classeurs" : `Classeurs de ${membre.prenom}`} />
      <OngletsMembres membres={membres} actif={membre.id} moi={moi} chemin="/classeurs" />

      {erreur ? (
        <EtatVide titre="Les classeurs n'ont pas répondu">Réessaie dans un instant.</EtatVide>
      ) : (
        <>
          {classeurs.length === 0 && (
            <EtatVide titre={chezMoi ? "Pas encore de classeur" : `${membre.prenom} n'a pas encore de classeur`}>
              {chezMoi &&
                "Un classeur range des cartes page par page, comme un vrai. Les cartes que tu n'as pas encore restent en grisé : elles sont à trouver."}
            </EtatVide>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classeurs.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/classeurs/${c.id}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-ligne bg-surface p-3 hover:bg-puce"
                >
                  <Couverture classeur={c} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-bold">{c.name}</span>
                    <span className="text-[13px] text-encre-douce">
                      {c.possedees} / {c.total} possédée{c.possedees > 1 ? "s" : ""} · {c.pages} page{c.pages > 1 ? "s" : ""} de {c.slots_per_page}
                    </span>
                    <Progression possedees={c.possedees} total={c.total} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {chezMoi && <NouveauClasseur />}
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
