"use server";

import { revalidatePath } from "next/cache";
import { chercherCartes, type CarteResultat } from "@/lib/catalogue";
import { estFormat, NOM_MAX, PAGES_MAX, pagesApresFormat, type Classeur, type Format } from "@/lib/classeurs";
import { lireCollection, type CarteListe } from "@/lib/collection";
import { createSupabaseServer } from "@/lib/supabase-server";


export type Resultat<T = null> = { ok: true; valeur: T } | { ok: false; erreur: string };

// Les messages d'erreur des actions serveur sont masqués en production : on les renvoie comme une valeur.
async function essayer<T>(f: () => Promise<T>): Promise<Resultat<T>> {
  try {
    return { ok: true, valeur: await f() };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Ça n'a pas marché" };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function connecte() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const moi = data?.claims?.sub;
  if (!moi) throw new Error("Non connecté");
  return { supabase, moi };
}

// Le classeur, seulement s'il appartient à l'utilisateur connecté (la RLS refuserait de toute façon).
async function monClasseur(id: string) {
  if (!UUID.test(id)) throw new Error("Classeur inconnu");
  const { supabase, moi } = await connecte();
  const { data } = await supabase
    .from("binders")
    .select("id, user_id, name, slots_per_page, pages")
    .eq("id", id)
    .eq("user_id", moi)
    .maybeSingle();
  if (!data) throw new Error("Classeur introuvable");
  return { supabase, moi, classeur: data as Classeur };
}

function nomPropre(nom: string) {
  const n = String(nom ?? "").trim().slice(0, NOM_MAX);
  if (!n) throw new Error("Donne un nom au classeur");
  return n;
}

function position(p: unknown, classeur: Classeur) {
  const n = Number(p);
  if (!Number.isInteger(n) || n < 0 || n >= classeur.pages * classeur.slots_per_page) throw new Error("Case hors du classeur");
  return n;
}

function rafraichir(id?: string) {
  revalidatePath("/classeurs");
  if (id) revalidatePath(`/classeurs/${id}`);
}

async function toucher(supabase: Awaited<ReturnType<typeof connecte>>["supabase"], id: string, champs: Record<string, unknown> = {}) {
  const { error } = await supabase.from("binders").update({ ...champs, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function creerClasseur(nom: string, format: number) {
  return essayer(async () => {
    const { supabase, moi } = await connecte();
    const { data, error } = await supabase
      .from("binders")
      .insert({ user_id: moi, name: nomPropre(nom), slots_per_page: estFormat(format) ? format : 9, pages: 1 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    rafraichir();
    return data.id as string;
  });
}

// Renommer et changer le format de page : les cartes gardent leur ordre et se répartissent sur les pages.
export async function modifierClasseur(id: string, nom: string, format: number) {
  return essayer(async () => {
    const { supabase, classeur } = await monClasseur(id);
    const nouveau: Format = estFormat(format) ? format : classeur.slots_per_page;
    const { data: derniere } = await supabase
      .from("binder_slots")
      .select("position")
      .eq("binder_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dernierePosition = derniere ? (derniere.position as number) : null;
    if (dernierePosition !== null && Math.floor(dernierePosition / nouveau) + 1 > PAGES_MAX) {
      throw new Error(`Trop de cases pour des pages de ${nouveau}`);
    }
    await toucher(supabase, id, {
      name: nomPropre(nom),
      slots_per_page: nouveau,
      pages: pagesApresFormat(classeur.pages, classeur.slots_per_page, nouveau, dernierePosition),
    });
    rafraichir(id);
  });
}

export async function supprimerClasseur(id: string) {
  return essayer(async () => {
    const { supabase } = await monClasseur(id);
    const { error } = await supabase.from("binders").delete().eq("id", id);
    if (error) throw new Error(error.message);
    rafraichir();
  });
}

// Met une carte dans une case (remplace celle qui y était).
export async function placerCarte(id: string, pos: number, carte: string) {
  return essayer(async () => {
    if (!UUID.test(carte)) throw new Error("Carte inconnue");
    const { supabase, classeur } = await monClasseur(id);
    const { error } = await supabase
      .from("binder_slots")
      .upsert({ binder_id: id, position: position(pos, classeur), card_id: carte, added_at: new Date().toISOString() }, { onConflict: "binder_id,position" });
    if (error) throw new Error(error.message);
    await toucher(supabase, id);
    rafraichir(id);
  });
}

export async function viderCase(id: string, pos: number) {
  return essayer(async () => {
    const { supabase, classeur } = await monClasseur(id);
    const { error } = await supabase.from("binder_slots").delete().eq("binder_id", id).eq("position", position(pos, classeur));
    if (error) throw new Error(error.message);
    await toucher(supabase, id);
    rafraichir(id);
  });
}

// Déplace une carte ; si la case d'arrivée est prise, les deux cartes s'échangent.
export async function deplacerCarte(id: string, de: number, vers: number) {
  return essayer(async () => {
    const { supabase, classeur } = await monClasseur(id);
    const { error } = await supabase.rpc("move_binder_slot", {
      p_binder: id,
      p_from: position(de, classeur),
      p_to: position(vers, classeur),
    });
    if (error) throw new Error(error.message);
    rafraichir(id);
  });
}

export async function ajouterPage(id: string) {
  return essayer(async () => {
    const { supabase, classeur } = await monClasseur(id);
    if (classeur.pages >= PAGES_MAX) throw new Error("Nombre de pages maximum atteint");
    await toucher(supabase, id, { pages: classeur.pages + 1 });
    rafraichir(id);
    return classeur.pages + 1;
  });
}

// Retire la dernière page, seulement si elle est vide.
export async function retirerPage(id: string) {
  return essayer(async () => {
    const { supabase, classeur } = await monClasseur(id);
    if (classeur.pages <= 1) throw new Error("Un classeur garde au moins une page");
    const debut = (classeur.pages - 1) * classeur.slots_per_page;
    const { count } = await supabase
      .from("binder_slots")
      .select("position", { count: "exact", head: true })
      .eq("binder_id", id)
      .gte("position", debut);
    if (count) throw new Error("La dernière page n'est pas vide");
    await toucher(supabase, id, { pages: classeur.pages - 1 });
    rafraichir(id);
    return classeur.pages - 1;
  });
}

// Depuis la fiche d'une carte : première case libre du classeur, avec une page en plus s'il est plein.
export async function ajouterAuClasseur(id: string, carte: string) {
  return essayer(async () => {
    if (!UUID.test(carte)) throw new Error("Carte inconnue");
    const { supabase, classeur } = await monClasseur(id);
    const { data } = await supabase.from("binder_slots").select("position").eq("binder_id", id).limit(PAGES_MAX * 12);
    const prises = new Set((data ?? []).map((s) => s.position as number));
    const capacite = classeur.pages * classeur.slots_per_page;
    let libre = 0;
    while (prises.has(libre)) libre++;
    if (libre >= capacite) {
      if (classeur.pages >= PAGES_MAX) throw new Error("Classeur plein");
      await toucher(supabase, id, { pages: classeur.pages + 1 });
    }
    const { error } = await supabase.from("binder_slots").insert({ binder_id: id, position: libre, card_id: carte });
    if (error) throw new Error(error.message);
    await toucher(supabase, id);
    rafraichir(id);
    return { page: Math.floor(libre / classeur.slots_per_page) + 1 };
  });
}

// --- Choix d'une carte pour une case -------------------------------------------------------------

export async function cartesDeMaCollection(): Promise<CarteListe[]> {
  const { supabase, moi } = await connecte();
  return lireCollection(supabase, moi);
}

export async function chercherDansCatalogue(q: string, langue: string | null): Promise<CarteResultat[]> {
  const { supabase } = await connecte();
  const texte = String(q ?? "").trim().slice(0, 80);
  if (texte.length < 2) return [];
  return chercherCartes(
    supabase,
    {
      q: texte,
      langues: langue && ["FR", "JP", "KR", "TC"].includes(langue) ? [langue] : [],
      rarete: null,
      serie: null,
      annee: null,
      categorie: null,
      set: null,
      illustrateur: null,
    },
    0,
  );
}

export type Version = { id: string; language: string; number: string | null; image_small: string | null; set_nom: string | null };

// Les impressions d'une même carte dans les autres langues (famille JP / KR / CN).
export async function versionsFamille(famille: string): Promise<Version[]> {
  if (!UUID.test(famille)) return [];
  const { supabase } = await connecte();
  const { data } = await supabase
    .from("cards")
    .select("id, language, number, image_small, set_id")
    .eq("card_entity_id", famille)
    .limit(24);
  const lignes = data ?? [];
  const { data: sets } = lignes.length
    ? await supabase.from("sets_display").select("set_id, display_name").in("set_id", [...new Set(lignes.map((l) => l.set_id))])
    : { data: [] };
  const nom = new Map((sets ?? []).map((s) => [s.set_id as string, s.display_name as string]));
  const ordre = ["FR", "JP", "KR", "TC", "SC"];
  return lignes
    .map((l) => ({ id: l.id, language: l.language, number: l.number, image_small: l.image_small, set_nom: nom.get(l.set_id) ?? null }))
    .sort((a, b) => ordre.indexOf(a.language) - ordre.indexOf(b.language));
}
