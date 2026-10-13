"use client";

import { FORMATS, type Format } from "@/lib/classeurs";

// Nombre de cases par page : 2, 3, 4, 6, 9 ou 12.
export function ChoixFormat({ valeur, changer }: { valeur: Format; changer: (f: Format) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold">Cases par page</legend>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={valeur === f}
            onClick={() => changer(f)}
            className={`h-11 w-12 rounded-xl border text-[15px] font-bold ${valeur === f ? "border-accent bg-accent text-[#1f1814]" : "border-ligne bg-fond"}`}
          >
            {f}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
