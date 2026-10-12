import Link from "next/link";
import { AvecFiche } from "@/components/AvecFiche";
import { EnTete } from "@/components/EnTete";
import { EtatVide } from "@/components/EtatVide";
import { GrilleListe } from "@/components/GrilleListe";
import { OngletsMembres } from "@/components/OngletsMembres";
import { lireCollection, lireMembres, type CarteListe } from "@/lib/collection";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Ma collection · Krikrou collection" };

export default async function MaCollection({ searchParams }: PageProps<"/collection">) {
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
    cartes = await lireCollection(supabase, membre.id);
  } catch {
    erreur = true;
  }

  const base = chezMoi ? "/collection" : `/collection?membre=${membre.id}`;
  const lienCarte = (id: string) => `${base}${chezMoi ? "?" : "&"}carte=${id}`;
  const exemplaires = cartes.reduce((n, c) => n + (c.quantite ?? 1), 0);
  const sets = new Set(cartes.map((c) => c.set_nom)).size;

  return (
    <AvecFiche carte={carte} fermer={base} lienCarte={lienCarte}>
      <EnTete titre={chezMoi ? "Ma collection" : `Collection de ${membre.prenom}`} />
      <OngletsMembres membres={membres} actif={membre.id} moi={moi} chemin="/collection" />

      {erreur ? (
        <EtatVide titre="La collection n'a pas répondu">Réessaie dans un instant.</EtatVide>
      ) : cartes.length === 0 ? (
        <EtatVide titre={chezMoi ? "Ta collection est vide" : `${membre.prenom} n'a pas encore de cartes`}>
          {chezMoi ? (
            <>
              Cherche une carte dans{" "}
              <Link href="/recherche" className="font-semibold text-accent-texte underline">
                Recherche
              </Link>
              , ouvre sa fiche et touche « Ajouter à ma collection ».
            </>
          ) : null}
        </EtatVide>
      ) : (
        <>
          <p className="text-sm text-encre-douce">
            <strong className="text-encre">
              {exemplaires.toLocaleString("fr-FR")} carte{exemplaires > 1 ? "s" : ""}
            </strong>
            {` · ${cartes.length.toLocaleString("fr-FR")} différente${cartes.length > 1 ? "s" : ""} · ${sets} set${sets > 1 ? "s" : ""}`}
          </p>
          <GrilleListe cartes={cartes} lien={lienCarte} ouverte={carte} />
        </>
      )}
    </AvecFiche>
  );
}
