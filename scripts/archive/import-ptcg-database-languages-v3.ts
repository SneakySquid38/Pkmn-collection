import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Variables Supabase manquantes dans .env.local");
const supabase = createClient(url, key);

const ROOT = path.resolve(process.cwd(), "PTCG-database");
const LANGS = [
  { code: "JP", dir: "data_jp", region: "JP" },
  { code: "KR", dir: "data_ko", region: "KR" },
  { code: "SC", dir: "data_sc", region: "CN" },
  { code: "TC", dir: "data_tc", region: "CN" },
] as const;

const SOURCE = "ptcg-database";
const PAGE = 1000;
const BATCH = 100;
const APPLY = process.argv.includes("--apply");

type RawCard = Record<string, any> & {
  number?: string | number;
  name?: string;
  img?: string;
  set_name?: string;
  set_total?: string | number;
  set_code?: string;
  card_type?: string;
  pokedex_number?: number;
  hp?: number;
  types?: string[];
  rarity?: string;
  author?: string[];
  print_key?: string;
  card_key?: string;
  jp_id?: string | number;
  ko_id?: string | number;
};

type DbSet = {
  id: string;
  source: string;
  source_id: string;
  name: string | null;
  language: string | null;
  region: string | null;
  code: string | null;
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
  image_small: string | null;
  image_large: string | null;
  dex_ids: number[] | null;
};

type SetData = { lang: string; code: string; cards: { file: string; card: RawCard }[] };

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function numberKey(v: unknown): string {
  const s = norm(v);
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

function getSetCode(dirName: string, card: RawCard): string {
  return String(card.set_code ?? dirName).trim();
}

/**
 * PTCG-database n'est pas parfaitement homogène sur les anciennes cartes.
 * La majorité possède `number`, mais certaines anciennes fiches japonaises
 * (notamment 20th) portent le numéro uniquement dans `print_key`, par exemple
 * `asia:20th-1`.
 *
 * On privilégie toujours `number`. Si absent, on récupère uniquement la
 * partie située après le code du set dans `print_key`. On ne déduit jamais
 * un numéro à partir du nom du fichier : le nom du fichier est un identifiant
 * source et peut être sans rapport avec le numéro imprimé.
 */
function getCardNumber(card: RawCard, setCode: string): string | null {
  if (card.number != null && String(card.number).trim() !== "") {
    return String(card.number).trim();
  }

  const printKey = String(card.print_key ?? "").trim();
  if (printKey) {
    const escapedSet = setCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = printKey.match(new RegExp(`(?:^|:)${escapedSet}-(.+)$`, "i"));
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

function sourceId(lang: string, setCode: string, file: string, card: RawCard): string {
  // On garde les IDs historiques S4 déjà importés, mais les nouveaux IDs
  // sont préfixés pour éviter toute collision entre langues/sets.
  if (lang === "JP" && setCode === "S4" && card.jp_id != null) return String(card.jp_id);
  if (lang === "KR" && card.ko_id != null) return `${lang}-${card.ko_id}`;
  return `${lang}-${setCode}-${path.basename(file, ".json")}`;
}

function category(card: RawCard): string | null {
  if (card.pokedex_number != null) return "Pokémon";
  const t = norm(card.card_type);
  if (!t) return null;
  if (/(ENERGY|ENERGIE|에너지|能量|能源|エネルギー)/i.test(t)) return "Énergie";
  if (/(TRAINER|TRAINER CARD|TRAINER'S|TRAINER CARD|트레이너|トレーナー|구즈|グッズ|サポート|スタジアム)/i.test(t)) return "Dresseur";
  return "Dresseur";
}

function readRepository(): SetData[] {
  if (!fs.existsSync(ROOT)) throw new Error(`Dépôt introuvable : ${ROOT}`);
  const all: SetData[] = [];
  for (const lang of LANGS) {
    const root = path.join(ROOT, lang.dir);
    if (!fs.existsSync(root)) throw new Error(`Dossier introuvable : ${root}`);
    for (const dirent of fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const code = dirent.name;
      const setDir = path.join(root, code);
      const cards: { file: string; card: RawCard }[] = [];
      for (const file of fs.readdirSync(setDir).filter((f) => f.endsWith(".json"))) {
        const full = path.join(setDir, file);
        const card = JSON.parse(fs.readFileSync(full, "utf8")) as RawCard;
        const number = getCardNumber(card, code);
        // Certaines très anciennes fiches (notamment certaines énergies
        // promotionnelles) ne possèdent réellement aucun numéro de carte
        // dans la source. Dans ce cas, on conserve number = null :
        // on ne doit surtout pas fabriquer un numéro à partir du nom du fichier
        // (le nom du fichier est un identifiant source, pas le numéro imprimé).
        card.number = number;
        if (!number) {
          console.warn(`⚠️ ${lang.code}/${code}/${file}: aucun numéro imprimé fourni par la source → number=NULL`);
        }
        if (card.name == null || String(card.name).trim() === "") {
          throw new Error(`${lang.code}/${code}/${file}: nom absent`);
        }
        cards.push({ file, card });
      }
      all.push({ lang: lang.code, code, cards });
    }
  }
  return all;
}

async function ensureSets(setData: SetData[], existingSets: DbSet[]): Promise<Map<string, DbSet>> {
  const map = new Map<string, DbSet>();
  for (const s of existingSets) {
    const lang = norm(s.language);
    if (LANGS.some((l) => l.code === lang)) map.set(`${lang}|${norm(s.source_id)}`, s);
  }

  if (!APPLY) return map;

  for (const data of setData) {
    const langInfo = LANGS.find((l) => l.code === data.lang)!;
    const key = `${data.lang}|${norm(data.code)}`;
    if (map.has(key)) continue;
    const totals = data.cards.map((x) => Number(x.card.set_total)).filter((n) => Number.isFinite(n) && n > 0);
    const total = totals.length ? Math.max(...totals) : data.cards.length;
    const { data: inserted, error } = await supabase.from("sets").insert({
      source: SOURCE,
      source_id: data.code,
      name: data.cards[0]?.card.set_name ?? data.code,
      series: null,
      language: data.lang,
      region: langInfo.region,
      code: data.code,
      release_date: null,
      total_cards: total,
      logo_url: data.cards[0]?.card.set_img ?? null,
      symbol_url: null,
      product_type: "tcg",
    }).select("id,source,source_id,name,language,region,code,product_type").single();
    if (error || !inserted) throw new Error(`Création set ${data.lang}/${data.code}: ${error?.message ?? "inconnu"}`);
    const row = inserted as DbSet;
    map.set(key, row);
    console.log(`  + Set ${data.lang}/${data.code}`);
  }
  return map;
}

async function main() {
  console.log("==============================================");
  console.log(" IMPORT PTCG-DATABASE — JP / KR / SC / TC");
  console.log("==============================================");
  console.log(`MODE : ${APPLY ? "IMPORT RÉEL" : "DRY-RUN"}`);
  console.log(`Dépôt : ${ROOT}\n`);

  const repository = readRepository();
  const existingSets = await fetchAll<DbSet>("sets", "id,source,source_id,name,language,region,code,product_type");
  const setMap = await ensureSets(repository, existingSets);

  if (!APPLY) {
    for (const data of repository) {
      if (!setMap.has(`${data.lang}|${norm(data.code)}`)) {
        // Les sets absents seront créés au lancement --apply.
      }
    }
  }

  const existingCards = await fetchAll<DbCard>(
    "cards",
    "id,set_id,source,source_id,local_id,number,name,language,image_small,image_large,dex_ids",
  );
  const cardsBySetNumber = new Map<string, DbCard>();
  const cardsBySourceId = new Map<string, DbCard>();
  for (const c of existingCards) {
    cardsBySourceId.set(`${c.source}|${c.source_id}`, c);
    const set = existingSets.find((s) => s.id === c.set_id);
    if (!set) continue;
    const lang = norm(c.language ?? set.language);
    if (!LANGS.some((l) => l.code === lang)) continue;
    const key = `${lang}|${set.id}|${numberKey(c.number ?? c.local_id)}`;
    if (!cardsBySetNumber.has(key)) cardsBySetNumber.set(key, c);
  }

  const pokemonEntities = await fetchAll<{ id: string; dex_id: number }>("pokemon_entities", "id,dex_id");
  const pokemonByDex = new Map(pokemonEntities.map((p) => [Math.trunc(p.dex_id), p.id]));

  const report = { sets: 0, files: 0, existingMatched: 0, inserted: 0, enriched: 0, relationsInserted: 0, missingPokemon: [] as string[], errors: [] as string[] };

  for (const data of repository) {
    report.sets++;
    let set = setMap.get(`${data.lang}|${norm(data.code)}`);
    if (!set && !APPLY) {
      const pseudo: DbSet = { id: `DRY:${data.lang}:${data.code}`, source: SOURCE, source_id: data.code, name: data.code, language: data.lang, region: LANGS.find((l) => l.code === data.lang)!.region, code: data.code, product_type: "tcg" };
      set = pseudo;
    }
    if (!set) throw new Error(`Set introuvable après préparation : ${data.lang}/${data.code}`);

    for (const { file, card } of data.cards) {
      report.files++;
      const nKey = card.number == null ? "__NO_NUMBER__" : numberKey(card.number);
      const sid = sourceId(data.lang, data.code, file, card);
      const existing =
        (card.number != null ? cardsBySetNumber.get(`${data.lang}|${set.id}|${nKey}`) : undefined)
        ?? cardsBySourceId.get(`${SOURCE}|${sid}`);
      const dex = card.pokedex_number == null ? null : Math.trunc(Number(card.pokedex_number));
      if (dex != null && !pokemonByDex.has(dex)) {
        report.missingPokemon.push(`${data.lang}/${data.code}/${file}: #${dex}`);
        continue;
      }

      const patch = {
        name: card.name ?? null,
        rarity: card.rarity ?? null,
        artist: Array.isArray(card.author) ? card.author.join(", ") : null,
        hp: card.hp ?? null,
        types: card.types ?? null,
        category: category(card),
        image_small: card.img ?? null,
        image_large: card.img ?? null,
        dex_ids: dex == null ? [] : [dex],
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        report.existingMatched++;
        // La carte existe déjà dans Supabase pour ce set/numéro/langue.
        // On ne crée pas de doublon PTCG-database. Les enrichissements
        // seront traités séparément après l'import catalogue.
        continue;
      }

      if (APPLY) {
        const row = {
          set_id: set.id,
          source: SOURCE,
          source_id: sid,
          local_id: card.number != null ? String(card.number) : sid,
          number: card.number != null ? String(card.number) : null,
          name: card.name ?? null,
          language: data.lang,
          rarity: card.rarity ?? null,
          variant_type: null,
          category: category(card),
          hp: card.hp ?? null,
          types: card.types ?? null,
          variants: null,
          regulation_mark: null,
          image_small: card.img ?? null,
          image_large: card.img ?? null,
          dex_ids: dex == null ? [] : [dex],
          updated_at: new Date().toISOString(),
        };
        const { data: inserted, error } = await supabase.from("cards").insert(row).select("id,set_id,source,source_id,local_id,number,name,language,image_small,image_large,dex_ids").single();
        if (error || !inserted) {
          throw new Error(`Insertion ${data.lang}/${data.code}/${file}: ${error?.message ?? "inconnu"}`);
        }
        const db = inserted as DbCard;
        if (card.number != null) {
          cardsBySetNumber.set(`${data.lang}|${set.id}|${nKey}`, db);
        }
        cardsBySourceId.set(`${SOURCE}|${sid}`, db);
        report.inserted++;
        if (dex != null) {
          const { error: relError } = await supabase.from("card_pokemon").insert({ card_id: db.id, pokemon_entity_id: pokemonByDex.get(dex)!, dex_position: 0 });
          if (relError) throw new Error(`Relation ${data.lang}/${data.code}/${file}: ${relError.message}`);
          report.relationsInserted++;
        }
      }
    }
  }

  console.log("\n==============================================");
  console.log(" RAPPORT");
  console.log("==============================================");
  console.log(`Sets parcourus        : ${report.sets}`);
  console.log(`Fichiers cartes       : ${report.files}`);
  console.log(`Cartes déjà présentes : ${report.existingMatched}`);
  console.log(`Cartes insérées       : ${report.inserted}`);
  console.log(`Cartes enrichies      : ${report.enriched}`);
  console.log(`Cartes sans numéro    : ${repository.reduce((n, s) => n + s.cards.filter(x => x.card.number == null).length, 0)}`);
  console.log(`Relations ajoutées    : ${report.relationsInserted}`);
  console.log(`Pokémon manquants     : ${report.missingPokemon.length}`);
  if (report.missingPokemon.length) console.log(report.missingPokemon.slice(0, 30).join("\n"));
  console.log(`\n${APPLY ? "IMPORT RÉEL TERMINÉ" : "DRY-RUN TERMINÉ — aucun changement"}`);
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
