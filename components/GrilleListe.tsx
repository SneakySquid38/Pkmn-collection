import Link from "next/link";
import { CardImage } from "@/components/CardImage";
import { libelleLangue } from "@/lib/catalogue";
import { libellePriorite, type CarteListe } from "@/lib/collection";

const pastille = "rounded-md px-1.5 py-0.5 text-[10px] font-bold";

// Grille de la collection et des envies : quantité, priorité et « possédée » en pastilles.
export function GrilleListe({ cartes, lien, ouverte }: { cartes: CarteListe[]; lien: (id: string) => string; ouverte: string | null }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      {cartes.map((c, i) => (
        <li key={c.card_id}>
          <Link
            href={lien(c.card_id)}
            scroll={false}
            aria-current={c.card_id === ouverte ? "true" : undefined}
            className={`flex flex-col gap-1.5 rounded-xl p-1 ${c.card_id === ouverte ? "bg-accent-doux ring-2 ring-accent" : "hover:bg-puce"}`}
          >
            <div className="relative">
              <CardImage src={c.image_small} alt={c.nom} lang={libelleLangue(c.language)} prioritaire={i < 4} />
              {c.image_small && <span className={`absolute bottom-1.5 left-1.5 bg-[#1f1814] text-[#fbf6f0] ${pastille}`}>{libelleLangue(c.language)}</span>}
              <span className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                {c.quantite && c.quantite > 1 && <span className={`bg-accent text-[#1f1814] ${pastille} text-[11px]`}>×{c.quantite}</span>}
                {c.priorite && <span className={`bg-[#1f1814] text-[#fbf6f0] ${pastille}`}>♥ {libellePriorite(c.priorite)}</span>}
                {c.possedee && <span className={`bg-vert text-sur-vert ${pastille}`}>Possédée</span>}
              </span>
            </div>
            <div className="flex min-w-0 flex-col px-0.5">
              <span className="truncate text-sm font-semibold">{c.nom}</span>
              <span className="truncate text-xs text-encre-douce">
                {c.set_nom ?? ""}
                {c.number ? ` · ${c.number}` : ""}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
