import Link from "next/link";
import { AvecFiche } from "@/components/AvecFiche";
import { ClasseurPages } from "@/components/ClasseurPages";
import { EtatVide } from "@/components/EtatVide";
import { Progression } from "@/components/Progression";
import { ReglagesClasseur } from "@/components/ReglagesClasseur";
import { lireClasseur } from "@/lib/classeurs";
import { profilConnecte } from "@/lib/profil";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Classeur · Krikrou collection" };

export default async function Classeur({ params, searchParams }: PageProps<"/classeurs/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profil = await profilConnecte();
  if (!profil) return null;
  const { supabase, id: moi } = profil;

  let lu: Awaited<ReturnType<typeof lireClasseur>> = null;
  let erreur = false;
  if (UUID.test(id)) {
    try {
      lu = await lireClasseur(supabase, id);
    } catch {
      erreur = true;
    }
  }

  if (!lu) {
    return (
      <div className="flex flex-col gap-4">
        <Retour href="/classeurs" />
        {erreur ? (
          <EtatVide titre="Le classeur n'a pas répondu">Réessaie dans un instant.</EtatVide>
        ) : (
          <EtatVide titre="Classeur introuvable">Il a peut-être été supprimé.</EtatVide>
        )}
      </div>
    );
  }

  const { classeur, cases } = lu;
  const proprietaire = classeur.user_id === moi;
  const { data: auteur } = proprietaire
    ? { data: null }
    : await supabase.from("profiles").select("display_name").eq("id", classeur.user_id).maybeSingle();

  const pageDemandee = Number(typeof sp.page === "string" ? sp.page : 1);
  const page = Number.isInteger(pageDemandee) ? Math.min(Math.max(pageDemandee, 1), classeur.pages) : 1;
  const carte = typeof sp.carte === "string" ? sp.carte : null;
  const base = `/classeurs/${classeur.id}`;
  const possedees = cases.filter((c) => c.possedee).length;
  const retour = proprietaire ? "/classeurs" : `/classeurs?membre=${classeur.user_id}`;

  return (
    <AvecFiche carte={carte} fermer={`${base}?page=${page}`} lienCarte={(c) => `${base}?page=${page}&carte=${c}`}>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Retour href={retour} libelle={proprietaire ? "Classeurs" : `Classeurs de ${auteur?.display_name ?? "ce membre"}`} />
          {proprietaire && <ReglagesClasseur classeur={classeur} />}
        </div>
        <h1 className="font-titre text-[26px] leading-tight font-extrabold tracking-tight lg:text-3xl">{classeur.name}</h1>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span>
              <strong>
                {possedees} / {cases.length}
              </strong>{" "}
              possédée{possedees > 1 ? "s" : ""}
              {!proprietaire && auteur?.display_name ? ` par ${auteur.display_name}` : ""}
            </span>
            <span className="text-encre-douce">{cases.length ? Math.round((possedees / cases.length) * 100) : 0} %</span>
          </div>
          <Progression possedees={possedees} total={cases.length} grande />
        </div>
      </header>

      <ClasseurPages key={classeur.slots_per_page} classeur={classeur} cases={cases} pageInitiale={page} proprietaire={proprietaire} ouverte={carte} />
    </AvecFiche>
  );
}

function Retour({ href, libelle = "Classeurs" }: { href: string; libelle?: string }) {
  return (
    <Link href={href} className="flex h-11 min-w-0 items-center gap-1 rounded-xl pr-3 text-sm font-semibold text-encre-douce">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="truncate">{libelle}</span>
    </Link>
  );
}
