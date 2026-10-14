/**
 * MISE À JOUR COMPLÈTE DU CATALOGUE — script unique
 *
 * Usage :
 *   npx tsx scripts/update.ts                      simulation : rien n'est écrit (dry-run)
 *   npx tsx scripts/update.ts --apply              mise à jour réelle
 *   options :
 *     --steps=fetch,fr,jp,ptcg,chs,post,controls   étapes à exécuter (défaut : toutes)
 *     --ptcg-langs=JP,KR,TC                        langues importées depuis PTCG-database (défaut)
 *     --delay=300                                  pause (ms) entre deux requêtes TCGdex
 *
 * Étapes, dans l'ordre :
 *   fetch     met à jour les deux dépôts de données (git pull) : PTCG-database et PTCG-CHS-Datasets
 *   fr        TCGdex français : crée les sets manquants, importe les cartes manquantes (+ n° de Pokédex)
 *   jp        TCGdex japonais : idem
 *   ptcg      PTCG-database (JP, KR, TC) : scripts/import-ptcg-database-languages-v7.ts
 *   chs       chinois simplifié : scripts/import-chs.ts (images ensuite : scripts/images-sc.ts)
 *   post      côté base : dates, séries, noms de sets, familles asiatiques, raretés héritées, noms de
 *             recherche, texte de recherche (fonctions SQL de l'étape 10)
 *   controls  les contrôles de l'étape 9 ; code de sortie 2 si un contrôle est « A VOIR »
 *
 * Règles : relançable sans doublon (clé source + langue + identifiant) ; ne supprime et n'écrase rien
 * (une carte déjà présente n'est pas modifiée) ; chaque étape est indépendante : une étape en erreur
 * n'empêche pas les suivantes, le résumé final liste ce qui a échoué.
 *
 * Rapport : output/update-<dry-run|apply>.json
 * Si l'étape « post » dépasse le délai de l'API, lancer dans le SQL Editor :  select * from run_post_import();
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const opt = (name: string): string | undefined =>
  ARGS.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const ALL_STEPS = ["fetch", "fr", "jp", "ptcg", "chs", "post", "controls"] as const;
type Step = (typeof ALL_STEPS)[number];
const STEPS = (opt("steps")?.split(",").map((s) => s.trim()) ?? [...ALL_STEPS]) as Step[];
for (const s of STEPS) {
  if (!ALL_STEPS.includes(s)) throw new Error(`Étape inconnue : ${s} (valeurs : ${ALL_STEPS.join(", ")})`);
}
const PTCG_LANGS = opt("ptcg-langs") ?? "JP,KR,TC";
const DELAY = Number(opt("delay") ?? 300);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Variables Supabase manquantes dans .env.local");
const supabase = createClient(supabaseUrl, serviceRoleKey);

const ROOT = process.cwd();
const REPORT_FILE = path.resolve(ROOT, "output", `update-${APPLY ? "apply" : "dry-run"}.json`);
const TCGDEX_API = "https://api.tcgdex.net/v2";

type StepResult = { step: string; ok: boolean; details?: unknown; error?: string; seconds: number };
const results: StepResult[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chunk = <T,>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
const log = (m: string) => console.log(m);

// -----------------------------------------------------------------------------
// Utilitaires
// -----------------------------------------------------------------------------

async function fetchJson<T>(url: string, retries = 4): Promise<T> {
  let last = "erreur inconnue";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
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

/** Catégorie normalisée (contrainte cards_category_check) */
function normalizeCategory(value: string | null | undefined): string | null {
  const v = (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (v === "pokemon") return "Pokémon";
  if (v === "trainer" || v === "dresseur") return "Dresseur";
  if (v === "energy" || v === "energie") return "Énergie";
  return null;
}

/** Série TCGdex -> code de la table `series` */
const SERIE_MAP: Record<string, string> = {
  base: "base", neo: "neo", ecard: "ecard", ex: "ex", dp: "dp", pl: "platine", hgss: "hgss", col: "col",
  bw: "bw", xy: "xy", sm: "sm", swsh: "swsh", sv: "sv", me: "me", pop: "pop", tk: "tk", mcd: "mcd",
};

async function runStep(step: Step, fn: () => Promise<unknown>): Promise<void> {
  const t0 = Date.now();
  log(`\n==================== ${step.toUpperCase()} ${APPLY ? "" : "(simulation)"} ====================`);
  try {
    const details = await fn();
    results.push({ step, ok: true, details, seconds: Math.round((Date.now() - t0) / 1000) });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`ERREUR (${step}) : ${error}`);
    results.push({ step, ok: false, error, seconds: Math.round((Date.now() - t0) / 1000) });
  }
}

function runChild(label: string, args: string[]): { status: number } {
  log(`→ ${label}`);
  const r = spawnSync("npx", ["tsx", ...args], { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${label} a échoué (code ${r.status})`);
  return { status: r.status ?? 0 };
}

// -----------------------------------------------------------------------------
// fetch : dépôts de données
// -----------------------------------------------------------------------------

async function stepFetch() {
  const repos = ["PTCG-database", "PTCG-CHS-Datasets"];
  const out: Record<string, string> = {};
  for (const repo of repos) {
    const dir = path.resolve(ROOT, repo);
    if (!fs.existsSync(path.join(dir, ".git"))) {
      throw new Error(
        `Dépôt absent : ${dir}. À cloner une fois :\n` +
          `  git clone --depth 1 https://github.com/PokemonTCG-Community/PTCG-database.git   (ou l'URL déjà utilisée)\n` +
          `  git clone --depth 1 https://github.com/duanxr/PTCG-CHS-Datasets.git`
      );
    }
    const r = spawnSync("git", ["-C", dir, "pull", "--ff-only"], { encoding: "utf8" });
    out[repo] = (r.stdout || r.stderr || "").trim().split("\n").pop() ?? "";
    log(`${repo} : ${out[repo]}`);
    if (r.status !== 0) throw new Error(`git pull a échoué pour ${repo}`);
  }
  return out;
}

// -----------------------------------------------------------------------------
// fr / jp : TCGdex
// -----------------------------------------------------------------------------

type TcgdexSetBrief = { id: string; name: string; cardCount?: { total?: number; official?: number } };
type TcgdexSetDetail = {
  id: string; name: string; releaseDate?: string; logo?: string; symbol?: string;
  serie?: { id: string; name: string };
  cardCount?: { total?: number; official?: number };
  cards?: { id: string; localId: string; name: string; image?: string }[];
};
type TcgdexCard = {
  id: string; localId: string; name: string; image?: string; category?: string; illustrator?: string;
  rarity?: string; hp?: number; types?: string[]; dexId?: number[]; regulationMark?: string;
  variants?: Record<string, boolean>;
};

async function stepTcgdex(lang: "fr" | "ja") {
  const DB_LANG = lang === "fr" ? "FR" : "JP";
  const REGION = DB_LANG;
  const stats = { setsTcgdex: 0, setsCreated: 0, setsSkippedPocket: 0, setsSkippedKnown: 0, setsSkippedEmpty: 0, cardsFound: 0, cardsMissing: 0, cardsImported: 0, errors: 0 };
  const errors: string[] = [];

  // sets déjà en base (source tcgdex)
  const { data: dbSets, error: e1 } = await supabase
    .from("sets").select("id, source_id, name").eq("source", "tcgdex").eq("language", DB_LANG).eq("product_type", "tcg");
  if (e1) throw new Error(e1.message);
  type DbSet = { id: string; source_id: string; name: string };
  const known = new Map<string, DbSet>(((dbSets ?? []) as DbSet[]).map((s) => [s.source_id, s]));

  // sets de la même langue venant d'une autre source (ex. Neo 1-4 FR, ptcg-database) : jamais recréés,
  // sinon leurs cartes seraient en double.
  const { data: otherSets, error: e2 } = await supabase
    .from("sets").select("code, source_id").eq("language", DB_LANG).neq("source", "tcgdex");
  if (e2) throw new Error(e2.message);
  const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9+.]/g, "");
  const otherCodes = new Set<string>();
  for (const r of (otherSets ?? []) as { code: string | null; source_id: string | null }[]) {
    otherCodes.add(norm(r.code)); otherCodes.add(norm(r.source_id));
  }
  const countMissing = async (cardIds: string[]): Promise<number> => {
    let present = 0;
    for (const ids of chunk(cardIds, 500)) {
      const { data, error } = await supabase
        .from("cards").select("source_id").eq("source", "tcgdex").eq("language", DB_LANG).in("source_id", ids);
      if (error) throw new Error(error.message);
      present += (data ?? []).length;
    }
    return cardIds.length - present;
  };

  const brief = await fetchJson<TcgdexSetBrief[]>(`${TCGDEX_API}/${lang}/sets`);
  stats.setsTcgdex = brief.length;
  log(`Sets TCGdex ${DB_LANG} : ${brief.length} (en base : ${known.size})`);

  // 1. sets manquants
  for (const b of brief) {
    if (known.has(b.id)) continue;
    let d: TcgdexSetDetail;
    try {
      d = await fetchJson<TcgdexSetDetail>(`${TCGDEX_API}/${lang}/sets/${encodeURIComponent(b.id)}`);
    } catch (e) {
      stats.errors++; errors.push(`set ${b.id} : ${e instanceof Error ? e.message : String(e)}`);
      log(`  ! set ${b.id} illisible, ignoré : ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    await sleep(DELAY);
    if (d.serie?.id === "tcgp") { stats.setsSkippedPocket++; continue; }  // TCG Pocket : cartes numériques
    if (otherCodes.has(norm(d.id))) { log(`  = ${d.id} existe déjà (autre source) : ignoré`); stats.setsSkippedKnown++; continue; }
    const dCards = d.cards ?? [];
    if (dCards.length === 0) { log(`  = ${d.id} — ${d.name} : aucune carte chez TCGdex, set non créé`); stats.setsSkippedEmpty++; continue; }
    if ((await countMissing(dCards.map((c) => c.id))) === 0) {
      log(`  = ${d.id} — ${d.name} : cartes déjà en base ailleurs, set non créé`); stats.setsSkippedKnown++; continue;
    }
    log(`  + nouveau set ${d.id} — ${d.name} (${d.releaseDate ?? "date inconnue"})`);
    stats.setsCreated++;
    if (!APPLY) { known.set(b.id, { id: "(simulation)", source_id: b.id, name: d.name }); continue; }
    const row = {
      source: "tcgdex", source_id: d.id, name: d.name, series: d.serie?.name ?? null,
      series_id: d.serie?.id ? SERIE_MAP[d.serie.id] ?? "autre" : null,
      language: DB_LANG, region: REGION, code: d.id, release_date: d.releaseDate ?? null,
      release_date_source: d.releaseDate ? "import" : null,
      total_cards: d.cardCount?.total ?? null, logo_url: d.logo ? `${d.logo}.webp` : null,
      symbol_url: d.symbol ? `${d.symbol}.webp` : null, product_type: "tcg",
    };
    const { data, error } = await supabase.from("sets").insert(row).select("id, source_id, name").single();
    if (error) { stats.errors++; errors.push(`set ${d.id} : ${error.message}`); continue; }
    known.set(d.id, data as DbSet);
  }

  // 2. cartes manquantes, set par set
  let i = 0;
  for (const set of known.values()) {
    i++;
    try {
      const d = await fetchJson<TcgdexSetDetail>(`${TCGDEX_API}/${lang}/sets/${encodeURIComponent(set.source_id)}`);
      await sleep(DELAY);
      const cards = d.cards ?? [];
      stats.cardsFound += cards.length;
      if (cards.length === 0) continue;

      const existing = new Set<string>();
      for (const ids of chunk(cards.map((c) => c.id), 500)) {
        const { data, error } = await supabase
          .from("cards").select("source_id").eq("source", "tcgdex").eq("language", DB_LANG).in("source_id", ids);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) existing.add(r.source_id as string);
      }
      const missing = cards.filter((c) => !existing.has(c.id));
      if (missing.length === 0) continue;
      stats.cardsMissing += missing.length;
      log(`[${i}/${known.size}] ${set.source_id} — ${set.name} : ${missing.length} carte(s) à ajouter`);
      if (!APPLY) continue;

      for (const m of missing) {
        try {
          const c = await fetchJson<TcgdexCard>(`${TCGDEX_API}/${lang}/sets/${encodeURIComponent(set.source_id)}/${encodeURIComponent(m.localId)}`);
          const row = {
            set_id: set.id, source: "tcgdex", source_id: c.id, local_id: c.localId, number: c.localId,
            name: c.name, language: DB_LANG, category: normalizeCategory(c.category),
            hp: c.hp ?? null, types: c.types ?? null, rarity: c.rarity ?? null, artist: c.illustrator ?? null,
            variants: c.variants ?? null, regulation_mark: c.regulationMark ?? null,
            dex_ids: c.dexId && c.dexId.length ? c.dexId : null,
            image_small: c.image ? `${c.image}/low.webp` : null,
            image_large: c.image ? `${c.image}/high.webp` : null,
          };
          // ignoreDuplicates : une carte déjà présente n'est jamais modifiée
          const { error } = await supabase.from("cards")
            .upsert(row, { onConflict: "source,language,source_id", ignoreDuplicates: true });
          if (error) throw new Error(error.message);
          stats.cardsImported++;
        } catch (e) {
          stats.errors++;
          errors.push(`carte ${m.id} : ${e instanceof Error ? e.message : String(e)}`);
        }
        await sleep(DELAY);
      }
    } catch (e) {
      stats.errors++;
      errors.push(`set ${set.source_id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(`Résumé ${DB_LANG} : ${JSON.stringify(stats)}`);
  if (errors.length) log(`Erreurs (${errors.length}) : ${errors.slice(0, 10).join(" | ")}`);
  return { ...stats, errorsSample: errors.slice(0, 20) };
}

// -----------------------------------------------------------------------------
// ptcg / chs : scripts d'import existants
// -----------------------------------------------------------------------------

async function stepPtcg() {
  const args = ["scripts/import-ptcg-database-languages-v7.ts", `--lang=${PTCG_LANGS}`];
  if (APPLY) args.push("--apply");
  return runChild(`PTCG-database (${PTCG_LANGS}) ${APPLY ? "import réel" : "simulation"}`, args);
}

async function stepChs() {
  const args = ["scripts/import-chs.ts"];
  if (APPLY) args.push("--apply");
  return runChild(`chinois simplifié ${APPLY ? "import réel" : "simulation"}`, args);
}

// -----------------------------------------------------------------------------
// post : fonctions SQL de l'étape 10
// -----------------------------------------------------------------------------

async function stepPost() {
  if (!APPLY) {
    log("Simulation : cette étape écrit en base ; elle sera exécutée avec --apply.");
    return { skipped: true };
  }
  const done: Record<string, unknown> = {};
  const calls: [string, Record<string, unknown>?][] = [
    ["apply_set_calendar"], ["apply_set_series"], ["apply_set_translations"],
    ["apply_asia_families"], ["apply_inherited_rarities"], ["apply_team_pokemon"], ["apply_search_names", { p_all: false }],
    ["refresh_search_text", { p_card_ids: null }],
  ];
  for (const [fn, params] of calls) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc(fn, params ?? {});
    if (error) {
      throw new Error(
        `${fn} : ${error.message}\n` +
          `Si c'est un délai dépassé, lancer dans le SQL Editor (puis relancer avec --steps=controls) :\n` +
          `  select * from run_post_import();`
      );
    }
    done[fn] = data;
    log(`  ${fn} : ${JSON.stringify(data)} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  return done;
}

// -----------------------------------------------------------------------------
// controls
// -----------------------------------------------------------------------------

async function stepControls() {
  const { data, error } = await supabase.rpc("data_controls");
  if (error) throw new Error(`data_controls : ${error.message} (migration de l'étape 10 appliquée ?)`);
  const rows = (data ?? []) as { ordre: number; controle: string; n: number; attendu: string; statut: string }[];
  for (const r of rows) log(`  [${r.statut.padEnd(6)}] ${String(r.ordre).padStart(2)}. ${r.controle} : ${r.n}  (attendu : ${r.attendu})`);
  const bad = rows.filter((r) => r.statut === "A VOIR");
  if (bad.length) {
    process.exitCode = 2;
    log(`\n${bad.length} contrôle(s) à examiner : ${bad.map((b) => b.ordre).join(", ")}`);
  }
  return { controls: rows.length, aVoir: bad.map((b) => b.controle) };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  log(`Mise à jour du catalogue — ${APPLY ? "MODE RÉEL (--apply)" : "SIMULATION (aucune écriture)"}`);
  log(`Étapes : ${STEPS.join(", ")}`);

  const table: Record<Step, () => Promise<unknown>> = {
    fetch: stepFetch,
    fr: () => stepTcgdex("fr"),
    jp: () => stepTcgdex("ja"),
    ptcg: stepPtcg,
    chs: stepChs,
    post: stepPost,
    controls: stepControls,
  };
  for (const s of ALL_STEPS) if (STEPS.includes(s)) await runStep(s, table[s]);

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ apply: APPLY, date: new Date().toISOString(), results }, null, 2));

  log("\n==================== RÉSUMÉ ====================");
  for (const r of results) log(`${r.ok ? "OK    " : "ÉCHEC "} ${r.step.padEnd(9)} ${r.seconds}s${r.error ? " — " + r.error.split("\n")[0] : ""}`);
  log(`Rapport : ${REPORT_FILE}`);
  if (results.some((r) => !r.ok)) process.exitCode = process.exitCode || 1;
}

main().catch((e) => {
  console.error("ERREUR FATALE :", e);
  process.exit(1);
});
