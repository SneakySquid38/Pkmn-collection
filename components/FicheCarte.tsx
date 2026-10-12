import Link from "next/link";
import { ActionsCarte } from "@/components/ActionsCarte";
import { CardImage } from "@/components/CardImage";
import { EtatVide } from "@/components/EtatVide";
import { LANGUES, libelleLangue } from "@/lib/catalogue";
import { libellePriorite } from "@/lib/collection";
import { createSupabaseServer } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fiche d'une carte : grande image, informations, et la même carte dans les autres langues.
// Utilisée en panneau (recherche) et en page seule (/carte/[id]).
export async function FicheCarte({
  id,
  fermer,
  lienCarte,
}: {
  id: string;
  fermer: string;
  lienCarte: (id: string) => string;
}) {
  const supabase = await createSupabaseServer();
  const { data: carte } = UUID.test(id)
    ? await supabase
        .from("cards")
        .select("id, name, search_name_fr, search_name_official, language, number, image_small, image_large, category, hp, rarity_code, rarity_inferred, illustrator_id, artist, card_entity_id, set_id")
        .eq("id", id)
        .maybeSingle()
    : { data: null };

  if (!carte) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Fermer href={fermer} />
        <EtatVide titre="Carte introuvable">Elle n&apos;existe pas ou n&apos;est pas encore publiée.</EtatVide>
      </div>
    );
  }

  const [set, rarete, illustrateur, autres, claims, possedes, envies, membres] = await Promise.all([
    supabase.from("sets_display").select("display_name, code").eq("set_id", carte.set_id).maybeSingle(),
    carte.rarity_code
      ? supabase.from("rarities").select("label_fr").eq("code", carte.rarity_code).maybeSingle()
      : Promise.resolve({ data: null }),
    carte.illustrator_id
      ? supabase.from("illustrators").select("name").eq("id", carte.illustrator_id).maybeSingle()
      : Promise.resolve({ data: null }),
    carte.card_entity_id
      ? supabase.from("cards").select("id, language, number, set_id, image_small").eq("card_entity_id", carte.card_entity_id).neq("id", carte.id).limit(24)
      : Promise.resolve({ data: [] as { id: string; language: string; number: string | null; set_id: string; image_small: string | null }[] }),
    supabase.auth.getClaims(),
    // Lecture croisée : qui a cette carte, et qui la veut.
    supabase.from("collection_items").select("user_id, quantity").eq("card_id", carte.id),
    supabase.from("wishlist_items").select("user_id, priority").eq("card_id", carte.id),
    supabase.from("profiles").select("id, display_name"),
  ]);
  const moi = claims.data?.claims?.sub ?? null;
  const prenom = (id: string) => membres.data?.find((m) => m.id === id)?.display_name ?? "Un membre";
  const maQuantite = possedes.data?.find((p) => p.user_id === moi)?.quantity ?? 0;
  const monEnvie = envies.data?.find((e) => e.user_id === moi)?.priority ?? null;
  const chezLesAutres = [
    ...(possedes.data ?? []).filter((p) => p.user_id !== moi).map((p) => `${prenom(p.user_id)} l'a (${p.quantity} ex.)`),
    ...(envies.data ?? []).filter((e) => e.user_id !== moi).map((e) => `${prenom(e.user_id)} la veut · ${libellePriorite(e.priority)}`),
  ];

  const setsAutres = autres.data?.length
    ? (await supabase.from("sets_display").select("set_id, display_name").in("set_id", [...new Set(autres.data.map((a) => a.set_id))])).data ?? []
    : [];
  const ordre = (l: string) => LANGUES.findIndex((x) => x.code === l);
  const autresTries = [...(autres.data ?? [])].sort((a, b) => ordre(a.language) - ordre(b.language));

  const nom = carte.search_name_fr ?? carte.name;
  const nomLangue = LANGUES.find((l) => l.code === carte.language)?.nom.toLowerCase();
  const nomIllustrateur = illustrateur.data?.name ?? carte.artist;

  return (
    <article className="flex flex-col gap-5 p-4 lg:p-5">
      <Fermer href={fermer} />

      <div className="relative mx-auto w-full max-w-[300px]">
        <CardImage src={carte.image_large ?? carte.image_small} alt={nom} lang={libelleLangue(carte.language)} prioritaire />
        {(carte.image_large ?? carte.image_small) && (
          <span className="absolute bottom-2 left-2 rounded-md bg-[#1f1814] px-2 py-0.5 text-xs font-bold text-[#fbf6f0]">
            {libelleLangue(carte.language)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="font-titre text-2xl font-extrabold tracking-tight">{nom}</h2>
        {carte.language !== "FR" && carte.name !== nom && (
          <p className="text-sm text-encre-douce">
            {carte.name} · nom {nomLangue} d&apos;origine
          </p>
        )}
        {carte.search_name_official === false && (
          <p className="text-xs text-encre-douce">Nom français déduit, pas encore officiel</p>
        )}
      </div>

      {moi && <ActionsCarte carte={carte.id} quantite={maQuantite} priorite={monEnvie} />}
      {chezLesAutres.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-encre-douce">
          {chezLesAutres.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-ligne bg-surface p-4 text-sm">
        <Info titre="Set">
          <Link href={`/recherche?set=${carte.set_id}`} className="font-semibold text-accent-texte underline">
            {set.data?.display_name ?? set.data?.code ?? "?"}
          </Link>
        </Info>
        <Info titre="Numéro">{carte.number ?? "–"}</Info>
        <Info titre="Rareté">
          {rarete.data?.label_fr ?? "–"}
          {carte.rarity_inferred && rarete.data && <span className="text-encre-douce"> (déduite)</span>}
        </Info>
        <Info titre="Illustrateur">
          {carte.illustrator_id && nomIllustrateur ? (
            <Link href={`/recherche?illustrateur=${carte.illustrator_id}`} className="font-semibold text-accent-texte underline">
              {nomIllustrateur}
            </Link>
          ) : (
            nomIllustrateur ?? "–"
          )}
        </Info>
        <Info titre="Catégorie">
          {carte.category ?? "–"}
          {carte.hp ? ` · ${carte.hp} PV` : ""}
        </Info>
      </dl>

      {autresTries.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Autres langues</h3>
          <ul className="flex flex-col gap-2">
            {autresTries.map((a) => (
              <li key={a.id}>
                <Link
                  href={lienCarte(a.id)}
                  scroll={false}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-ligne bg-surface p-2 hover:bg-puce"
                >
                  <span className="w-10 shrink-0">
                    <CardImage src={a.image_small} alt={`${nom} ${libelleLangue(a.language)}`} lang={libelleLangue(a.language)} />
                  </span>
                  <span className="rounded-md bg-[#1f1814] px-1.5 py-0.5 text-[11px] font-bold text-[#fbf6f0]">{libelleLangue(a.language)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {setsAutres.find((s) => s.set_id === a.set_id)?.display_name ?? ""}
                    {a.number ? ` · ${a.number}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </article>
  );
}

function Info({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-encre-douce">{titre}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function Fermer({ href }: { href: string }) {
  return (
    <Link href={href} scroll={false} className="flex h-11 w-fit items-center gap-1 rounded-xl pr-3 text-sm font-semibold text-encre-douce">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      Retour
    </Link>
  );
}
