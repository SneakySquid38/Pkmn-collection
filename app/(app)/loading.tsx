import { Mascotte } from "@/components/Mascotte";

export default function Chargement() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-encre-douce">
      <Mascotte expression="chargement" largeur={140} prioritaire />
      <span className="text-sm font-semibold">Chargement…</span>
    </div>
  );
}
