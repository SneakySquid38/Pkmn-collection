import type { SupabaseClient } from "@supabase/supabase-js";

// Langues affichées. Le chinois simplifié (SC) n'est pas publié : la RLS le masque déjà.
export const LANGUES = [
  { code: "FR", label: "FR", nom: "Français" },
  { code: "JP", label: "JP", nom: "Japonais" },
  { code: "KR", label: "KR", nom: "Coréen" },
  { code: "TC", label: "CN", nom: "Chinois traditionnel" },
] as const;

export const CATEGORIES = ["Pokémon", "Dresseur", "Énergie"] as const;

export const TAILLE_PAGE = 30;

export function libelleLangue(code: string) {
  return LANGUES.find((l) => l.code === code)?.label ?? code;
}

export type Filtres = {
  q: string;
  langues: string[];
  rarete: string | null;
  serie: string | null;
  annee: number | null;
  categorie: string | null;
  set: string | null;
  illustrateur: string | null;
};

export type CarteResultat = {
  card_id: string;
  name: string;
  search_name_fr: string | null;
  language: string;
  number: string | null;
  set_id: string;
  set_display_name: string | null;
  set_code: string | null;
  release_date: string | null;
  rarity_code: string | null;
  rarity_label: string | null;
  image_small: string | null;
  card_entity_id: string | null;
  languages: string[]; // langues disponibles pour cette carte (une tuile par famille JP/KR/CN)
  total_count: number;
};

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function un(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || null;
}

// Lit les filtres dans l'adresse (?q=…&langue=FR,JP&rarete=…), en ignorant les valeurs invalides.
export function lireFiltres(p: Params): Filtres {
  const langues = (un(p.langue) ?? "")
    .split(",")
    .filter((c) => LANGUES.some((l) => l.code === c));
  const annee = Number(un(p.annee));
  const categorie = un(p.categorie);
  const set = un(p.set);
  const illustrateur = un(p.illustrateur);
  return {
    q: (un(p.q) ?? "").slice(0, 80),
    langues,
    rarete: un(p.rarete),
    serie: un(p.serie),
    annee: Number.isInteger(annee) && annee > 1990 && annee < 2100 ? annee : null,
    categorie: CATEGORIES.includes(categorie as (typeof CATEGORIES)[number]) ? categorie : null,
    set: set && UUID.test(set) ? set : null,
    illustrateur: illustrateur && UUID.test(illustrateur) ? illustrateur : null,
  };
}

// Inverse de lireFiltres : les filtres actifs sous forme de paramètres d'adresse.
export function versParams(f: Filtres) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.langues.length) p.set("langue", f.langues.join(","));
  if (f.rarete) p.set("rarete", f.rarete);
  if (f.serie) p.set("serie", f.serie);
  if (f.annee) p.set("annee", String(f.annee));
  if (f.categorie) p.set("categorie", f.categorie);
  if (f.set) p.set("set", f.set);
  if (f.illustrateur) p.set("illustrateur", f.illustrateur);
  return p;
}

export async function chercherCartes(supabase: SupabaseClient, f: Filtres, offset: number) {
  const { data, error } = await supabase.rpc("search_cards_grouped", {
    q: f.q,
    p_languages: f.langues.length ? f.langues : null,
    p_rarities: f.rarete ? [f.rarete] : null,
    p_set_id: f.set,
    p_series_id: f.serie,
    p_illustrator: f.illustrateur,
    p_category: f.categorie,
    p_year: f.annee,
    p_limit: TAILLE_PAGE,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CarteResultat[];
}

export const ANNEES = Array.from({ length: new Date().getFullYear() - 1995 }, (_, i) => new Date().getFullYear() - i);

// Raretés et séries proposées dans les filtres.
export async function listesCourtes(supabase: SupabaseClient) {
  const [raretes, series] = await Promise.all([
    supabase.from("rarities").select("code, label_fr").neq("code", "none").order("sort_order"),
    supabase.from("series").select("code, name_fr").order("sort_order"),
  ]);
  return {
    raretes: (raretes.data ?? []).map((r) => ({ valeur: r.code as string, label: r.label_fr as string })),
    series: (series.data ?? []).map((s) => ({ valeur: s.code as string, label: s.name_fr as string })),
  };
}
