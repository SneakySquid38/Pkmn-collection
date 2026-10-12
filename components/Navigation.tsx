"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mascotte } from "@/components/Mascotte";

const ONGLETS = [
  { href: "/collection", label: "Collection", icone: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 6v13M21 6v13" },
  { href: "/recherche", label: "Recherche", icone: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" },
  { href: "/classeurs", label: "Classeurs", icone: "M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5zM9 3v18M5 8h2M5 16h2" },
  { href: "/envies", label: "Envies", icone: "M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z" },
  { href: "/plus", label: "Plus", icone: "M5 12h.01M12 12h.01M19 12h.01" },
];

function Icone({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// Barre d'onglets en bas sur téléphone, barre latérale sur ordinateur (à partir de 1024 px).
export function Navigation() {
  const chemin = usePathname();
  const actif = (href: string) =>
    chemin === href || chemin.startsWith(href + "/") || (href === "/plus" && chemin.startsWith("/import"));

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-ligne bg-surface px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden"
      >
        {ONGLETS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            aria-current={actif(o.href) ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center gap-0.5 py-1 text-[11px] ${actif(o.href) ? "font-bold text-accent-texte" : "font-medium text-encre-douce"}`}
          >
            <span className={`flex h-7 w-13 items-center justify-center rounded-full ${actif(o.href) ? "bg-accent-doux" : ""}`}>
              <Icone d={o.icone} />
            </span>
            {o.label}
          </Link>
        ))}
      </nav>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-ligne bg-surface px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <Mascotte expression="petite" largeur={44} prioritaire />
          <span className="font-titre text-lg leading-tight font-extrabold">Krikrou<br />collection</span>
        </div>
        <nav aria-label="Navigation principale" className="flex flex-col gap-1">
          {ONGLETS.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              aria-current={actif(o.href) ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${actif(o.href) ? "bg-accent-doux font-bold text-accent-texte" : "font-medium text-encre hover:bg-puce"}`}
            >
              <Icone d={o.icone} />
              {o.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
