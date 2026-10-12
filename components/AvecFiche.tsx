import { FicheCarte } from "@/components/FicheCarte";

// Mise en page avec la fiche d'une carte : plein écran sur téléphone,
// panneau à droite sur ordinateur (la grille reste visible).
export function AvecFiche({
  carte,
  fermer,
  lienCarte,
  children,
}: {
  carte: string | null;
  fermer: string;
  lienCarte: (id: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div className={carte ? "lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6" : ""}>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      {carte && (
        <aside
          aria-label="Fiche de la carte"
          className="fixed inset-0 z-30 overflow-y-auto bg-fond pt-[env(safe-area-inset-top)] pb-28 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:rounded-none lg:border-l lg:border-ligne lg:bg-surface lg:pb-6"
        >
          <FicheCarte key={carte} id={carte} fermer={fermer} lienCarte={lienCarte} />
        </aside>
      )}
    </div>
  );
}
