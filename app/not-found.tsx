import Link from "next/link";
import { EtatVide } from "@/components/EtatVide";

export default function PageIntrouvable() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <EtatVide titre="Page introuvable">
        Krikrou a cherché partout, sans succès.{" "}
        <Link href="/collection" className="font-semibold text-accent-texte underline">
          Retour à ma collection
        </Link>
      </EtatVide>
    </main>
  );
}
