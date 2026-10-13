import Link from "next/link";
import { OublierPages } from "@/components/HorsLigne";
import { Mascotte } from "@/components/Mascotte";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata = { title: "Connexion · Krikrou collection" };

export default function Connexion() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Mascotte largeur={150} prioritaire />
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Krikrou collection</h1>
        <p className="text-sm text-encre-douce">Connecte-toi pour retrouver vos cartes.</p>
      </div>
      <FormulaireConnexion />
      <OublierPages />
      <p className="flex justify-center gap-4 text-xs text-encre-douce">
        <Link href="/confidentialite" className="underline">Confidentialité</Link>
        <Link href="/mentions-legales" className="underline">Mentions légales</Link>
      </p>
    </main>
  );
}
