import Link from "next/link";
import { EtatVide } from "@/components/EtatVide";

export const metadata = { title: "Hors ligne · Krikrou collection" };

// Servie par le service worker quand une page n'a jamais été ouverte et que le réseau manque.
export default function HorsLigne() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Hors ligne</h1>
      <EtatVide titre="Pas de réseau">
        Cette page n&apos;a pas encore été ouverte sur ce téléphone, elle n&apos;est donc pas disponible hors ligne. Les pages déjà vues
        restent consultables :{" "}
        <Link href="/collection" className="font-semibold underline">
          ma collection
        </Link>
        ,{" "}
        <Link href="/envies" className="font-semibold underline">
          les envies
        </Link>
        ,{" "}
        <Link href="/classeurs" className="font-semibold underline">
          les classeurs
        </Link>{" "}
        et{" "}
        <Link href="/binders" className="font-semibold underline">
          les binders
        </Link>
        .
      </EtatVide>
    </div>
  );
}
