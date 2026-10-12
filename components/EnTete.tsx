import { EtatVide } from "@/components/EtatVide";
import { Mascotte } from "@/components/Mascotte";

export function EnTete({ titre, children }: { titre: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <Mascotte expression="petite" largeur={38} prioritaire className="lg:hidden" />
      <h1 className="flex-1 font-titre text-[26px] font-extrabold tracking-tight lg:text-3xl">{titre}</h1>
      {children}
    </header>
  );
}

export function BientotDisponible({ phase }: { phase: string }) {
  return (
    <EtatVide expression="chargement" titre="Krikrou y travaille">
      Cet écran arrive en {phase}.
    </EtatVide>
  );
}
