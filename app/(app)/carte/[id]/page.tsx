import { FicheCarte } from "@/components/FicheCarte";

export const metadata = { title: "Carte · Krikrou collection" };

// Fiche d'une carte en page seule (lien direct, et plus tard depuis la collection).
export default async function PageCarte({ params }: PageProps<"/carte/[id]">) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-xl">
      <FicheCarte id={id} fermer="/recherche" lienCarte={(autre) => `/carte/${autre}`} />
    </div>
  );
}
