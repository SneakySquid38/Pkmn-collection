import Link from "next/link";
import { AvecFiche } from "@/components/AvecFiche";
import { EnTete } from "@/components/EnTete";
import { EtatVide } from "@/components/EtatVide";
import { GrilleListe } from "@/components/GrilleListe";
import { OngletsMembres } from "@/components/OngletsMembres";
import { lireEnvies, lireMembres, type CarteListe } from "@/lib/collection";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Envies · Krikrou collection" };

export default async function Envies({ searchParams }: PageProps<"/envies">) {
  const params = await searchParams;
  const profil = await profilConnecte();
  if (!profil) return null;
  const { supabase, id: moi } = profil;

  const membres = await lireMembres(supabase, moi);
  const demande = typeof params.membre === "string" ? params.membre : null;
  const membre = membres.find((m) => m.id === demande) ?? membres.find((m) => m.id === moi) ?? { id: moi, prenom: profil.prenom };
  const carte = typeof params.carte === "string" ? params.carte : null;
  const chezMoi = membre.id === moi;

  let cartes: CarteListe[] = [];
  let erreur = false;
  try {
    cartes = await lireEnvies(supabase, membre.id);
  } catch {
    erreur = true;
  }

  const base = chezMoi ? "/envies" : `/envies?membre=${membre.id}`;
  const lienCarte = (id: string) => `${base}${chezMoi ? "?" : "&"}carte=${id}`;

  return (
    <AvecFiche carte={carte} fermer={base} lienCarte={lienCarte}>
      <EnTete titre={chezMoi ? "Mes envies" : `Envies de ${membre.prenom}`} />
      <OngletsMembres membres={membres} actif={membre.id} moi={moi} chemin="/envies" />

      {erreur ? (
        <EtatVide titre="Les envies n'ont pas répondu">Réessaie dans un instant.</EtatVide>
      ) : cartes.length === 0 ? (
        <EtatVide titre={chezMoi ? "Aucune envie pour l'instant" : `${membre.prenom} n'a pas encore d'envies`}>
          {chezMoi ? (
            <>
              Dans{" "}
              <Link href="/recherche" className="font-semibold text-accent-texte underline">
                Recherche
              </Link>
              , ouvre la fiche d&apos;une carte et choisis « Très envie », « Envie » ou « Un jour ».
            </>
          ) : null}
        </EtatVide>
      ) : (
        <>
          <p className="text-sm text-encre-douce">
            <strong className="text-encre">
              {cartes.length.toLocaleString("fr-FR")} envie{cartes.length > 1 ? "s" : ""}
            </strong>
            {" · triées par priorité"}
          </p>
          <GrilleListe cartes={cartes} lien={lienCarte} ouverte={carte} />
        </>
      )}
    </AvecFiche>
  );
}
