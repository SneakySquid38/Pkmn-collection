import Link from "next/link";
import { CreationClasseur } from "@/components/CreationClasseur";
import { EtatVide } from "@/components/EtatVide";
import { ANNEES, listesCourtes } from "@/lib/catalogue";
import { CHAMPS_CLASSEUR, nettoyerRegle, type Classeur } from "@/lib/classeurs";
import { profilConnecte } from "@/lib/profil";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Modifier le classeur · Krikrou collection" };

export default async function FiltresClasseur({ params }: PageProps<"/classeurs/[id]/filtres">) {
  const { id } = await params;
  const profil = await profilConnecte();
  if (!profil) return null;
  const { supabase, id: moi } = profil;

  const { data } = UUID.test(id)
    ? await supabase.from("binders").select(CHAMPS_CLASSEUR).eq("id", id).eq("user_id", moi).eq("kind", "classeur").maybeSingle()
    : { data: null };
  const classeur = data as Classeur | null;

  if (!classeur) {
    return (
      <div className="flex flex-col gap-4">
        <Retour href="/classeurs" />
        <EtatVide titre="Classeur introuvable">Il a peut-être été supprimé.</EtatVide>
      </div>
    );
  }

  const regle = nettoyerRegle(classeur.rule);
  const [{ raretes, series }, pokemon, illustrateur, set] = await Promise.all([
    listesCourtes(supabase),
    regle.pokemon ? supabase.from("pokemon_entities").select("name_fr").eq("id", regle.pokemon).maybeSingle() : null,
    regle.illustrateur ? supabase.from("illustrators").select("name").eq("id", regle.illustrateur).maybeSingle() : null,
    regle.set ? supabase.from("sets_display").select("display_name").eq("set_id", regle.set).maybeSingle() : null,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Retour href={`/classeurs/${classeur.id}`} libelle={classeur.name} />
      <h1 className="font-titre text-[26px] leading-tight font-extrabold tracking-tight lg:text-3xl">Modifier le classeur</h1>
      <CreationClasseur
        raretes={raretes}
        series={series}
        annees={ANNEES}
        existant={{
          id: classeur.id,
          nom: classeur.name,
          format: classeur.slots_per_page,
          regle,
          libelles: { pokemon: pokemon?.data?.name_fr, illustrateur: illustrateur?.data?.name, set: set?.data?.display_name ?? undefined },
        }}
      />
    </div>
  );
}

function Retour({ href, libelle = "Classeurs" }: { href: string; libelle?: string }) {
  return (
    <Link href={href} className="flex h-11 w-fit min-w-0 items-center gap-1 rounded-xl pr-3 text-sm font-semibold text-encre-douce">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="truncate">{libelle}</span>
    </Link>
  );
}
