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

const ROOT = path.resolve(process.cwd(), "PTCG-database");
const LANGS = [
  { code: "FR", dir: "data_fr", region: "FR" },
  { code: "JP", dir: "data_jp", region: "JP" },
  { code: "KR", dir: "data_ko", region: "KR" },
  { code: "SC", dir: "data_sc", region: "CN" },
  { code: "TC", dir: "data_tc", region: "CN" },
] as const;

const SOURCE = "ptcg-database";
const PAGE = 1000;
const APPLY = process.argv.includes("--apply");
const FORCE_ENRICH = process.argv.includes("--force-enrich");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type RawCard = Record<string, any> & {
  number?: string | number;
  name?: string;
  img?: string;
  set_name?: string;
  set_total?: string | number;
  set_code?: string;
  card_type?: string;
  pokedex_number?: number | string;
  hp?: number;
  types?: string[];
  rarity?: string;
  author?: string[];
  print_key?: string;
  card_key?: string;
  jp_id?: string | number;
  ko_id?: string | number;
  lang?: string;
  regulation?: string;
  sub_type?: string;
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

type SourceMetadata = {
  cardId: string;
  language: string;
  setCode: string;
  file: string;
  printKey: string | null;
  cardKey: string | null;
  sourceId: string;
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

async function fetchAll<T>(
  table: string,
  columns: string,
  filter?: (q: any) => any,
): Promise<T[]> {
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

function getSetCode(dirName: string, card: RawCard): string {
  return String(card.set_code ?? dirName).trim();
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
  // A valid positive Dex ID is a stronger Pokémon signal than the localized
  // card_type field, which is inconsistent in some historical datasets.
  if (dex != null) return "Pokémon";

  const t = norm(card.card_type);
  if (!t) return null;
  if (/(ENERGY|ENERGIE|에너지|能量|能源|エネルギー)/i.test(t)) return "Énergie";
  if (/(TRAINER|TRAINER CARD|TRAINER'S|トレーナー|트레이너|グッズ|サポート|スタジアム|ポケモンのどうぐ)/i.test(t)) {
    return "Dresseur";
  }
  return "Dresseur";
}

function sourceId(lang: string, setCode: string, file: string, card: RawCard): string {
  // Preserve the historical S4 import convention already present in Supabase.
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
// Repository
// -----------------------------------------------------------------------------

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
        card.number = getCardNumber(card, code);

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

// -----------------------------------------------------------------------------
// Safe set creation / enrichment
// -----------------------------------------------------------------------------

async function ensureSets(
  repository: SetData[],
  existingSets: DbSet[],
  report: any,
): Promise<Map<string, DbSet>> {
  const map = new Map<string, DbSet>();

  for (const set of existingSets) {
    const lang = norm(set.language);
    if (!LANGS.some((l) => l.code === lang)) continue;
    map.set(`${lang}|${norm(set.source_id)}`, set);
  }

  for (const data of repository) {
    const key = `${data.lang}|${norm(data.code)}`;
    if (map.has(key)) continue;

    report.setsMissing++;

    if (!APPLY) continue;

    const first = data.cards[0]?.card;
    const totals = data.cards
      .map((x) => Number(x.card.set_total))
      .filter((n) => Number.isFinite(n) && n > 0);
    const total = totals.length ? Math.max(...totals) : data.cards.length;
    const langInfo = LANGS.find((l) => l.code === data.lang)!;

    const row = {
      source: SOURCE,
      source_id: data.code,
      name: first?.set_full_name ?? first?.set_name ?? data.code,
      series: null,
      language: data.lang,
      region: langInfo.region,
      code: data.code,
      release_date: null,
      total_cards: total,
      logo_url: first?.set_img ?? null,
      symbol_url: null,
      product_type: "tcg",
    };

    const { data: inserted, error } = await supabase
      .from("sets")
      .insert(row)
      .select("id,source,source_id,name,series,language,region,code,release_date,total_cards,logo_url,symbol_url,product_type")
      .single();

    if (error || !inserted) {
      throw new Error(`Création set ${data.lang}/${data.code}: ${error?.message ?? "inconnu"}`);
    }

    const created = inserted as DbSet;
    map.set(key, created);
    report.setsCreated++;
  }

  return map;
}

// -----------------------------------------------------------------------------
// Source metadata
// -----------------------------------------------------------------------------

/**
 * card_sources n'est pas supposée avoir une structure précise ici.
 * On tente de lire ses colonnes existantes et on ne l'utilise que si les
 * colonnes minimales sont effectivement présentes. Ainsi le script ne casse
 * pas si la table a une structure différente ou n'est pas encore finalisée.
 */
async function detectCardSourcesColumns(): Promise<Set<string>> {
  const { data, error } = await supabase.from("card_sources").select("*").limit(1);
  if (error) {
    console.warn(`⚠️ card_sources indisponible : ${error.message}`);
    return new Set();
  }
  if (!data?.length) {
    console.warn("⚠️ card_sources ne contient aucune ligne : métadonnées print_key/card_key non écrites dans cette passe.");
    return new Set();
  }
  return new Set(Object.keys(data[0] as Record<string, unknown>));
}

async function saveSourceMetadata(
  columns: Set<string>,
  meta: SourceMetadata,
): Promise<void> {
  if (!columns.size) return;
  if (!columns.has("card_id")) return;

  const row: Record<string, unknown> = { card_id: meta.cardId };

  // Common schemas supported without assuming one exact project definition.
  if (columns.has("source")) row.source = SOURCE;
  if (columns.has("source_id")) row.source_id = meta.sourceId;
  if (columns.has("print_key")) row.print_key = meta.printKey;
  if (columns.has("card_key")) row.card_key = meta.cardKey;
  if (columns.has("language")) row.language = meta.language;
  if (columns.has("url")) row.url = null;
  if (columns.has("metadata")) {
    row.metadata = {
      language: meta.language,
      set_code: meta.setCode,
      file: meta.file,
      print_key: meta.printKey,
      card_key: meta.cardKey,
      source_id: meta.sourceId,
    };
  }
  if (columns.has("data")) {
    row.data = {
      language: meta.language,
      set_code: meta.setCode,
      file: meta.file,
      print_key: meta.printKey,
      card_key: meta.cardKey,
      source_id: meta.sourceId,
    };
  }

  const { error } = await supabase.from("card_sources").insert(row);
  if (error) {
    // Provenance must never prevent the catalogue import. The error is surfaced
    // by the caller/report, but the card itself remains valid.
    throw new Error(`card_sources: ${error.message}`);
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  console.log("==============================================");
  console.log(" PTCG-DATABASE V6 — IMPORT + ENRICHISSEMENT");
  console.log("==============================================");
  console.log(`MODE : ${APPLY ? "IMPORT RÉEL" : "DRY-RUN"}`);
  console.log(`Enrichissement forcé : ${FORCE_ENRICH ? "OUI" : "NON"}`);
  console.log(`Langues : FR / JP / KR / SC / TC`);
  console.log(`Dépôt : ${ROOT}\n`);

  const repository = readRepository();

  const existingSets = await fetchAll<DbSet>(
    "sets",
    "id,source,source_id,name,series,language,region,code,release_date,total_cards,logo_url,symbol_url,product_type",
  );

  const report = {
    sets: repository.length,
    setsMissing: 0,
    setsCreated: 0,
    files: 0,
    existingMatched: 0,
    inserted: 0,
    enriched: 0,
    fieldsEnriched: 0,
    relationsInserted: 0,
    relationsAlreadyPresent: 0,
    sourceMetadataWritten: 0,
    sourceMetadataSkipped: 0,
    missingPokemon: [] as string[],
    invalidDex: [] as string[],
    noNumber: 0,
    conflicts: [] as string[],
    errors: [] as string[],
  };

  const setMap = await ensureSets(repository, existingSets, report);

  // In dry-run, create pseudo-sets for matching calculations only.
  for (const data of repository) {
    const key = `${data.lang}|${norm(data.code)}`;
    if (!setMap.has(key)) {
      setMap.set(key, {
        id: `DRY:${data.lang}:${data.code}`,
        source: SOURCE,
        source_id: data.code,
        name: data.cards[0]?.card.set_full_name ?? data.cards[0]?.card.set_name ?? data.code,
        series: null,
        language: data.lang,
        region: LANGS.find((l) => l.code === data.lang)!.region,
        code: data.code,
        release_date: null,
        total_cards: null,
        logo_url: null,
        symbol_url: null,
        product_type: "tcg",
      });
    }
  }

  const existingCards = await fetchAll<DbCard>(
    "cards",
    "id,set_id,source,source_id,local_id,number,name,language,rarity,category,hp,types,artist,image_small,image_large,dex_ids,variants,regulation_mark",
  );

  const cardsBySetNumber = new Map<string, DbCard>();
  const cardsBySourceId = new Map<string, DbCard>();

  const existingSetById = new Map(existingSets.map((s) => [s.id, s]));

  for (const card of existingCards) {
    cardsBySourceId.set(`${card.source}|${card.source_id}`, card);
    const set = existingSetById.get(card.set_id);
    if (!set) continue;
    const lang = norm(card.language ?? set.language);
    if (!LANGS.some((l) => l.code === lang)) continue;
    if (card.number != null || card.local_id != null) {
      const key = `${lang}|${set.id}|${numberKey(card.number ?? card.local_id)}`;
      if (!cardsBySetNumber.has(key)) cardsBySetNumber.set(key, card);
    }
  }

  const pokemonEntities = await fetchAll<{ id: string; dex_id: number }>(
    "pokemon_entities",
    "id,dex_id",
  );
  const pokemonByDex = new Map(pokemonEntities.map((p) => [Math.trunc(p.dex_id), p.id]));

  // We intentionally detect the table only in real mode. Dry-run never writes.
  const cardSourceColumns = APPLY ? await detectCardSourcesColumns() : new Set<string>();

  for (const data of repository) {
    const set = setMap.get(`${data.lang}|${norm(data.code)}`)!;

    for (const { file, card } of data.cards) {
      report.files++;

      const sid = sourceId(data.lang, data.code, file, card);
      const number = card.number == null ? null : String(card.number);
      if (number == null) report.noNumber++;

      const dex = parseDex(card, `${data.lang}/${data.code}/${file}`, report.invalidDex);
      if (dex != null && !pokemonByDex.has(dex)) {
        report.missingPokemon.push(`${data.lang}/${data.code}/${file}: #${dex}`);
        continue;
      }

      const existing =
        (number != null && !set.id.startsWith("DRY:")
          ? cardsBySetNumber.get(`${data.lang}|${set.id}|${numberKey(number)}`)
          : undefined)
        ?? cardsBySourceId.get(`${SOURCE}|${sid}`);

      const img = imageUrl(card);
      const nextDex = dex == null ? null : [dex];
      const nextCategory = category(card, dex);
      const nextArtist = Array.isArray(card.author) && card.author.length
        ? card.author.join(", ")
        : null;

      if (!existing) {
        if (!APPLY) continue;

        const row = {
          set_id: set.id,
          source: SOURCE,
          source_id: sid,
          local_id: number ?? sid,
          number,
          name: card.name ?? null,
          language: data.lang,
          rarity: card.rarity ?? null,
          variant_type: null,
          category: nextCategory,
          hp: card.hp ?? null,
          types: card.types ?? null,
          variants: null,
          regulation_mark: card.regulation ?? null,
          image_small: img,
          image_large: img,
          dex_ids: nextDex ?? [],
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error } = await supabase
          .from("cards")
          .insert(row)
          .select("id,set_id,source,source_id,local_id,number,name,language,rarity,category,hp,types,artist,image_small,image_large,dex_ids,variants,regulation_mark")
          .single();

        if (error || !inserted) {
          report.errors.push(`${data.lang}/${data.code}/${file}: insertion carte: ${error?.message ?? "inconnu"}`);
          continue;
        }

        const db = inserted as DbCard;
        report.inserted++;
        cardsBySourceId.set(`${SOURCE}|${sid}`, db);
        if (number != null) cardsBySetNumber.set(`${data.lang}|${set.id}|${numberKey(number)}`, db);

        if (dex != null) {
          const pokemonId = pokemonByDex.get(dex)!;
          const { error: relError } = await supabase
            .from("card_pokemon")
            .upsert(
              { card_id: db.id, pokemon_entity_id: pokemonId, dex_position: 0 },
              { onConflict: "card_id,pokemon_entity_id", ignoreDuplicates: true },
            );
          if (relError) {
            report.errors.push(`${data.lang}/${data.code}/${file}: card_pokemon: ${relError.message}`);
          } else {
            report.relationsInserted++;
          }
        }

        if (cardSourceColumns.size) {
          try {
            await saveSourceMetadata(cardSourceColumns, {
              cardId: db.id,
              language: data.lang,
              setCode: data.code,
              file,
              printKey: card.print_key ?? null,
              cardKey: card.card_key ?? null,
              sourceId: sid,
            });
            report.sourceMetadataWritten++;
          } catch (error) {
            report.sourceMetadataSkipped++;
            report.errors.push(`${data.lang}/${data.code}/${file}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        continue;
      }

      report.existingMatched++;

      // -----------------------------------------------------------------------
      // Safe enrichment: only fill empty fields, unless --force-enrich is used.
      // Conflicting non-empty values are never silently replaced.
      // -----------------------------------------------------------------------
      const patch: Record<string, unknown> = {};
      const conflicts: string[] = [];

      const maybePatch = (field: keyof DbCard, incoming: unknown) => {
        const current = existing[field];
        if (!nonEmpty(current) && nonEmpty(incoming)) {
          patch[field] = incoming;
          return;
        }
        if (FORCE_ENRICH && nonEmpty(current) && nonEmpty(incoming) && JSON.stringify(current) !== JSON.stringify(incoming)) {
          // Even in force mode we do not overwrite: record the conflict instead.
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

      if (conflicts.length) {
        report.conflicts.push(`${data.lang}/${data.code}/${file}: ${conflicts.join(", ")}`);
      }

      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        report.enriched++;
        report.fieldsEnriched += Object.keys(patch).length - 1;

        if (APPLY) {
          const { error } = await supabase.from("cards").update(patch).eq("id", existing.id);
          if (error) {
            report.errors.push(`${data.lang}/${data.code}/${file}: enrichissement: ${error.message}`);
            continue;
          }

          Object.assign(existing, patch);
        }
      }

      // Ensure the canonical card_pokemon relation exists when the source gives
      // a valid Dex ID. Existing relationships are not duplicated.
      if (dex != null) {
        const pokemonId = pokemonByDex.get(dex)!;
        const { data: relationRows, error: relationReadError } = await supabase
          .from("card_pokemon")
          .select("card_id,pokemon_entity_id")
          .eq("card_id", existing.id)
          .eq("pokemon_entity_id", pokemonId)
          .limit(1);

        if (relationReadError) {
          report.errors.push(`${data.lang}/${data.code}/${file}: lecture card_pokemon: ${relationReadError.message}`);
        } else if (!relationRows?.length) {
          report.relationsInserted++;
          if (APPLY) {
            const { error: relError } = await supabase.from("card_pokemon").insert({
              card_id: existing.id,
              pokemon_entity_id: pokemonId,
              dex_position: 0,
            });
            if (relError) {
              report.errors.push(`${data.lang}/${data.code}/${file}: relation card_pokemon: ${relError.message}`);
            }
          }
        } else {
          report.relationsAlreadyPresent++;
        }
      }

      if (cardSourceColumns.size) {
        // Only add provenance if print_key/card_key exists; otherwise there is
        // nothing useful to persist in card_sources in this pass.
        if (card.print_key || card.card_key) {
          if (APPLY) {
            try {
              await saveSourceMetadata(cardSourceColumns, {
                cardId: existing.id,
                language: data.lang,
                setCode: data.code,
                file,
                printKey: card.print_key ?? null,
                cardKey: card.card_key ?? null,
                sourceId: sid,
              });
              report.sourceMetadataWritten++;
            } catch (error) {
              report.sourceMetadataSkipped++;
              report.errors.push(`${data.lang}/${data.code}/${file}: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            report.sourceMetadataWritten++;
          }
        }
      } else if (card.print_key || card.card_key) {
        report.sourceMetadataSkipped++;
      }
    }
  }

  console.log("\n==============================================");
  console.log(" RAPPORT V6");
  console.log("==============================================");
  console.log(`Sets parcourus          : ${report.sets}`);
  console.log(`Sets absents            : ${report.setsMissing}`);
  console.log(`Sets créés              : ${report.setsCreated}`);
  console.log(`Fichiers cartes         : ${report.files}`);
  console.log(`Cartes déjà présentes   : ${report.existingMatched}`);
  console.log(`Cartes insérées         : ${report.inserted}`);
  console.log(`Cartes enrichies        : ${report.enriched}`);
  console.log(`Champs enrichis         : ${report.fieldsEnriched}`);
  console.log(`Cartes sans numéro      : ${report.noNumber}`);
  console.log(`Relations ajoutées      : ${report.relationsInserted}`);
  console.log(`Relations déjà présentes: ${report.relationsAlreadyPresent}`);
  console.log(`Métadonnées source écrites : ${report.sourceMetadataWritten}`);
  console.log(`Métadonnées source ignorées : ${report.sourceMetadataSkipped}`);
  console.log(`Pokémon manquants       : ${report.missingPokemon.length}`);
  console.log(`dex_ids invalides       : ${report.invalidDex.length}`);
  console.log(`Conflits non écrasés    : ${report.conflicts.length}`);
  console.log(`Erreurs                 : ${report.errors.length}`);

  if (report.invalidDex.length) {
    console.log("\nDEX INVALIDES :");
    console.log(report.invalidDex.slice(0, 50).join("\n"));
  }

  if (report.conflicts.length) {
    console.log("\nCONFLITS NON ÉCRASÉS :");
    console.log(report.conflicts.slice(0, 50).join("\n"));
  }

  if (report.errors.length) {
    console.log("\nERREURS :");
    console.log(report.errors.slice(0, 50).join("\n"));
  }

  console.log("\n==============================================");
  console.log(APPLY ? " IMPORT + ENRICHISSEMENT TERMINÉ" : " DRY-RUN TERMINÉ — aucun changement");
  console.log("==============================================");
}

main().catch((error) => {
  console.error(`\n❌ ERREUR FATALE : ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
