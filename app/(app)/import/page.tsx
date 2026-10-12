import { annulerImport } from "@/app/(app)/import/actions";
import { EnTete } from "@/components/EnTete";
import { ImportPokiframe } from "@/components/ImportPokiframe";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Import Pokiframe · Krikrou collection" };

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function Import() {
  const profil = await profilConnecte();
  const { data: lots } = profil
    ? await profil.supabase
        .from("import_lots")
        .select("id, file_name, created_at, undone_at, import_lines(status, quantity)")
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <EnTete titre="Import Pokiframe" />
      <ImportPokiframe />

      {lots && lots.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Historique des imports</h2>
          <ul className="flex flex-col gap-2">
            {lots.map((l) => {
              const lignes = (l.import_lines ?? []) as { status: string; quantity: number }[];
              const ajoutees = lignes.filter((x) => x.status === "importee").length;
              const introuvables = lignes.filter((x) => x.status === "introuvable").length;
              const retirees = lignes.filter((x) => x.status === "retiree").length;
              return (
                <li key={l.id} className="flex items-center gap-3 rounded-xl border border-ligne bg-surface p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.file_name ?? "Import"}</p>
                    <p className="text-xs text-encre-douce">
                      {date.format(new Date(l.created_at))} · {ajoutees} ajoutée{ajoutees > 1 ? "s" : ""}
                      {retirees ? ` · ${retirees} retirée${retirees > 1 ? "s" : ""}` : ""} · {introuvables} introuvable{introuvables > 1 ? "s" : ""}
                    </p>
                  </div>
                  {l.undone_at ? (
                    <span className="shrink-0 text-xs font-semibold text-encre-douce">Annulé</span>
                  ) : (
                    <form action={annulerImport.bind(null, l.id)}>
                      <button className="h-10 shrink-0 rounded-xl border border-ligne px-3 text-sm font-semibold">Annuler</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
