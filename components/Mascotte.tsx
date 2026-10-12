/* eslint-disable @next/next/no-img-element */

// Krikrou, la mascotte. Chaque image existe en version claire et sombre ;
// le thème affiché choisit la bonne (classes .seul-clair / .seul-sombre).
export type Expression = "normale" | "petite" | "chargement" | "aucun-resultat" | "carte-ajoutee";

const FICHIERS: Record<Expression, { base: string; ratio: number }> = {
  normale: { base: "mascotte", ratio: 1200 / 1135 },
  petite: { base: "mascotte-petite", ratio: 1200 / 1135 },
  chargement: { base: "chargement", ratio: 1222 / 1156 },
  "aucun-resultat": { base: "aucun-resultat", ratio: 1222 / 1156 },
  "carte-ajoutee": { base: "carte-ajoutee", ratio: 1222 / 1156 },
};

type Props = {
  expression?: Expression;
  largeur: number;
  alt?: string; // vide quand l'image est décorative
  prioritaire?: boolean;
  className?: string;
};

export function Mascotte({ expression = "normale", largeur, alt = "", prioritaire = false, className = "" }: Props) {
  const { base, ratio } = FICHIERS[expression];
  const hauteur = Math.round(largeur * ratio);
  const commun = {
    width: largeur,
    height: hauteur,
    alt,
    loading: prioritaire ? ("eager" as const) : ("lazy" as const),
    decoding: "async" as const,
    draggable: false,
  };
  return (
    <span className={`inline-block shrink-0 ${className}`} style={{ width: largeur, height: hauteur }} aria-hidden={alt ? undefined : true}>
      <img {...commun} src={`/mascotte/${base}.webp`} className="seul-clair h-full w-full object-contain" />
      <img {...commun} src={`/mascotte/${base}-sombre.webp`} className="seul-sombre h-full w-full object-contain" />
    </span>
  );
}
