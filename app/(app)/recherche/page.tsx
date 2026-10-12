import { BarreRecherche } from "@/components/BarreRecherche";
import { EnTete } from "@/components/EnTete";
import { EtatVide } from "@/components/EtatVide";
import { FicheCarte } from "@/components/FicheCarte";
import { GrilleCartes } from "@/components/GrilleCartes";
import { lirePossessions } from "@/lib/collection";
import { chercherCartes, libelleLangue, lireFiltres, versParams, type CarteResultat } from "@/lib/catalogue";
import { createSupabaseServer } from "@/lib/supabase-server";

export const metadata = { title: "Recherche · Krikrou collection" };

const ANNEES = Array.from({ length: new Date().getFullYear() - 1995 }, (_, i) => new Date().getFullYear() - i);

export default async function Recherche({ searchParams }: PageProps<"/recherche">) {
  const params = await searchParams;
  const filtres = lireFiltres(params);
  const carte = typeof params.carte === "string" ? params.carte : null;
  const supabase = await createSupabaseServer();

  let premiers: CarteResultat[] = [];
  let erreur = false;
  const { data: claims } = await supabase.auth.getClaims();
  const moi = claims?.claims?.sub;
  const [resultats, raretes, series, set, illustrateur, possessions] = await Promise.all([
    chercherCartes(supabase, filtres, 0).catch(() => null),
    supabase.from("rarities").select("code, label_fr").neq("code", "none").order("sort_order"),
    supabase.from("series").select("code, name_fr").order("sort_order"),
    filtres.set ? supabase.from("sets_display").select("display_name").eq("set_id", filtres.set).maybeSingle() : null,
    filtres.illustrateur ? supabase.from("illustrators").select("name").eq("id", filtres.illustrateur).maybeSingle() : null,
    moi ? lirePossessions(supabase, moi).catch(() => null) : null,
  ]);
  if (resultats) premiers = resultats;
  else erreur = true;

  const total = premiers[0]?.total_count ?? 0;
  const cle = versParams(filtres).toString();
  const lienCarte = (id: string) => {
    const p = versParams(filtres);
    p.set("carte", id);
    return `/recherche?${p}`;
  };
  const sansCarte = cle ? `/recherche?${cle}` : "/recherche";

  return (
    <div className={carte ? "lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6" : ""}>
      <div className="flex min-w-0 flex-col gap-4">
        <EnTete titre="Recherche" />
        <BarreRecherche
          filtres={filtres}
          raretes={(raretes.data ?? []).map((r) => ({ valeur: r.code, label: r.label_fr }))}
          series={(series.data ?? []).map((s) => ({ valeur: s.code, label: s.name_fr }))}
          annees={ANNEES}
          nomSet={set?.data?.display_name ?? null}
          nomIllustrateur={illustrateur?.data?.name ?? null}
        />

        {erreur ? (
          <EtatVide titre="La recherche n'a pas répondu">Réessaie dans un instant. Si la base était en pause, elle redémarre.</EtatVide>
        ) : premiers.length === 0 ? (
          <EtatVide titre="Aucune carte trouvée">Essaie un autre nom, ou retire un filtre.</EtatVide>
        ) : (
          <>
            <p className="text-sm text-encre-douce">
              <strong className="text-encre">{total.toLocaleString("fr-FR")} carte{total > 1 ? "s" : ""}</strong>
              {filtres.langues.length ? ` · ${filtres.langues.map(libelleLangue).join(", ")}` : ""}
            </p>
            <GrilleCartes
              key={cle}
              filtres={filtres}
              premiers={premiers}
              total={total}
              carteOuverte={carte}
              possedees={Object.fromEntries(possessions?.parCarte ?? [])}
              familles={Object.fromEntries(possessions?.parFamille ?? [])}
            />
          </>
        )}
      </div>

      {carte && (
        <aside
          aria-label="Fiche de la carte"
          className="fixed inset-0 z-30 overflow-y-auto bg-fond pt-[env(safe-area-inset-top)] pb-28 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:rounded-none lg:border-l lg:border-ligne lg:bg-surface lg:pb-6"
        >
          <FicheCarte key={carte} id={carte} fermer={sansCarte} lienCarte={lienCarte} />
        </aside>
      )}
    </div>
  );
}
