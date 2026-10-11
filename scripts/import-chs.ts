/**
 * Import du chinois simplifié (Chine continentale) depuis PTCG-CHS-Datasets
 * https://github.com/duanxr/PTCG-CHS-Datasets  (fichier ptcg_chs_infos.json)
 *
 * Usage :
 *   npx tsx scripts/import-chs.ts                      dry-run (aucune écriture)
 *   npx tsx scripts/import-chs.ts --apply              import réel
 *   option : --file=chemin/vers/ptcg_chs_infos.json   (défaut : PTCG-CHS-Datasets/ptcg_chs_infos.json)
 *
 * Règles :
 *   - langue SC, région CN, source « ptcg-chs »
 *   - un set = un produit (commodityCode) ; une carte appartient au produit
 *     indiqué dans sa fiche (les autres produits qui la contiennent sont ignorés)
 *   - les finitions (★, ★★, ✦, ✧, ◇ : motifs holo / reverse) d'une même carte
 *     sont regroupées en UNE carte, listées dans cards.variants
 *   - rareté brute = sigle sans le marqueur de finition (C, U, R, RR, 无标记…) ;
 *     la rareté commune est calculée par le déclencheur cards_normalize
 *   - n° de Pokédex -> cards.dex_ids (card_pokemon est rempli par déclencheur)
 *   - sets importés NON PUBLIÉS (is_published = false) tant que l'auteur du jeu
 *     de données n'a pas donné son accord ; aucune image n'est enregistrée
 *   - relançable sans doublon : (source, language, source_id) unique
 *   - rapport : output/import-chs-<mode>.json
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const FILE =
  process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length) ??
  path.resolve(process.cwd(), "PTCG-CHS-Datasets", "ptcg_chs_infos.json");

const SOURCE = "ptcg-chs";
const LANGUAGE = "SC";
const BATCH = 500;
const PAGE = 1000;
const REPORT_FILE = path.resolve(process.cwd(), "output", `import-chs-${APPLY ? "apply" : "dry-run"}.json`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Variables Supabase manquantes dans .env.local");
const supabase = createClient(supabaseUrl, serviceRoleKey);

// -----------------------------------------------------------------------------
// Vocabulaires du jeu de données (dictionnaires « dict » du fichier)
// -----------------------------------------------------------------------------

const TYPE: Record<string, string> = {
  "1": "Grass", "2": "Fire", "3": "Water", "4": "Lightning", "5": "Psychic", "6": "Fighting",
  "7": "Darkness", "8": "Metal", "9": "Fairy", "10": "Dragon", "11": "Colorless",
};
const CATEGORY: Record<string, string> = { "1": "Pokémon", "2": "Dresseur", "3": "Énergie" };
const SERIES: Record<string, string> = { "1": "sm", "2": "swsh", "3": "sv" };

// Marqueurs de finition ajoutés à la rareté (C★ = commune motif ★)
const FINISH_MARKS = /[★✦✧◇]+$/u;

type ChsCard = {
  id: number;
  name?: string;
  cardType?: string;
  details?: Record<string, any>;
};
type ChsCollection = {
  commodityCode: string;
  name: string;
  salesDate?: string;
  series?: string | null;
  cards: ChsCard[];
};

type CardRow = {
  set_code: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string;
  rarity: string | null;
  category: string;
  hp: number | null;
  types: string[] | null;
  artist: string | null;
  dex_ids: number[] | null;
  regulation_mark: string | null;
  variants: { type: string; finish: string | null; chs_id: number }[];
};

// -----------------------------------------------------------------------------
// Lecture et regroupement
// -----------------------------------------------------------------------------

function splitRarity(raw: string | null | undefined): { base: string | null; finish: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { base: null, finish: null };
  // Raretés faites uniquement de symboles (● ◆ ★ ★★ ★★★ de Collect 151) : pas de finition
  if (/^[●◆★✦✧◇]+$/u.test(text)) return { base: text, finish: null };
  const finish = text.match(FINISH_MARKS)?.[0] ?? null;
  const base = finish ? text.slice(0, -finish.length) : text;
  return { base: base || null, finish };
}

// Les cartes ex / V / GX n'ont pas de n° de Pokédex dans la source : on le
// retrouve par le nom de l'espèce en chinois simplifié (PokéAPI, table pokemon_entities),
// en prenant le nom d'espèce le plus long contenu dans le nom de la carte.
type DexResolver = (cardName: string) => number | null;
function makeDexResolver(species: { dex_id: number; name_zh_hans: string | null }[]): DexResolver {
  const list = species.filter((s) => s.name_zh_hans).sort((a, b) => b.name_zh_hans!.length - a.name_zh_hans!.length);
  return (cardName) => list.find((s) => cardName.includes(s.name_zh_hans!))?.dex_id ?? null;
}

function parse(file: string, resolveDex: DexResolver) {
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as { collections: ChsCollection[] };
  const sets = new Map<string, { code: string; name: string; release_date: string | null; series_id: string | null }>();
  for (const col of json.collections) {
    sets.set(col.commodityCode, {
      code: col.commodityCode,
      name: col.name.trim(),
      release_date: col.salesDate?.slice(0, 10) || null,
      series_id: SERIES[String(col.series ?? "")] ?? null,
    });
  }

  // une fiche par identifiant (une carte apparaît aussi dans les produits qui la rééditent)
  const byId = new Map<number, ChsCard>();
  for (const col of json.collections) for (const c of col.cards) if (!byId.has(c.id)) byId.set(c.id, c);

  // regroupement des finitions : même produit, même numéro, même nom, même rareté de base
  const groups = new Map<string, CardRow>();
  for (const c of [...byId.values()].sort((a, b) => a.id - b.id)) {
    const d = c.details ?? {};
    const code: string = d.commodityCode;
    const [num] = String(d.collectionNumber ?? "").split("/");
    const number = num?.trim() || null;
    const name = String(d.cardName ?? c.name ?? "").trim();
    const { base, finish } = splitRarity(d.rarityText);
    // Pas de regroupement pour les numéros sans chiffre (promos « SM-P ») ; une même
    // finition présente deux fois = deux cartes distinctes (réimpressions), pas des finitions.
    let key = /\d/.test(number ?? "") ? `${code}|${number}|${name}|${base}` : `id|${c.id}`;
    if (groups.get(key)?.variants.some((v) => v.finish === finish)) key = `id|${c.id}`;

    let row = groups.get(key);
    if (!row) {
      const category = CATEGORY[String(c.cardType ?? d.cardType)] ?? "Dresseur";
      const parsedDex = Number.parseInt(String(d.pokedexCode ?? ""), 10);
      const dex = Number.isFinite(parsedDex) && parsedDex > 0 ? parsedDex : category === "Pokémon" ? resolveDex(name) ?? NaN : NaN;
      const artists = (d.illustratorName ?? []).map((x: string) => String(x).trim()).filter(Boolean);
      row = {
        set_code: code,
        source_id: `SC-${code}-${c.id}`,
        local_id: number,
        number,
        name,
        rarity: base,
        category,
        hp: Number.isFinite(Number(d.hp)) && d.hp ? Number(d.hp) : null,
        types: d.attribute && TYPE[String(d.attribute)] ? [TYPE[String(d.attribute)]] : null,
        artist: artists.length ? artists.join(", ") : null,
        dex_ids: category === "Pokémon" && Number.isFinite(dex) && dex > 0 ? [dex] : null,
        regulation_mark: d.regulationMarkText || null,
        variants: [],
      };
      groups.set(key, row);
    }
    row.variants.push({ type: finish ? "holo" : "normal", finish, chs_id: c.id });
  }
  return { sets, cards: [...groups.values()], entries: byId.size };
}

// -----------------------------------------------------------------------------
// Base
// -----------------------------------------------------------------------------

/**
 * Lecture paginée « par curseur » (keyset) : on trie sur `key` et on repart après la
 * dernière valeur lue, au lieu de sauter N lignes (offset).
 *
 * Pourquoi : sur `cards` (plusieurs centaines de milliers de lignes), l'ancienne version
 * filtrait sur source + langue mais triait sur `id`. Postgres parcourait alors toute la
 * table dans l'ordre des id en cherchant les lignes « ptcg-chs / SC » — dont il n'existe
 * encore aucune — et dépassait le délai de l'API (statement timeout).
 * En triant sur `source_id`, la requête utilise directement l'index unique
 * (source, language, source_id) : elle est instantanée, même quand rien ne correspond.
 *
 * `key` doit figurer dans `columns` et être unique pour le filtre donné.
 */
async function fetchAll<T extends Record<string, any>>(
  table: string,
  columns: string,
  filter: (q: any) => any,
  key = "id",
): Promise<T[]> {
  const out: T[] = [];
  let last: unknown = null;
  for (;;) {
    let q = filter(supabase.from(table).select(columns));
    if (last !== null) q = q.gt(key, last);
    const { data, error } = await q.order(key).limit(PAGE);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    last = (data[data.length - 1] as T)[key];
  }
  return out;
}

async function main() {
  console.log(`\nIMPORT CHINOIS SIMPLIFIÉ — ${APPLY ? "IMPORT RÉEL" : "DRY-RUN (aucune écriture)"}`);
  console.log(`Fichier : ${FILE}\n`);
  if (!fs.existsSync(FILE)) throw new Error(`Fichier introuvable : ${FILE}`);

  const species = await fetchAll<{ id: number; dex_id: number; name_zh_hans: string | null }>(
    "pokemon_entities", "id,dex_id,name_zh_hans", (q) => q);
  const { sets, cards, entries } = parse(FILE, makeDexResolver(species));
  console.log(`Produits (sets)          : ${sets.size}`);
  console.log(`Fiches distinctes        : ${entries}`);
  console.log(`Cartes après regroupement: ${cards.length} (finitions ★ rangées dans variants)`);

  const existingSets = await fetchAll<{ id: string; source_id: string }>(
    "sets", "id,source_id", (q) => q.eq("source", SOURCE).eq("language", LANGUAGE), "source_id");
  const existingCards = await fetchAll<{ id: string; source_id: string }>(
    "cards", "id,source_id", (q) => q.eq("source", SOURCE).eq("language", LANGUAGE), "source_id");
  const setIdByCode = new Map(existingSets.map((s) => [s.source_id, s.id]));
  const knownCards = new Set(existingCards.map((c) => c.source_id));

  const newSets = [...sets.values()].filter((s) => !setIdByCode.has(s.code));
  const newCards = cards.filter((c) => !knownCards.has(c.source_id));
  console.log(`Sets déjà en base        : ${existingSets.length} — à créer : ${newSets.length}`);
  console.log(`Cartes déjà en base      : ${existingCards.length} — à créer : ${newCards.length}`);

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    date: new Date().toISOString(),
    sets: sets.size, entries, cards: cards.length,
    newSets: newSets.length, newCards: newCards.length,
    byCategory: Object.fromEntries(["Pokémon", "Dresseur", "Énergie"].map((k) => [k, cards.filter((c) => c.category === k).length])),
    rawRarities: Object.fromEntries(
      [...cards.reduce((m, c) => m.set(c.rarity ?? "∅", (m.get(c.rarity ?? "∅") ?? 0) + 1), new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])),
    pokemonWithoutDex: cards.filter((c) => c.category === "Pokémon" && !c.dex_ids).length,
    examples: cards.slice(0, 5),
  };

  if (APPLY) {
    for (let i = 0; i < newSets.length; i += BATCH) {
      const part = newSets.slice(i, i + BATCH).map((s) => ({
        source: SOURCE, source_id: s.code, language: LANGUAGE, region: "CN", code: s.code, name: s.name,
        release_date: s.release_date, series_id: s.series_id, product_type: "tcg",
        total_cards: cards.filter((c) => c.set_code === s.code).length,
        is_published: false,
      }));
      const { data, error } = await supabase.from("sets").insert(part).select("id,source_id");
      if (error) throw new Error(`sets: ${error.message}`);
      for (const s of data ?? []) setIdByCode.set(s.source_id, s.id);
    }
    let inserted = 0;
    for (let i = 0; i < newCards.length; i += BATCH) {
      const part = newCards.slice(i, i + BATCH).map(({ set_code, ...c }) => ({
        ...c, set_id: setIdByCode.get(set_code), source: SOURCE, language: LANGUAGE,
      }));
      const { error } = await supabase.from("cards")
        .upsert(part, { onConflict: "source,language,source_id", ignoreDuplicates: true });
      if (error) throw new Error(`cards: ${error.message}`);
      inserted += part.length;
      process.stdout.write(`\rCartes insérées : ${inserted}/${newCards.length}`);
    }
    console.log("");
  }

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\nRapport : ${path.relative(process.cwd(), REPORT_FILE)}`);
  if (!APPLY) console.log("Relancer avec --apply pour importer.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
