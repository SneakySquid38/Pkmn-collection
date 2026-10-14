import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, codeFiltre, LANGUES, libelleLangue } from "@/lib/catalogue";
import { completerImages } from "@/lib/images";
import { CHAMPS_CARTE, lirePossessions, nomsSets, versListe, type CarteListe, type LigneCarte } from "@/lib/collection";

// Formats de page proposés, avec leur disposition [colonnes, lignes] (pages de classeur du commerce).
export const FORMATS = [2, 3, 4, 6, 9, 12] as const;
export type Format = (typeof FORMATS)[number];
export const DISPOSITION: Record<Format, [number, number]> = {
  2: [2, 1],
  3: [3, 1],
  4: [2, 2],
  6: [2, 3],
  9: [3, 3],
  12: [3, 4],
};
export const PAGES_MAX = 200;
export const NOM_MAX = 80;
export const CARTES_MAX = 2400; // un classeur automatique s'arrête là (même limite que la fonction SQL)

export function estFormat(n: unknown): n is Format {
  return FORMATS.includes(n as Format);
}

// « classeur » : rempli tout seul à partir de filtres ; « binder » : rangé à la main, case par case.
export type Sorte = "classeur" | "binder";

// Chaque sorte a son menu : /classeurs et /binders.
export const RACINE: Record<Sorte, string> = { classeur: "/classeurs", binder: "/binders" };
export const cheminClasseur = (c: { id: string; kind: Sorte }) => `${RACINE[c.kind]}/${c.id}`;

// Filtres d'un classeur automatique (colonne binders.rule, lue par la fonction SQL classeur_cards).
export type Regle = {
  langues: string[];
  pokemon?: string;
  illustrateur?: string;
  serie?: string;
  set?: string;
  rarete?: string;
  categorie?: string;
  annee?: number;
  nom?: string;
};

export type Classeur = {
  id: string;
  user_id: string;
  name: string;
  slots_per_page: Format;
  pages: number;
  kind: Sorte;
  rule: Regle | null;
};

// Une case remplie : la carte, et si le propriétaire du classeur la possède.
export type Case = CarteListe & { position: number; possedee: boolean };

// État des cases de la première page, pour la vignette de couverture.
export type EtatCase = "possedee" | "a-trouver" | "vide";

export type ResumeClasseur = Classeur & {
  total: number; // cases remplies
  possedees: number; // cases dont la carte est dans la collection du propriétaire
  couverture: EtatCase[];
};

export const CHAMPS_CLASSEUR = "id, user_id, name, slots_per_page, pages, kind, rule";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9_.-]{1,40}$/;

// Garde seulement des filtres valides (ils viennent du navigateur). Au moins une langue.
export function nettoyerRegle(x: unknown): Regle {
  const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const demandees = Array.isArray(r.langues) ? r.langues.map((c) => codeFiltre(String(c))) : [];
  const langues = LANGUES.map((l) => l.code as string).filter((c) => demandees.includes(c));
  const regle: Regle = { langues: langues.length ? langues : ["FR"] };
  for (const cle of ["pokemon", "illustrateur", "set"] as const) if (typeof r[cle] === "string" && UUID.test(r[cle] as string)) regle[cle] = r[cle] as string;
  for (const cle of ["serie", "rarete"] as const) if (typeof r[cle] === "string" && CODE.test(r[cle] as string)) regle[cle] = r[cle] as string;
  if (CATEGORIES.includes(r.categorie as (typeof CATEGORIES)[number])) regle.categorie = r.categorie as string;
  const annee = Number(r.annee);
  if (r.annee && Number.isInteger(annee) && annee > 1990 && annee < 2100) regle.annee = annee;
  const nom = typeof r.nom === "string" ? r.nom.trim().slice(0, 40) : "";
  if (nom.length >= 2) regle.nom = nom;
  return regle;
}

// Un filtre au moins en plus de la langue, sinon le classeur contiendrait tout le catalogue.
export function regleAssezPrecise(r: Regle) {
  return Boolean(r.pokemon || r.illustrateur || r.serie || r.set || r.rarete || r.categorie || r.annee || r.nom);
}

type LigneAuto = {
  card_id: string;
  name: string;
  search_name_fr: string | null;
  language: string;
  number: string | null;
  image_small: string | null;
  set_display_name: string | null;
};

// Cartes d'un classeur automatique, dans l'ordre des sorties (set puis numéro).
export async function cartesDuClasseur(supabase: SupabaseClient, regle: Regle, limite = CARTES_MAX): Promise<CarteListe[]> {
  const { data, error } = await supabase.rpc("classeur_cards", { p_rule: regle, p_limit: limite });
  if (error) throw new Error(error.message);
  const cartes: CarteListe[] = ((data ?? []) as LigneAuto[]).map((c) => ({
    card_id: c.card_id,
    nom: c.search_name_fr ?? c.name,
    language: c.language,
    number: c.number,
    image_small: c.image_small,
    set_nom: c.set_display_name,
  }));
  return completerImages(supabase, cartes);
}

// Les filtres en clair, pour l'en-tête d'un classeur : « sowsow », « Écarlate et Violet », « JP »…
export async function libellesRegle(supabase: SupabaseClient, r: Regle): Promise<string[]> {
  const [pokemon, illustrateur, set, serie, rarete] = await Promise.all([
    r.pokemon ? supabase.from("pokemon_entities").select("name_fr").eq("id", r.pokemon).maybeSingle() : null,
    r.illustrateur ? supabase.from("illustrators").select("name").eq("id", r.illustrateur).maybeSingle() : null,
    r.set ? supabase.from("sets_display").select("display_name").eq("set_id", r.set).maybeSingle() : null,
    r.serie ? supabase.from("series").select("name_fr").eq("code", r.serie).maybeSingle() : null,
    r.rarete ? supabase.from("rarities").select("label_fr").eq("code", r.rarete).maybeSingle() : null,
  ]);
  return [
    pokemon?.data?.name_fr,
    illustrateur?.data?.name,
    set?.data?.display_name,
    serie?.data?.name_fr,
    rarete?.data?.label_fr,
    r.categorie,
    r.annee ? String(r.annee) : null,
    r.nom ? `« ${r.nom} »` : null,
    r.langues.map(libelleLangue).join(" + "),
  ].filter((x): x is string => Boolean(x));
}

function couvertureDe(etats: EtatCase[], n: number): EtatCase[] {
  return Array.from({ length: n }, (_, i) => etats[i] ?? "vide");
}

// Classeurs d'un membre d'une sorte, avec leur compteur « possédées / total », et le nombre de chaque sorte.
export async function lireClasseurs(
  supabase: SupabaseClient,
  membre: string,
  sorte: Sorte,
): Promise<{ liste: ResumeClasseur[]; nombres: Record<Sorte, number> }> {
  const { data, error } = await supabase
    .from("binders")
    .select(CHAMPS_CLASSEUR)
    .eq("user_id", membre)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const tous = (data ?? []) as Classeur[];
  const nombres = { classeur: tous.filter((c) => c.kind === "classeur").length, binder: tous.filter((c) => c.kind === "binder").length };
  const classeurs = tous.filter((c) => c.kind === sorte);
  if (!classeurs.length) return { liste: [], nombres };

  if (sorte === "classeur") {
    const [{ parCarte }, listes] = await Promise.all([
      lirePossessions(supabase, membre),
      Promise.all(classeurs.map((c) => cartesDuClasseur(supabase, nettoyerRegle(c.rule)).catch(() => [] as CarteListe[]))),
    ]);
    const liste = classeurs.map((c, i) => {
      const etats = listes[i].map((x): EtatCase => (parCarte.has(x.card_id) ? "possedee" : "a-trouver"));
      return {
        ...c,
        total: listes[i].length,
        possedees: etats.filter((e) => e === "possedee").length,
        couverture: couvertureDe(etats, c.slots_per_page),
      };
    });
    return { liste, nombres };
  }

  const [{ data: cases, error: e2 }, { parCarte }] = await Promise.all([
    supabase
      .from("binder_slots")
      .select("binder_id, position, card_id")
      .in("binder_id", classeurs.map((c) => c.id))
      .limit(20000),
    lirePossessions(supabase, membre),
  ]);
  if (e2) throw new Error(e2.message);

  const liste = classeurs.map((c) => {
    const miennes = (cases ?? []).filter((s) => s.binder_id === c.id);
    const parPosition = new Map(miennes.map((s) => [s.position as number, s.card_id as string]));
    const couverture = Array.from({ length: c.slots_per_page }, (_, i): EtatCase => {
      const carte = parPosition.get(i);
      return !carte ? "vide" : parCarte.has(carte) ? "possedee" : "a-trouver";
    });
    return {
      ...c,
      total: miennes.length,
      possedees: miennes.filter((s) => parCarte.has(s.card_id)).length,
      couverture,
    };
  });
  return { liste, nombres };
}

// Un classeur et toutes ses cases remplies (la page affichée est choisie à l'écran).
// Classeur automatique : ses cartes à la suite, recalculées à partir des filtres.
export async function lireClasseur(supabase: SupabaseClient, id: string): Promise<{ classeur: Classeur; cases: Case[] } | null> {
  const { data: classeur } = await supabase.from("binders").select(CHAMPS_CLASSEUR).eq("id", id).maybeSingle();
  if (!classeur) return null;
  const c = classeur as Classeur;

  if (c.kind === "classeur") {
    const [cartes, { parCarte }] = await Promise.all([cartesDuClasseur(supabase, nettoyerRegle(c.rule)), lirePossessions(supabase, c.user_id)]);
    const cases = cartes.map((x, i) => ({ ...x, position: i, possedee: parCarte.has(x.card_id), quantite: parCarte.get(x.card_id) }));
    return { classeur: { ...c, pages: Math.max(1, Math.ceil(cases.length / c.slots_per_page)) }, cases };
  }

  const [{ data, error }, { parCarte }] = await Promise.all([
    supabase
      .from("binder_slots")
      .select(`position, cards(${CHAMPS_CARTE})`)
      .eq("binder_id", id)
      .order("position")
      .limit(PAGES_MAX * 12),
    lirePossessions(supabase, c.user_id),
  ]);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []).filter((l) => l.cards) as unknown as { position: number; cards: LigneCarte }[];
  const sets = await nomsSets(supabase, lignes.map((l) => l.cards));
  const cases: Case[] = await completerImages(
    supabase,
    lignes.map((l) => ({
      ...versListe(l.cards, sets),
      position: l.position,
      possedee: parCarte.has(l.cards.id),
      quantite: parCarte.get(l.cards.id),
    })),
  );
  return { classeur: c, cases };
}

// Nombre de pages nécessaire pour garder toutes les cartes quand on change de format.
export function pagesApresFormat(pages: number, ancien: Format, nouveau: Format, dernierePosition: number | null) {
  const pourLesCartes = dernierePosition === null ? 1 : Math.floor(dernierePosition / nouveau) + 1;
  const pourLesCases = Math.ceil((pages * ancien) / nouveau);
  return Math.min(PAGES_MAX, Math.max(1, pourLesCartes, pourLesCases));
}
