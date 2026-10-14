/**
 * IMAGES MANQUANTES — complète image_small / image_large des cartes FR et JP qui n'en ont pas
 *
 * Usage :
 *   npx tsx scripts/images-manquantes.ts                       simulation : rien n'est écrit
 *   npx tsx scripts/images-manquantes.ts --apply               écriture réelle
 *   options :
 *     --steps=tcgdex,pokepedia,bulbapedia   étapes à exécuter (défaut : toutes, dans cet ordre)
 *     --delay=400                           pause (ms) entre deux requêtes vers un site
 *
 * Étapes :
 *   tcgdex      relit TCGdex : la carte a peut-être reçu une image depuis l'import (update.ts ne
 *               modifie jamais une carte existante)
 *   pokepedia   Poképédia : scans « Carte_<extension>_<numéro>.png » (FR), et pour quelques sets
 *               japonais anciens « Carte_<extension>_<nom japonais>.png »
 *   bulbapedia  Bulbapedia : pages de cartes des sets japonais exclusifs (VS, web), titre « Nom (VS 12) »
 *
 * Règles : seules les cartes encore sans image sont touchées ; une image déjà présente n'est jamais
 * remplacée ; un rapprochement ambigu (deux fichiers ou deux cartes possibles) est écarté ; chaque
 * image écrite porte sa source dans cards.image_source (pour le crédit, et pour annuler si besoin).
 *
 * Rapports : output/images-manquantes-<dry-run|apply>.json
 *            output/images-apercu.html  (toutes les images proposées, à vérifier avant --apply)
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const opt = (name: string): string | undefined =>
  ARGS.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const ALL_STEPS = ["tcgdex", "pokepedia", "bulbapedia"] as const;
type Step = (typeof ALL_STEPS)[number];
const STEPS = (opt("steps")?.split(",").map((s) => s.trim()) ?? [...ALL_STEPS]) as Step[];
for (const s of STEPS) {
  if (!ALL_STEPS.includes(s)) throw new Error(`Étape inconnue : ${s} (valeurs : ${ALL_STEPS.join(", ")})`);
}
const DELAY = Number(opt("delay") ?? 400);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Variables Supabase manquantes dans .env.local");
const supabase = createClient(supabaseUrl, serviceRoleKey);

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, "output");
const REPORT_FILE = path.join(OUT_DIR, `images-manquantes-${APPLY ? "apply" : "dry-run"}.json`);
const PREVIEW_FILE = path.join(OUT_DIR, "images-apercu.html");

const TCGDEX_API = "https://api.tcgdex.net/v2";
const POKEPEDIA_API = "https://www.pokepedia.fr/api.php";
const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";
// Les wikis demandent un User-Agent qui identifie l'outil
const HEADERS = { "User-Agent": "KrikrouCollection/1.0 (https://www.krikroucollection.fr; catalogue personnel)" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(m);

async function fetchJson<T>(url: string, retries = 4): Promise<T> {
  let last = "erreur inconnue";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return (await r.json()) as T;
      last = `${r.status} ${r.statusText}`;
      if (![429, 502, 503, 504].includes(r.status)) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < retries) await sleep(2000 * 2 ** (attempt - 1));
  }
  throw new Error(`${url} → ${last}`);
}

// -----------------------------------------------------------------------------
// Correspondances set de la base → nom utilisé par les wikis
// -----------------------------------------------------------------------------

/**
 * Poképédia, cartes FR : préfixe du fichier « Carte_<préfixe>_<numéro>.png ».
 * loose = le numéro du wiki peut être sans les lettres du nôtre (SWSH251 ↔ 251), utile pour les promos.
 * Un set absent de cette liste est signalé dans le rapport ; un préfixe faux donne « 0 fichier ».
 */
const POKEPEDIA_FR: Record<string, { prefix: string; loose?: boolean }> = {
  dp1: { prefix: "Diamant_&_Perle" },
  dp2: { prefix: "Diamant_&_Perle_Trésors_Mystérieux" },
  dp4: { prefix: "Diamant_&_Perle_Duels_au_sommet" },
  dp5: { prefix: "Diamant_&_Perle_Aube_Majestueuse" },
  dp6: { prefix: "Diamant_&_Perle_Éveil_des_Légendes" },
  dp7: { prefix: "Diamant_&_Perle_Tempête" },
  dpp: { prefix: "Promo_DP" },
  hgssp: { prefix: "Promo_HGSS" },
  col1: { prefix: "L'Appel_des_Légendes" },
  smp: { prefix: "Promo_SM" },
  "sm3.5": { prefix: "Légendes_Brillantes" },
  "sm7.5": { prefix: "Majesté_des_Dragons" },
  sm10: { prefix: "Soleil_et_Lune_Alliance_Infaillible" },
  sm11: { prefix: "Soleil_et_Lune_Harmonie_des_Esprits" },
  sm115: { prefix: "Destinées_Occultes" },
  sma: { prefix: "Destinées_Occultes" },                 // numéros SV1…SV94
  "swsh4.5sv": { prefix: "Destinées_Radieuses" },        // numéros SV001…
  swsh9tg: { prefix: "Épée_et_Bouclier_Stars_Étincelantes" },
  swsh10tg: { prefix: "Épée_et_Bouclier_Astres_Radieux" },
  swsh11tg: { prefix: "Épée_et_Bouclier_Origine_Perdue" },
  swsh12tg: { prefix: "Épée_et_Bouclier_Tempête_Argentée" },
  "swsh12.5gg": { prefix: "Zénith_Suprême" },
  swshp: { prefix: "Promo_SWSH", loose: true },
  svp: { prefix: "Promo_SV", loose: true },
  xyp: { prefix: "Promo_XY" },
  mep: { prefix: "Promo_ME", loose: true },
  np: { prefix: "Promo_Nintendo", loose: true },
  basep: { prefix: "Promo_Wizards", loose: true },
  cel25: { prefix: "Célébrations" },
  cel25cc: { prefix: "Célébrations", loose: true },
  det1: { prefix: "Détective_Pikachu" },
  sve: { prefix: "Écarlate_et_Violet_Énergie_de_base" },
  mee: { prefix: "Méga-Évolution_Énergie_de_base" },
  exu: { prefix: "EX_Forces_Cachées" },
  ecard2: { prefix: "Aquapolis" },
  "2011bw": { prefix: "Collection_McDonald's_2011" },
  "2012bw": { prefix: "Collection_McDonald's_2012" },
  "2013bw": { prefix: "Collection_McDonald's_2013" },
  "2014xy": { prefix: "Collection_McDonald's_2014" },
  "2015xy": { prefix: "Collection_McDonald's_2015" },
  "2016xy": { prefix: "Collection_McDonald's_2016" },
  "2017sm": { prefix: "Collection_McDonald's_2017" },
  "2018sm-fr": { prefix: "Collection_McDonald's_2018_(France)" },
  "2019sm-fr": { prefix: "Collection_McDonald's_2019_(France)" },
  "2021swsh": { prefix: "Collection_McDonald's_2021" },
  "2024sv": { prefix: "Collection_McDonald's_2024" },
  // Kits du dresseur : un préfixe par moitié de kit
  "tk-xy-n": { prefix: "XY_Kit_du_Dresseur_Bruyverne" },
  "tk-xy-sy": { prefix: "XY_Kit_du_Dresseur_Nymphali" },
  "tk-xy-latia": { prefix: "XY_Kit_du_Dresseur_Latias" },
  "tk-xy-latio": { prefix: "XY_Kit_du_Dresseur_Latios" },
  "tk-xy-p": { prefix: "XY_Kit_du_Dresseur_Pikachu_Catcheur" },
  "tk-xy-su": { prefix: "XY_Kit_du_Dresseur_Suicune" },
  "tk-xy-b": { prefix: "XY_Kit_du_Dresseur_Scalproie" },
  "tk-xy-w": { prefix: "XY_Kit_du_Dresseur_Grodoudou" },
  "tk-bw-z": { prefix: "Noir_&_Blanc_Kit_du_Dresseur_Zoroark" },
  "tk-bw-e": { prefix: "Noir_&_Blanc_Kit_du_Dresseur_Minotaupe" },
  "tk-hs-g": { prefix: "HS_Kit_du_Dresseur_Léviator" },
  "tk-hs-r": { prefix: "HS_Kit_du_Dresseur_Raichu" },
  "tk-sm-r": { prefix: "Soleil_et_Lune_Kit_du_Dresseur_Raichu_d'Alola" },
  "tk-sm-l": { prefix: "Soleil_et_Lune_Kit_du_Dresseur_Lougaroc" },
  "tk-dp-m": { prefix: "Diamant_&_Perle_Kit_Dresseur_Manaphy" },
  "tk-dp-l": { prefix: "Diamant_&_Perle_Kit_Dresseur_Lucario" },
  "tk-ex-latia": { prefix: "EX_Kit_Dresseur_Latias" },
  "tk-ex-latio": { prefix: "EX_Kit_Dresseur_Latios" },
  "tk-ex-m": { prefix: "EX_Kit_Dresseur_2_Négapi" },
  "tk-ex-p": { prefix: "EX_Kit_Dresseur_2_Posipi" },
};

/** Poképédia, sets japonais anciens : fichiers nommés par le nom japonais de la carte, sans numéro */
const POKEPEDIA_JP_PAR_NOM: Record<string, string> = {
  PMCG1: "拡張パック",
  PMCG2: "ポケモンジャングル",
  PMCG3: "化石の秘密",
  PMCG4: "ロケット団",
  PMCG5: "リーダーズスタジアム",
  PMCG6: "闇からの挑戦",
};

/** Bulbapedia, sets japonais exclusifs : page du set et libellé des pages de cartes « Nom (<libellé> <n°>) » */
const BULBAPEDIA_JP: Record<string, { page: string; label: string }> = {
  VS1: { page: "Pokémon VS (TCG)", label: "VS" },
  web1: { page: "Pokémon Web (TCG)", label: "Pokémon Web" },
};

// -----------------------------------------------------------------------------
// Cartes sans image
// -----------------------------------------------------------------------------

type Card = {
  id: string; set_id: string; number: string | null; name: string; language: string;
  source: string; source_id: string; set_code: string; set_source_id: string; set_name: string;
};
type Proposal = {
  card: Card; source: Step; small: string; large: string; file: string;
};

const hasNoImage = "image_small.is.null,image_small.eq.";

async function loadMissing(): Promise<Card[]> {
  const sets = new Map<string, { code: string; source_id: string; name: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sets").select("id, code, source_id, name").in("language", ["FR", "JP"]).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) sets.set(s.id as string, { code: s.code as string, source_id: s.source_id as string, name: s.name as string });
    if (!data || data.length < 1000) break;
  }
  const out: Card[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("cards").select("id, set_id, number, name, language, source, source_id")
      .in("language", ["FR", "JP"]).or(hasNoImage)
      .order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const s = sets.get(c.set_id as string);
      if (!s) continue;
      out.push({ ...(c as Omit<Card, "set_code" | "set_source_id" | "set_name">), set_code: s.code, set_source_id: s.source_id, set_name: s.name });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Numéro comparable : majuscules, sans zéros de tête (SV001 → SV1, 007 → 7), %3F → ? */
function normNumber(v: string | null | undefined): string {
  let s = (v ?? "").trim();
  try { s = decodeURIComponent(s); } catch { /* garder tel quel */ }
  return s.toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, "$1");
}
/** Numéro sans ses lettres de tête (SWSH251 → 251), pour les promos */
const looseNumber = (v: string) => normNumber(v).replace(/^[A-Z]+(?=\d)/, "");
/** Nom comparable (japonais) : forme NFKC, sans espaces ni ponctuation de liaison */
const normName = (v: string) => v.normalize("NFKC").replace(/[\s_・･·]/g, "").toLowerCase();

/** Regroupe par clé ; une clé présente plusieurs fois est ambiguë (valeur null) */
function uniqueMap<T>(items: T[], key: (t: T) => string): Map<string, T | null> {
  const m = new Map<string, T | null>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    m.set(k, m.has(k) ? null : it);
  }
  return m;
}

// -----------------------------------------------------------------------------
// Étape tcgdex
// -----------------------------------------------------------------------------

type TcgdexSet = { id: string; cards?: { id: string; localId: string; image?: string }[] };

async function stepTcgdex(cards: Card[], taken: Set<string>) {
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  const todo = cards.filter((c) => c.source === "tcgdex" && !taken.has(c.id));
  const bySet = new Map<string, Card[]>();
  for (const c of todo) {
    const k = `${c.language}|${c.set_source_id}`;
    bySet.set(k, [...(bySet.get(k) ?? []), c]);
  }
  log(`${todo.length} cartes TCGdex sans image, dans ${bySet.size} sets`);
  for (const [k, list] of bySet) {
    const [lang, setId] = k.split("|");
    const apiLang = lang === "FR" ? "fr" : "ja";
    try {
      const d = await fetchJson<TcgdexSet>(`${TCGDEX_API}/${apiLang}/sets/${encodeURIComponent(setId)}`);
      const images = new Map((d.cards ?? []).filter((c) => c.image).map((c) => [c.id, c.image as string]));
      let n = 0;
      for (const c of list) {
        const img = images.get(c.source_id);
        if (!img) continue;
        proposals.push({ card: c, source: "tcgdex", small: `${img}/low.webp`, large: `${img}/high.webp`, file: img });
        n++;
      }
      if (n) log(`  ${lang} ${setId} : ${n} / ${list.length}`);
    } catch (e) {
      errors.push(`${k} : ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(DELAY);
  }
  return { proposals, errors };
}

// -----------------------------------------------------------------------------
// Étape pokepedia
// -----------------------------------------------------------------------------

type WikiImage = { name: string; url: string; width: number };

/** Tous les fichiers dont le nom commence par `prefix` */
async function pokepediaFiles(prefix: string): Promise<WikiImage[]> {
  const out: WikiImage[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const params = new URLSearchParams({
      action: "query", list: "allimages", aiprefix: prefix, ailimit: "500",
      aiprop: "url|size", format: "json", ...cont,
    });
    type R = { query?: { allimages?: { name: string; url: string; width: number }[] }; continue?: Record<string, string> };
    const r = await fetchJson<R>(`${POKEPEDIA_API}?${params}`);
    for (const i of r.query?.allimages ?? []) out.push({ name: i.name, url: i.url, width: i.width });
    await sleep(DELAY);
    if (!r.continue) break;
    cont = r.continue;
  }
  return out;
}

/** Miniature MediaWiki : …/images/b/bf/F.png → …/images/thumb/b/bf/F.png/245px-F.png (sauf si l'original est plus petit) */
function wikiThumb(img: WikiImage, width: number): string {
  if (!img.width || img.width <= width) return img.url;
  const m = img.url.match(/^(.*\/images)\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/);
  return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${width}px-${m[3]}` : img.url;
}

async function stepPokepedia(cards: Card[], taken: Set<string>) {
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  const unmapped = new Map<string, number>();
  const perSet: Record<string, { cards: number; files: number; matched: number }> = {};
  const todo = cards.filter((c) => !taken.has(c.id));
  const bySet = new Map<string, Card[]>();
  for (const c of todo) {
    const k = `${c.language}|${c.set_code}`;
    bySet.set(k, [...(bySet.get(k) ?? []), c]);
  }

  for (const [k, list] of bySet) {
    const [lang, code] = k.split("|");
    try {
      if (lang === "FR") {
        const conf = POKEPEDIA_FR[code];
        if (!conf) { unmapped.set(k, list.length); continue; }
        const head = `Carte_${conf.prefix}_`.replace(/ /g, "_");
        const files = (await pokepediaFiles(head)).map((f) => ({ ...f, token: f.name.slice(head.length).replace(/\.(png|jpe?g|webp|gif)$/i, "") }))
          // les variantes « 058_(Pack_Récompense…) » et les préfixes plus longs (autre set) sont écartés
          .filter((f) => f.token && !/[_()]/.test(f.token));
        const exact = uniqueMap(files, (f) => normNumber(f.token));
        const loose = conf.loose ? uniqueMap(files, (f) => looseNumber(f.token)) : null;
        let matched = 0;
        for (const c of list) {
          const f = exact.get(normNumber(c.number)) ?? (loose ? loose.get(looseNumber(c.number ?? "")) : undefined);
          if (!f) continue;
          proposals.push({ card: c, source: "pokepedia", small: wikiThumb(f, 245), large: wikiThumb(f, 600), file: f.name });
          matched++;
        }
        perSet[k] = { cards: list.length, files: files.length, matched };
      } else {
        const prefix = POKEPEDIA_JP_PAR_NOM[code];
        if (!prefix) continue;   // les autres sets JP sont pour Bulbapedia ou sans source
        const head = `Carte_${prefix}_`;
        const files = (await pokepediaFiles(head)).map((f) => ({ ...f, token: f.name.slice(head.length).replace(/\.(png|jpe?g|webp|gif)$/i, "") }))
          .filter((f) => f.token && !/[()]/.test(f.token));
        const byName = uniqueMap(files, (f) => normName(f.token));
        const ourNames = uniqueMap(list, (c) => normName(c.name));   // deux cartes du même nom : ambigu
        let matched = 0;
        for (const c of list) {
          if (!ourNames.get(normName(c.name))) continue;
          const f = byName.get(normName(c.name));
          if (!f) continue;
          proposals.push({ card: c, source: "pokepedia", small: wikiThumb(f, 245), large: wikiThumb(f, 600), file: f.name });
          matched++;
        }
        perSet[k] = { cards: list.length, files: files.length, matched };
      }
      const p = perSet[k];
      log(`  ${k.padEnd(18)} ${String(p.matched).padStart(4)} / ${String(p.cards).padEnd(4)} (${p.files} fichiers sur Poképédia)`);
    } catch (e) {
      errors.push(`${k} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { proposals, errors, perSet, setsSansCorrespondance: Object.fromEntries(unmapped) };
}

// -----------------------------------------------------------------------------
// Étape bulbapedia
// -----------------------------------------------------------------------------

async function stepBulbapedia(cards: Card[], taken: Set<string>) {
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  const perSet: Record<string, { cards: number; pages: number; withImage: number; matched: number }> = {};

  for (const [code, conf] of Object.entries(BULBAPEDIA_JP)) {
    const list = cards.filter((c) => c.language === "JP" && c.set_code === code && !taken.has(c.id));
    if (list.length === 0) continue;
    try {
      // pages liées depuis la page du set, avec leur image principale (suit la pagination)
      const pages = new Map<string, { title: string; thumb?: string; width?: number }>();
      let cont: Record<string, string> = {};
      for (;;) {
        const params = new URLSearchParams({
          action: "query", generator: "links", titles: conf.page, gpllimit: "500",
          prop: "pageimages", piprop: "thumbnail", pithumbsize: "600", pilimit: "50", format: "json", ...cont,
        });
        type R = { query?: { pages?: Record<string, { title: string; thumbnail?: { source: string; width: number } }> }; continue?: Record<string, string> };
        const r = await fetchJson<R>(`${BULBAPEDIA_API}?${params}`);
        for (const p of Object.values(r.query?.pages ?? {})) {
          const prev = pages.get(p.title);
          pages.set(p.title, { title: p.title, thumb: p.thumbnail?.source ?? prev?.thumb, width: p.thumbnail?.width ?? prev?.width });
        }
        await sleep(DELAY);
        if (!r.continue) break;
        cont = r.continue;
      }
      const re = new RegExp(`\\(${conf.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\w+)\\)$`);
      const cardPages = [...pages.values()]
        .map((p) => ({ ...p, num: p.title.match(re)?.[1] }))
        .filter((p): p is typeof p & { num: string } => !!p.num);
      const byNum = uniqueMap(cardPages.filter((p) => p.thumb), (p) => normNumber(p.num));
      let matched = 0;
      for (const c of list) {
        const p = byNum.get(normNumber(c.number));
        if (!p?.thumb) continue;
        const small = p.thumb.includes("/600px-") ? p.thumb.replace("/600px-", "/245px-") : p.thumb;
        proposals.push({ card: c, source: "bulbapedia", small, large: p.thumb, file: p.title });
        matched++;
      }
      perSet[code] = { cards: list.length, pages: cardPages.length, withImage: byNum.size, matched };
      log(`  JP|${code.padEnd(15)} ${String(matched).padStart(4)} / ${String(list.length).padEnd(4)} (${cardPages.length} pages de cartes, ${byNum.size} avec image)`);
    } catch (e) {
      errors.push(`${code} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { proposals, errors, perSet };
}

// -----------------------------------------------------------------------------
// Écriture, aperçu, rapport
// -----------------------------------------------------------------------------

async function checkColumn(): Promise<boolean> {
  const { error } = await supabase.from("cards").select("image_source").limit(1);
  return !error;
}

async function applyProposals(list: Proposal[]) {
  let written = 0, skipped = 0;
  const errors: string[] = [];
  for (const p of list) {
    // garde-fou : on n'écrit que si la carte est toujours sans image
    const { data, error } = await supabase.from("cards")
      .update({ image_small: p.small, image_large: p.large, image_source: p.source })
      .eq("id", p.card.id).or(hasNoImage).select("id");
    if (error) { errors.push(`${p.card.id} : ${error.message}`); continue; }
    if (data && data.length) written++; else skipped++;
  }
  return { written, skipped, errors: errors.slice(0, 20) };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);

function writePreview(all: Proposal[]) {
  const groups = new Map<string, Proposal[]>();
  for (const p of all) {
    const k = `${p.source} · ${p.card.language} · ${p.card.set_code} — ${p.card.set_name}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const sections = [...groups].map(([title, list]) => `
<h2>${esc(title)} <small>(${list.length})</small></h2>
<div class="grille">${list.map((p) => `
  <figure><a href="${esc(p.large)}" target="_blank" rel="noreferrer"><img src="${esc(p.small)}" loading="lazy" referrerpolicy="no-referrer" alt=""></a>
  <figcaption>${esc(p.card.number ?? "?")} · ${esc(p.card.name)}</figcaption></figure>`).join("")}
</div>`).join("\n");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Images proposées</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f6f6f6}h2{margin-top:32px;font-size:18px}
.grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
figure{margin:0;background:#fff;padding:6px;border-radius:8px}img{width:100%;aspect-ratio:63/88;object-fit:contain}
figcaption{font-size:12px;margin-top:4px}</style></head><body>
<h1>Images proposées (${all.length})</h1>
<p>Vérifie que chaque image correspond à la carte <b>et à sa langue</b>. Clic = grande image.</p>
${sections}</body></html>`;
  fs.writeFileSync(PREVIEW_FILE, html);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log(`Images manquantes — ${APPLY ? "ÉCRITURE" : "simulation (rien n'est écrit)"} — étapes : ${STEPS.join(", ")}`);
  if (APPLY && !(await checkColumn())) {
    throw new Error("La colonne cards.image_source n'existe pas : lance d'abord le SQL 13-image-source.sql");
  }

  const cards = await loadMissing();
  const count = (l: string) => cards.filter((c) => c.language === l).length;
  log(`Cartes sans image : FR ${count("FR")}, JP ${count("JP")}`);

  const taken = new Set<string>();
  const report: Record<string, unknown> = { mode: APPLY ? "apply" : "dry-run", date: new Date().toISOString(), avant: { FR: count("FR"), JP: count("JP") } };
  const all: Proposal[] = [];

  for (const step of STEPS) {
    log(`\n==================== ${step.toUpperCase()} ====================`);
    const res = step === "tcgdex" ? await stepTcgdex(cards, taken)
      : step === "pokepedia" ? await stepPokepedia(cards, taken)
      : await stepBulbapedia(cards, taken);
    for (const p of res.proposals) taken.add(p.card.id);
    all.push(...res.proposals);
    const { proposals, ...rest } = res;
    const byLang = { FR: proposals.filter((p) => p.card.language === "FR").length, JP: proposals.filter((p) => p.card.language === "JP").length };
    log(`→ ${step} : ${proposals.length} image(s) trouvée(s) (FR ${byLang.FR}, JP ${byLang.JP})`);
    if (rest.errors.length) log(`  Erreurs (${rest.errors.length}) : ${rest.errors.slice(0, 5).join(" | ")}`);
    const written = APPLY ? await applyProposals(proposals) : null;
    if (written) log(`  écrites : ${written.written}, déjà remplies entre-temps : ${written.skipped}`);
    report[step] = { trouvees: byLang, ...rest, ecriture: written };
  }

  writePreview(all);
  const restant = {
    FR: count("FR") - all.filter((p) => p.card.language === "FR").length,
    JP: count("JP") - all.filter((p) => p.card.language === "JP").length,
  };
  report.restant = restant;
  report.proposals = all.map((p) => ({ id: p.card.id, langue: p.card.language, set: p.card.set_code, numero: p.card.number, nom: p.card.name, source: p.source, fichier: p.file, small: p.small, large: p.large }));
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  log(`\nTotal : ${all.length} image(s) ${APPLY ? "écrites" : "à écrire"}. Restent sans image : FR ${restant.FR}, JP ${restant.JP}`);
  log(`Rapport : ${path.relative(ROOT, REPORT_FILE)}`);
  log(`Aperçu à vérifier : ${path.relative(ROOT, PREVIEW_FILE)}`);
}

main().catch((e) => {
  console.error(`ERREUR : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
