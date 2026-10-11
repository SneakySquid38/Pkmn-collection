/**
 * PTCG-DATABASE V7 — import + enrichissement multilingue (FR / JP / KR / SC / TC)
 *
 * Usage :
 *   npx tsx scripts/import-ptcg-database-languages-v7.ts                 dry-run (aucune écriture)
 *   npx tsx scripts/import-ptcg-database-languages-v7.ts --apply         import réel
 *   options :
 *     --lang=KR,TC      limiter à certaines langues (FR, JP, KR, SC, TC)
 *     --force-enrich    signaler aussi les conflits de valeurs (sans jamais écraser)
 *
 * Nouveautés par rapport à la v6 :
 *   - SET_ALIASES : sets PTCG déjà présents en base sous un autre code (évite les doublons)
 *   - le dry-run compte les cartes qui seraient insérées, par langue et par set
 *   - insertions par lots de 500 (cartes, sets, relations) et mises à jour en parallèle
 *   - relations carte <-> Pokémon vérifiées en mémoire (plus une requête par carte)
 *   - pagination ordonnée (fiable) dans fetchAll
 *   - l'illustrateur (artist) est enregistré sur les nouvelles cartes
 *   - chinois traditionnel : région TW
 *   - vérifie que la migration SQL a été appliquée avant d'écrire
 *   - rapport détaillé écrit dans output/import-v7-<mode>.json
 *   - relançable sans risque : les cartes déjà importées sont ignorées
 *   - cartes physiques uniquement : les sets TCG Pocket (mélangés dans data_fr)
 *     sont ignorés
 *   - numéros partagés : quand plusieurs fichiers d'un set ont le même numéro
 *     (decks jumelés, variantes), ce sont des cartes distinctes ; la v6 les
 *     fusionnait et en perdait environ 4 600
 *   - secondes impressions (même numéro et même nom, autre identifiant officiel :
 *     motifs Poké Ball / Master Ball...) marquées variant_type = 'alt_print' ;
 *     la première impression est rapprochée de la carte existante
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const ROOT = path.resolve(process.cwd(), "PTCG-database");

const ALL_LANGS = [
  { code: "FR", dir: "data_fr", region: "FR" },
  { code: "JP", dir: "data_jp", region: "JP" },
  { code: "KR", dir: "data_ko", region: "KR" },
  { code: "SC", dir: "data_sc", region: "CN" },
  { code: "TC", dir: "data_tc", region: "TW" },
] as const;

/**
 * Sets de PTCG-database déjà présents en base sous un autre code (import TCGdex).
 * Clé : "LANGUE|CODE_PTCG" en majuscules -> source_id du set existant en base.
 * Les cartes de ces sets enrichissent le set existant au lieu d'en créer un second.
 */
const SET_ALIASES: Record<string, string> = {
  "JP|XY1-BX": "XY1a", // Collection X
  "JP|XY1-BY": "XY1b", // Collection Y
  "JP|XY5-BG": "XY5a", // Gaia Volcano
  "JP|XY5-BT": "XY5b", // Tidal Storm
  "JP|XY8-BB": "XY8a", // Blue Impact
  "JP|XY8-BR": "XY8b", // Red Flash
  "JP|XY9-B": "XY9", // Rage of the Broken Heavens
  "JP|XY10-B": "XY10", // Awakening Psychic King
  "JP|XY11-BB": "XY11a", // Explosive Fighter
  "JP|XY11-BR": "XY11b", // Cruel Traitor
  "JP|L1-BHG": "L1a", // HeartGold Collection
  "JP|L1-BSS": "L1b", // SoulSilver Collection
  "JP|L2-B": "L2", // Reviving Legends
  "JP|L3-B": "L3", // Clash at the Summit
};

const SOURCE = "ptcg-database";
const PAGE = 1000;
const BATCH = 500;
const SET_BATCH = 200;
const CONCURRENCY = 8;

const APPLY = process.argv.includes("--apply");
const FORCE_ENRICH = process.argv.includes("--force-enrich");

const LANG_ARG = process.argv.find((a) => a.startsWith("--lang="));
const LANG_FILTER = LANG_ARG
  ? new Set(LANG_ARG.slice("--lang=".length).split(",").map((l) => l.trim().toUpperCase()).filter(Boolean))
  : null;
if (LANG_FILTER) {
  const unknown = [...LANG_FILTER].filter((l) => !ALL_LANGS.some((x) => x.code === l));
  if (unknown.length) throw new Error(`Langue(s) inconnue(s) : ${unknown.join(", ")} (attendu : FR, JP, KR, SC, TC)`);
}
const LANGS = ALL_LANGS.filter((l) => !LANG_FILTER || LANG_FILTER.has(l.code));

const REPORT_FILE = path.resolve(process.cwd(), "output", `import-v7-${APPLY ? "apply" : "dry-run"}.json`);

const SET_COLUMNS =
  "id,source,source_id,name,series,language,region,code,release_date,total_cards,logo_url,symbol_url,product_type";
const CARD_COLUMNS =
  "id,set_id,source,source_id,local_id,number,name,language,rarity,category,hp,types,artist,image_small,image_large,dex_ids,variants,regulation_mark";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type RawCard = Record<string, any> & {
  number?: string | number | null;
  name?: string;
  img?: string;
  set_name?: string;
  set_total?: string | number;
  set_code?: string;
  set_img?: string;
  card_type?: string;
  pokedex_number?: number | string;
  hp?: number;
  types?: string[];
  rarity?: string;
  author?: string[];
  jp_id?: string | number;
  ko_id?: string | number;
  regulation?: string;
  set_full_name?: string;
};

type DbSet = {
  id: string;
  source: string;
  source_id: string;
  name: string | null;
  series: string | null;
  language: string | null;
  region: string | null;
  code: string | null;
  release_date: string | null;
  total_cards: number | null;
  logo_url: string | null;
  symbol_url: string | null;
  product_type: string | null;
};

type DbCard = {
  id: string;
  set_id: string;
  source: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string | null;
  rarity: string | null;
  category: string | null;
  hp: number | null;
  types: string[] | null;
  artist: string | null;
  image_small: string | null;
  image_large: string | null;
  dex_ids: number[] | null;
  variants: any;
  regulation_mark: string | null;
};

type SetData = {
  lang: string;
  code: string;
  cards: { file: string; card: RawCard }[];
};

type NewCard = {
  label: string;
  setLabel: string;
  row: Record<string, any>;
  pokemonId: string | null;
};

type Relation = { card_id: string; pokemon_entity_id: string; dex_position: number };

type LangStats = {
  files: number;
  existing: number;
  toInsert: number;
  inserted: number;
  setsToCreate: number;
  setsAliased: number;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function norm(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function numberKey(value: unknown): string {
  const s = norm(value);
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Relance une requête Supabase jusqu'à 3 fois en cas d'erreur (coupure réseau, surcharge). */
async function withRetry<R extends { error: any }>(fn: () => PromiseLike<R>, attempts = 3): Promise<R> {
  let last!: R;
  for (let i = 1; i <= attempts; i++) {
    last = await fn();
    if (!last.error) return last;
    if (i < attempts) await sleep(1000 * i);
  }
  return last;
}

/** Exécute fn sur chaque élément, avec au plus `size` requêtes en parallèle. */
async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function progress(label: string, done: number, total: number) {
  process.stdout.write(`\r  ${label} : ${done}/${total}`);
  if (done >= total) process.stdout.write("\n");
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(() =>
      supabase.from(table).select(columns).order("id").range(from, from + PAGE - 1),
    );
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

function getCardNumber(card: RawCard, setCode: string): string | null {
  if (card.number != null && String(card.number).trim() !== "") {
    return String(card.number).trim();
  }

  const printKey = String(card.print_key ?? "").trim();
  if (printKey) {
    const escaped = setCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = printKey.match(new RegExp(`(?:^|:)${escaped}-(.+)$`, "i"));
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

function parseDex(card: RawCard, label: string, invalidDex: string[]): number | null {
  const raw = card.pokedex_number;
  const text = raw == null ? "" : String(raw).trim();
  if (!text) return null;

  const normalized = text.replace(/^No\.\s*/i, "");
  const value = Number(normalized);
  const dex = Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null;

  if (dex == null) invalidDex.push(`${label}: ${text}`);
  return dex;
}

function category(card: RawCard, dex: number | null): string | null {
  // Un numéro de Pokédex valide est un signal plus fiable que card_type,
  // incohérent dans certaines données historiques.
  if (dex != null) return "Pokémon";

  const t = norm(card.card_type);
  if (!t) return null;
  if (/(ENERGY|ENERGIE|에너지|能量|能源|エネルギー)/i.test(t)) return "Énergie";
  return "Dresseur";
}

function sourceId(lang: string, setCode: string, file: string, card: RawCard): string {
  // Conserve la convention historique de l'import S4 déjà présente en base.
  if (lang === "JP" && setCode === "S4" && card.jp_id != null) return String(card.jp_id);
  if (lang === "KR" && card.ko_id != null) return `${lang}-${card.ko_id}`;
  return `${lang}-${setCode}-${path.basename(file, ".json")}`;
}

function imageUrl(card: RawCard): string | null {
  const value = String(card.img ?? "").trim();
  return value || null;
}

function nonEmpty<T>(value: T | null | undefined): value is T {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function arraysEqual(a: any[] | null | undefined, b: any[] | null | undefined): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
}

// -----------------------------------------------------------------------------
// Lecture du dépôt PTCG-database
// -----------------------------------------------------------------------------

/**
 * Ordre d'impression d'un fichier : "48167.json" -> [48167, 0], "037-2.json" -> [37, 2].
 * La première impression d'un numéro (identifiant officiel le plus bas) est la
 * carte normale ; les suivantes portant le même nom sont des variantes.
 */
function printOrder(file: string): [number, number, string] {
  const base = path.basename(file, ".json");
  const m = base.match(/^(\d+)(?:-(\d+))?$/);
  return m ? [Number(m[1]), Number(m[2] ?? 0), base] : [Number.MAX_SAFE_INTEGER, 0, base];
}

function comparePrintOrder(a: string, b: string): number {
  const [a1, a2, a3] = printOrder(a);
  const [b1, b2, b3] = printOrder(b);
  return a1 - b1 || a2 - b2 || a3.localeCompare(b3);
}

/** Codes des sets TCG Pocket (dossier data_pocket), en majuscules. */
function pocketSetCodes(): Set<string> {
  const dir = path.join(ROOT, "data_pocket");
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).map((c) => c.toUpperCase()));
}

/** Une carte TCG Pocket (jeu mobile) : série « Pocket » ou image rangée sous /tcgp/. */
function isPocketCard(card: RawCard): boolean {
  return /pocket/i.test(String(card.series ?? ""))
    || /\/tcgp\//i.test(String(card.img ?? ""))
    || /\/tcgp\//i.test(String(card.set_img ?? ""));
}

function readRepository(report: { pocketSetsSkipped: string[] }): SetData[] {
  if (!fs.existsSync(ROOT)) throw new Error(`Dépôt introuvable : ${ROOT}`);

  const pocketCodes = pocketSetCodes();
  const all: SetData[] = [];

  for (const lang of LANGS) {
    const root = path.join(ROOT, lang.dir);
    if (!fs.existsSync(root)) throw new Error(`Dossier introuvable : ${root}`);

    const setDirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const code of setDirs) {
      const setDir = path.join(root, code);
      const cards: { file: string; card: RawCard }[] = [];

      for (const file of fs.readdirSync(setDir).filter((f) => f.endsWith(".json")).sort(comparePrintOrder)) {
        const full = path.join(setDir, file);
        const card = JSON.parse(fs.readFileSync(full, "utf8")) as RawCard;
        card.number = getCardNumber(card, code);

        if (card.name == null || String(card.name).trim() === "") {
          throw new Error(`${lang.code}/${code}/${file}: nom absent`);
        }

        cards.push({ file, card });
      }

      // Uniquement les cartes physiques : les sets TCG Pocket sont ignorés.
      if (pocketCodes.has(code.toUpperCase()) || cards.some(({ card }) => isPocketCard(card))) {
        report.pocketSetsSkipped.push(`${lang.code}/${code} (${cards.length} cartes)`);
        continue;
      }

      all.push({ lang: lang.code, code, cards });
    }
  }

  return all;
}

// -----------------------------------------------------------------------------
// Vérification de la migration SQL
// -----------------------------------------------------------------------------

async function migrationApplied(): Promise<boolean> {
  // La migration du 2026-10-09 crée la table profiles : sa présence sert de témoin.
  const { error } = await supabase.from("profiles").select("id").limit(1);
  return !error;
}

// -----------------------------------------------------------------------------
// Sets : correspondance, alias et création
// -----------------------------------------------------------------------------

async function resolveSets(
  repository: SetData[],
  existingSets: DbSet[],
  report: any,
  stats: Map<string, LangStats>,
): Promise<Map<string, DbSet>> {
  const map = new Map<string, DbSet>();

  for (const set of existingSets) {
    const lang = norm(set.language);
    if (!LANGS.some((l) => l.code === lang)) continue;
    map.set(`${lang}|${norm(set.source_id)}`, set);
  }

  const toCreate: { key: string; row: Record<string, any> }[] = [];

  for (const data of repository) {
    const key = `${data.lang}|${norm(data.code)}`;
    if (map.has(key)) continue;

    const alias = SET_ALIASES[key];
    if (alias) {
      const target = map.get(`${data.lang}|${norm(alias)}`);
      if (target) {
        map.set(key, target);
        stats.get(data.lang)!.setsAliased++;
        report.setsAliased.push(`${data.lang}/${data.code} -> ${target.source_id}`);
        continue;
      }
      report.warnings.push(`Alias ${data.lang}/${data.code} -> ${alias} : set cible introuvable en base, le set sera créé.`);
    }

    const first = data.cards[0]?.card;
    const totals = data.cards
      .map((x) => Number(x.card.set_total))
      .filter((n) => Number.isFinite(n) && n > 0);
    const langInfo = LANGS.find((l) => l.code === data.lang)!;

    toCreate.push({
      key,
      row: {
        source: SOURCE,
        source_id: data.code,
        name: first?.set_full_name ?? first?.set_name ?? data.code,
        series: null,
        language: data.lang,
        region: langInfo.region,
        code: data.code,
        release_date: null,
        total_cards: totals.length ? Math.max(...totals) : data.cards.length,
        logo_url: first?.set_img ?? null,
        symbol_url: null,
        product_type: "tcg",
      },
    });
    stats.get(data.lang)!.setsToCreate++;
  }

  report.setsMissing = toCreate.length;

  if (!APPLY) {
    // Dry-run : faux sets, uniquement pour le calcul des correspondances.
    for (const { key, row } of toCreate) {
      map.set(key, { id: `DRY:${key}`, ...row } as DbSet);
    }
    return map;
  }

  if (toCreate.length) console.log(`\nCréation de ${toCreate.length} sets...`);
  let done = 0;
  for (const part of chunk(toCreate, SET_BATCH)) {
    const { data, error } = await withRetry(() =>
      supabase.from("sets").insert(part.map((p) => p.row)).select(SET_COLUMNS),
    );
    if (error || !data) {
      throw new Error(`Création des sets : ${error?.message ?? "réponse vide"}. Relance le script : les sets déjà créés seront réutilisés.`);
    }
    for (const created of data as DbSet[]) {
      map.set(`${norm(created.language)}|${norm(created.source_id)}`, created);
      report.setsCreated++;
    }
    done += part.length;
    progress("Sets créés", done, toCreate.length);
  }

  return map;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const started = Date.now();

  console.log("==============================================");
  console.log(" PTCG-DATABASE V7 — IMPORT + ENRICHISSEMENT");
  console.log("==============================================");
  console.log(`MODE : ${APPLY ? "IMPORT RÉEL" : "DRY-RUN (aucune écriture)"}`);
  console.log(`Enrichissement forcé : ${FORCE_ENRICH ? "OUI" : "NON"}`);
  console.log(`Langues : ${LANGS.map((l) => l.code).join(" / ")}`);
  console.log(`Dépôt : ${ROOT}\n`);

  if (!(await migrationApplied())) {
    const message = "La table profiles est introuvable : la migration SQL du 2026-10-09 ne semble pas appliquée.";
    if (APPLY) throw new Error(`${message} Import annulé, rien n'a été écrit.`);
    console.warn(`⚠️  ${message}\n   Le dry-run continue, mais l'import réel sera refusé.\n`);
  }

  console.log("Lecture des fichiers PTCG-database...");
  const pocketSetsSkipped: string[] = [];
  const repository = readRepository({ pocketSetsSkipped });

  const stats = new Map<string, LangStats>(
    LANGS.map((l) => [l.code, { files: 0, existing: 0, toInsert: 0, inserted: 0, setsToCreate: 0, setsAliased: 0 }]),
  );

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    pocketSetsSkipped,
    sets: repository.length,
    setsMissing: 0,
    setsCreated: 0,
    setsAliased: [] as string[],
    files: 0,
    existingMatched: 0,
    toInsert: 0,
    inserted: 0,
    insertSkipped: 0,
    sourceDuplicates: 0,
    sharedNumbers: 0,
    altPrints: 0,
    enriched: 0,
    fieldsEnriched: 0,
    relationsToInsert: 0,
    relationsInserted: 0,
    relationsAlreadyPresent: 0,
    noNumber: 0,
    missingPokemon: [] as string[],
    invalidDex: [] as string[],
    conflicts: [] as string[],
    warnings: [] as string[],
    errors: [] as string[],
    insertsBySet: {} as Record<string, number>,
  };

  console.log("Chargement de la base...");
  const existingSets = await fetchAll<DbSet>("sets", SET_COLUMNS);
  const setMap = await resolveSets(repository, existingSets, report, stats);

  const existingCards = await fetchAll<DbCard>("cards", CARD_COLUMNS);
  const allSetsById = new Map([...existingSets, ...setMap.values()].map((s) => [s.id, s]));

  // Plusieurs cartes en base peuvent partager un numéro dans un set (variantes) :
  // on garde la liste complète.
  const cardsBySetNumber = new Map<string, DbCard[]>();
  const cardsBySourceId = new Map<string, DbCard>();

  for (const card of existingCards) {
    cardsBySourceId.set(`${card.source}|${card.source_id}`, card);
    const set = allSetsById.get(card.set_id);
    if (!set) continue;
    const lang = norm(card.language ?? set.language);
    if (!LANGS.some((l) => l.code === lang)) continue;
    if (card.number != null || card.local_id != null) {
      const key = `${lang}|${set.id}|${numberKey(card.number ?? card.local_id)}`;
      const list = cardsBySetNumber.get(key);
      if (list) list.push(card);
      else cardsBySetNumber.set(key, [card]);
    }
  }

  // Dans PTCG-database, plusieurs cartes DIFFÉRENTES peuvent partager un numéro
  // dans un même set (decks jumelés, variantes d'illustration...). On compte ces
  // groupes pour ne rapprocher par numéro que lorsqu'il n'y a pas d'ambiguïté.
  const sourceCountBySetNumber = new Map<string, number>();

  // Une carte en base ne peut être rapprochée que d'un seul fichier source.
  // Les cartes déjà importées depuis PTCG-database sont réservées d'avance
  // à leur propre fichier (identifiant exact), pour qu'un autre fichier du même
  // numéro ne puisse pas les « prendre ».
  const claimed = new Set<string>();

  // Secondes impressions : même set, même numéro, même nom qu'une impression
  // précédente (motifs Poké Ball / Master Ball, réimpressions...). Les fichiers
  // étant triés par ordre d'impression, la première rencontrée est la normale.
  const altPrints = new Set<string>();
  const seenPrints = new Set<string>();

  for (const data of repository) {
    const set = setMap.get(`${data.lang}|${norm(data.code)}`)!;
    for (const { file, card } of data.cards) {
      const own = cardsBySourceId.get(`${SOURCE}|${sourceId(data.lang, data.code, file, card)}`);
      if (own) claimed.add(own.id);
      if (card.number == null) continue;
      const key = `${data.lang}|${set.id}|${numberKey(card.number)}`;
      sourceCountBySetNumber.set(key, (sourceCountBySetNumber.get(key) ?? 0) + 1);

      const printKey = `${key}|${norm(card.name)}`;
      if (seenPrints.has(printKey)) altPrints.add(`${data.lang}/${data.code}/${file}`);
      else seenPrints.add(printKey);
    }
  }
  report.altPrints = altPrints.size;
  report.sharedNumbers = [...sourceCountBySetNumber.values()].filter((n) => n > 1).length;

  const pokemonEntities = await fetchAll<{ id: string; dex_id: number }>("pokemon_entities", "id,dex_id");
  const pokemonByDex = new Map(pokemonEntities.map((p) => [Math.trunc(p.dex_id), p.id]));

  const existingRelations = await fetchAll<{ card_id: string; pokemon_entity_id: string }>(
    "card_pokemon",
    "card_id,pokemon_entity_id",
  );
  const relationKeys = new Set(existingRelations.map((r) => `${r.card_id}|${r.pokemon_entity_id}`));

  // ---------------------------------------------------------------------------
  // 1. Préparation : tout est calculé en mémoire, rien n'est encore écrit
  // ---------------------------------------------------------------------------
  console.log("Analyse des cartes...");

  const newCards = new Map<string, NewCard>(); // clé : source_id
  const updates: { id: string; label: string; patch: Record<string, unknown> }[] = [];
  const relationsForExisting: Relation[] = [];

  for (const data of repository) {
    const set = setMap.get(`${data.lang}|${norm(data.code)}`)!;
    const langStats = stats.get(data.lang)!;
    const setLabel = `${data.lang}/${data.code}`;

    for (const { file, card } of data.cards) {
      report.files++;
      langStats.files++;
      const label = `${setLabel}/${file}`;

      const sid = sourceId(data.lang, data.code, file, card);
      const number = card.number == null ? null : String(card.number);
      if (number == null) report.noNumber++;

      const dex = parseDex(card, label, report.invalidDex);
      if (dex != null && !pokemonByDex.has(dex)) {
        report.missingPokemon.push(`${label}: #${dex}`);
        continue;
      }
      const pokemonId = dex == null ? null : pokemonByDex.get(dex)!;

      const setNumberKey = number != null ? `${data.lang}|${set.id}|${numberKey(number)}` : null;

      // 1. Carte déjà importée depuis PTCG-database : identifiant exact.
      let existing = cardsBySourceId.get(`${SOURCE}|${sid}`);

      // 2. Sinon, carte d'une autre source (TCGdex...) : même set + même numéro.
      //    Si plusieurs fichiers source partagent ce numéro, le nom doit aussi
      //    correspondre, et chaque carte en base n'est attribuée qu'une fois.
      if (!existing && setNumberKey && !set.id.startsWith("DRY:")) {
        const ambiguous = (sourceCountBySetNumber.get(setNumberKey) ?? 0) > 1;
        existing = (cardsBySetNumber.get(setNumberKey) ?? []).find(
          (c) => !claimed.has(c.id) && (!ambiguous || norm(c.name) === norm(card.name)),
        );
        if (existing) claimed.add(existing.id);
      }

      const img = imageUrl(card);
      const nextDex = dex == null ? null : [dex];
      const nextCategory = category(card, dex);
      const nextArtist = Array.isArray(card.author) && card.author.length ? card.author.join(", ") : null;

      // --- Nouvelle carte -----------------------------------------------------
      if (!existing) {
        // Même identifiant source présent deux fois : on complète la première
        // occurrence au lieu de dupliquer. (Un numéro partagé ne suffit pas :
        // ce sont souvent des cartes différentes.)
        const pending = newCards.get(sid);
        if (pending) {
          report.sourceDuplicates++;
          const incoming: Record<string, unknown> = {
            image_small: img, image_large: img, artist: nextArtist, rarity: card.rarity ?? null,
            hp: card.hp ?? null, types: card.types ?? null, regulation_mark: card.regulation ?? null,
          };
          for (const [field, value] of Object.entries(incoming)) {
            if (!nonEmpty(pending.row[field]) && nonEmpty(value)) pending.row[field] = value;
          }
          if (!pending.pokemonId && pokemonId) {
            pending.pokemonId = pokemonId;
            pending.row.category = "Pokémon";
            pending.row.dex_ids = nextDex;
          }
          continue;
        }

        // Toutes les lignes ont exactement les mêmes colonnes (requis pour un envoi par lot).
        const entry: NewCard = {
          label,
          setLabel,
          pokemonId,
          row: {
            set_id: set.id,
            source: SOURCE,
            source_id: sid,
            local_id: number ?? sid,
            number,
            name: card.name ?? null,
            language: data.lang,
            rarity: card.rarity ?? null,
            variant_type: altPrints.has(label) ? "alt_print" : null,
            category: nextCategory,
            hp: card.hp ?? null,
            types: card.types ?? null,
            artist: nextArtist,
            variants: null,
            regulation_mark: card.regulation ?? null,
            image_small: img,
            image_large: img,
            dex_ids: nextDex ?? [],
          },
        };
        newCards.set(sid, entry);
        langStats.toInsert++;
        report.insertsBySet[setLabel] = (report.insertsBySet[setLabel] ?? 0) + 1;
        continue;
      }

      // --- Carte existante : enrichissement prudent ---------------------------
      report.existingMatched++;
      langStats.existing++;

      const patch: Record<string, unknown> = {};
      const conflicts: string[] = [];

      const maybePatch = (field: keyof DbCard, value: unknown) => {
        const current = existing[field];
        if (!nonEmpty(current) && nonEmpty(value)) {
          patch[field] = value;
          return;
        }
        if (FORCE_ENRICH && nonEmpty(current) && nonEmpty(value) && JSON.stringify(current) !== JSON.stringify(value)) {
          conflicts.push(field);
        }
      };

      maybePatch("image_small", img);
      maybePatch("image_large", img);
      maybePatch("artist", nextArtist);
      maybePatch("rarity", card.rarity ?? null);
      maybePatch("hp", card.hp ?? null);
      maybePatch("types", card.types ?? null);
      maybePatch("category", nextCategory);
      maybePatch("regulation_mark", card.regulation ?? null);

      if ((!Array.isArray(existing.dex_ids) || existing.dex_ids.length === 0) && nextDex?.length) {
        patch.dex_ids = nextDex;
      } else if (Array.isArray(existing.dex_ids) && nextDex?.length && !arraysEqual(existing.dex_ids, nextDex)) {
        conflicts.push("dex_ids");
      }

      if (conflicts.length) report.conflicts.push(`${label}: ${conflicts.join(", ")}`);

      if (Object.keys(patch).length > 0) {
        report.enriched++;
        report.fieldsEnriched += Object.keys(patch).length;
        updates.push({ id: existing.id, label, patch });
        // Les cartes suivantes de la source voient la valeur enrichie (comme en v6).
        Object.assign(existing, patch);
      }

      if (pokemonId) {
        const relKey = `${existing.id}|${pokemonId}`;
        if (relationKeys.has(relKey)) {
          report.relationsAlreadyPresent++;
        } else {
          relationKeys.add(relKey);
          relationsForExisting.push({ card_id: existing.id, pokemon_entity_id: pokemonId, dex_position: 0 });
        }
      }
    }
  }

  report.toInsert = newCards.size;
  report.relationsToInsert =
    relationsForExisting.length + [...newCards.values()].filter((c) => c.pokemonId).length;

  // ---------------------------------------------------------------------------
  // 2. Écriture (uniquement avec --apply)
  // ---------------------------------------------------------------------------
  if (APPLY) {
    // 2a. Enrichissement des cartes existantes, en parallèle
    if (updates.length) {
      console.log(`\nEnrichissement de ${updates.length} cartes existantes...`);
      let done = 0;
      await runPool(updates, CONCURRENCY, async (u) => {
        const { error } = await withRetry(() => supabase.from("cards").update(u.patch).eq("id", u.id));
        if (error) report.errors.push(`${u.label}: enrichissement: ${error.message}`);
        done++;
        if (done % 200 === 0 || done === updates.length) progress("Cartes enrichies", done, updates.length);
      });
    }

    // 2b. Nouvelles cartes, par lots
    const entries = [...newCards.values()];
    const idBySourceId = new Map<string, string>();
    if (entries.length) {
      console.log(`\nInsertion de ${entries.length} nouvelles cartes...`);
      let done = 0;
      for (const part of chunk(entries, BATCH)) {
        const { data, error } = await withRetry(() =>
          supabase
            .from("cards")
            .upsert(part.map((e) => e.row), { onConflict: "source,language,source_id", ignoreDuplicates: true })
            .select("id,source_id"),
        );
        if (error) {
          report.errors.push(`Lot de cartes ${part[0].label} … ${part[part.length - 1].label} : ${error.message}`);
        } else {
          for (const row of (data ?? []) as { id: string; source_id: string }[]) idBySourceId.set(row.source_id, row.id);
          for (const e of part) {
            if (idBySourceId.has(e.row.source_id)) {
              report.inserted++;
              stats.get(e.row.language)!.inserted++;
            } else {
              report.insertSkipped++;
            }
          }
        }
        done += part.length;
        progress("Cartes insérées", done, entries.length);
      }
    }

    // 2c. Relations carte <-> Pokémon, par lots
    const relations: Relation[] = [...relationsForExisting];
    for (const e of entries) {
      const id = idBySourceId.get(e.row.source_id);
      if (id && e.pokemonId) relations.push({ card_id: id, pokemon_entity_id: e.pokemonId, dex_position: 0 });
    }
    if (relations.length) {
      console.log(`\nAjout de ${relations.length} relations carte <-> Pokémon...`);
      let done = 0;
      for (const part of chunk(relations, BATCH)) {
        const { error } = await withRetry(() =>
          supabase.from("card_pokemon").upsert(part, { onConflict: "card_id,pokemon_entity_id", ignoreDuplicates: true }),
        );
        if (error) report.errors.push(`Lot de relations : ${error.message}`);
        else report.relationsInserted += part.length;
        done += part.length;
        progress("Relations ajoutées", done, relations.length);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Rapport
  // ---------------------------------------------------------------------------
  const seconds = Math.round((Date.now() - started) / 1000);

  console.log("\n==============================================");
  console.log(` RAPPORT V7 — ${APPLY ? "IMPORT RÉEL" : "DRY-RUN"}`);
  console.log("==============================================");
  console.log("Langue | Fichiers | Déjà en base | À insérer | Insérées | Sets à créer | Sets alias");
  for (const [lang, s] of stats) {
    console.log(
      `${lang.padEnd(6)} | ${String(s.files).padStart(8)} | ${String(s.existing).padStart(12)} | ${String(s.toInsert).padStart(9)} | ${String(APPLY ? s.inserted : "-").padStart(8)} | ${String(s.setsToCreate).padStart(12)} | ${String(s.setsAliased).padStart(10)}`,
    );
  }
  console.log("");
  console.log(`Sets TCG Pocket ignorés   : ${report.pocketSetsSkipped.length}`);
  console.log(`Sets parcourus            : ${report.sets}`);
  console.log(`Sets absents              : ${report.setsMissing}${APPLY ? ` (créés : ${report.setsCreated})` : ""}`);
  console.log(`Sets rattachés par alias  : ${report.setsAliased.length}`);
  console.log(`Fichiers cartes           : ${report.files}`);
  console.log(`Cartes déjà présentes     : ${report.existingMatched}`);
  console.log(`Cartes à insérer          : ${report.toInsert}`);
  if (APPLY) {
    console.log(`Cartes insérées           : ${report.inserted}`);
    console.log(`Cartes ignorées (déjà là) : ${report.insertSkipped}`);
  }
  console.log(`Doublons dans la source   : ${report.sourceDuplicates}`);
  console.log(`Numéros partagés (source) : ${report.sharedNumbers} (cartes distinctes, gérées une par une)`);
  console.log(`Secondes impressions      : ${report.altPrints} (marquées variant_type = 'alt_print')`);
  console.log(`Cartes enrichies          : ${report.enriched} (${report.fieldsEnriched} champs)`);
  console.log(`Cartes sans numéro        : ${report.noNumber}`);
  console.log(`Relations à ajouter       : ${report.relationsToInsert}${APPLY ? ` (ajoutées : ${report.relationsInserted})` : ""}`);
  console.log(`Relations déjà présentes  : ${report.relationsAlreadyPresent}`);
  console.log(`Pokémon manquants         : ${report.missingPokemon.length}`);
  console.log(`dex_ids invalides         : ${report.invalidDex.length}`);
  console.log(`Conflits non écrasés      : ${report.conflicts.length}`);
  console.log(`Avertissements            : ${report.warnings.length}`);
  console.log(`Erreurs                   : ${report.errors.length}`);
  console.log(`Durée                     : ${seconds} s`);

  const topSets = Object.entries(report.insertsBySet).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topSets.length) {
    console.log("\nSETS AVEC LE PLUS DE CARTES À INSÉRER :");
    for (const [set, n] of topSets) console.log(`  ${set.padEnd(20)} ${n}`);
  }
  if (report.pocketSetsSkipped.length) {
    console.log("\nSETS TCG POCKET IGNORÉS :");
    console.log(`  ${report.pocketSetsSkipped.join(", ")}`);
  }
  if (report.warnings.length) {
    console.log("\nAVERTISSEMENTS :");
    console.log(report.warnings.slice(0, 50).join("\n"));
  }
  if (report.errors.length) {
    console.log("\nERREURS :");
    console.log(report.errors.slice(0, 50).join("\n"));
  }

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ ...report, byLanguage: Object.fromEntries(stats) }, null, 2));
  console.log(`\nRapport complet : ${path.relative(process.cwd(), REPORT_FILE)}`);

  console.log("\n==============================================");
  console.log(APPLY ? " IMPORT TERMINÉ" : " DRY-RUN TERMINÉ — aucun changement");
  console.log("==============================================");
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});