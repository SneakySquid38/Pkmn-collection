import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata = { title: "Connexion · Krikrou collection" };

export default function Connexion() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-3xl bg-accent font-titre text-4xl font-extrabold text-[#1f1814]"
        >
          K
        </div>
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Krikrou collection</h1>
        <p className="text-sm text-encre-douce">Connecte-toi pour retrouver vos cartes.</p>
      </div>
      <FormulaireConnexion />
    </main>
  );
}
