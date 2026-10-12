import { Mascotte, type Expression } from "@/components/Mascotte";

// Écran vide, chargement ou erreur, toujours avec Krikrou.
export function EtatVide({
  expression = "aucun-resultat",
  titre,
  children,
}: {
  expression?: Expression;
  titre: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ligne bg-surface px-6 py-8 text-center">
      <Mascotte expression={expression} largeur={140} />
      <p className="font-titre text-lg font-extrabold">{titre}</p>
      {children && <div className="max-w-sm text-sm text-encre-douce">{children}</div>}
    </div>
  );
}
