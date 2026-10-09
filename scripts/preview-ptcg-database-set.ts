import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type PtcgCard = {
  jp_id: number;
  url?: string;
  name?: string;
  img?: string;
  card_type?: string;
  set_name?: string;
  set_img?: string;
  number?: string;
  set_total?: string;
  rarity?: string;
  rarity_img?: string;
  author?: string[];
  pokedex_number?: number;
  hp?: number;
  types?: string[];
  stage?: string;
  print_key?: string;
};

const SOURCE = "ptcg-database";
const LANGUAGE = "JP";
const SET_SOURCE_ID = "S4";
const DATA_DIR = path.resolve(
  process.cwd(),
  "PTCG-database",
  "data_jp",
  SET_SOURCE_ID,
);

const PAGE_SIZE = 1000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement absente : ${name}`);
  return value;
}

const supabase = createClient(
  getEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

async function fetchAll<T>(
  table: string,
  columns: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }

    const { data, error } = await query;

    if (error) throw new Error(`${table}: ${error.message}`);

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function readPtcgCards(): PtcgCard[] {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Dossier introuvable : ${DATA_DIR}`);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith(".json"));

  const cards: PtcgCard[] = [];

  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);

    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const card = JSON.parse(raw) as PtcgCard;
      cards.push(card);
    } catch (error) {
      throw new Error(
        `Impossible de lire ${file}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return cards;
}

function numericNumber(value: string | undefined): number | null {
  if (!value) return null;

  const match = value.match(/^(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function main() {
  console.log("==============================================");
  console.log(" PREVIEW PTCG-DATABASE — SET S4");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  // ------------------------------------------------------------
  // 1. Lecture locale de PTCG-database
  // ------------------------------------------------------------

  const cards = readPtcgCards();

  console.log(`Dossier source : ${DATA_DIR}`);
  console.log(`Fichiers JSON  : ${cards.length}\n`);

  // ------------------------------------------------------------
  // 2. Validation de base
  // ------------------------------------------------------------

  const invalidCards = cards.filter(
    (card) =>
      !card.jp_id ||
      !card.number ||
      !card.print_key ||
      card.set_name !== SET_SOURCE_ID,
  );

  const numbers = cards.map((card) => card.number!);
  const uniqueNumbers = new Set(numbers);

  const duplicateNumbers = [
    ...new Set(
      numbers.filter((number, index) => numbers.indexOf(number) !== index),
    ),
  ];

  const expectedNumbers = Array.from({ length: 111 }, (_, index) =>
    String(index + 1).padStart(3, "0"),
  );

  const missingNumbers = expectedNumbers.filter(
    (number) => !uniqueNumbers.has(number),
  );

  console.log("VALIDATION PTCG-DATABASE");
  console.log(`  Cartes valides          : ${cards.length - invalidCards.length}`);
  console.log(`  Cartes invalides        : ${invalidCards.length}`);
  console.log(`  Numéros uniques         : ${uniqueNumbers.size}`);
  console.log(`  Doublons de numéro      : ${duplicateNumbers.length}`);
  console.log(`  Numéros manquants 001-111 : ${missingNumbers.length}`);
  console.log(
    `  Avec pokedex_number     : ${
      cards.filter((card) => card.pokedex_number != null).length
    }`,
  );
  console.log(
    `  Sans rarity             : ${
      cards.filter((card) => !card.rarity).length
    }`,
  );

  if (invalidCards.length) {
    console.log("\nCartes invalides :");
    for (const card of invalidCards) {
      console.log(
        `  - jp_id=${card.jp_id} number=${card.number ?? "NULL"} print_key=${
          card.print_key ?? "NULL"
        } set_name=${card.set_name ?? "NULL"}`,
      );
    }
  }

  if (duplicateNumbers.length) {
    console.log("\nDoublons :");
    console.log(`  ${duplicateNumbers.join(", ")}`);
  }

  if (missingNumbers.length) {
    console.log("\nNuméros manquants :");
    console.log(`  ${missingNumbers.join(", ")}`);
  }

  // ------------------------------------------------------------
  // 3. Recherche du set dans Supabase
  // ------------------------------------------------------------

  console.log("\n==============================================");
  console.log(" SET SUPABASE");
  console.log("==============================================");

  const sets = await fetchAll<{
    id: string;
    source: string;
    source_id: string;
    name: string | null;
    language: string | null;
    code: string | null;
  }>("sets", "id,source,source_id,name,language,code", {
    source: "tcgdex",
  });

  const matchingSets = sets.filter(
    (set) =>
      set.source_id?.toUpperCase() === SET_SOURCE_ID &&
      set.language?.toUpperCase() === LANGUAGE,
  );

  console.log(`Sets TCGdex/JP correspondants : ${matchingSets.length}`);

  for (const set of matchingSets) {
    console.log(`  id        : ${set.id}`);
    console.log(`  source_id : ${set.source_id}`);
    console.log(`  nom       : ${set.name}`);
    console.log(`  language  : ${set.language}`);
    console.log(`  code      : ${set.code ?? "NULL"}`);
  }

  if (matchingSets.length !== 1) {
    throw new Error(
      `Le set ${SET_SOURCE_ID}/JP devrait correspondre à exactement 1 ligne dans sets.`,
    );
  }

  const set = matchingSets[0];

  // ------------------------------------------------------------
  // 4. Cartes déjà présentes pour ce set
  // ------------------------------------------------------------

  console.log("\n==============================================");
  console.log(" CARTES EXISTANTES");
  console.log("==============================================");

  const existingCards = await fetchAll<{
    id: string;
    set_id: string;
    source: string;
    source_id: string;
    local_id: string | null;
    number: string | null;
    name: string | null;
    language: string | null;
  }>("cards", "id,set_id,source,source_id,local_id,number,name,language");

  const existingForSet = existingCards.filter(
    (card) =>
      card.set_id === set.id &&
      card.language?.toUpperCase() === LANGUAGE,
  );

  const existingByNumber = new Map<string, typeof existingForSet>();

  for (const card of existingForSet) {
    const number = card.number ?? card.local_id ?? "";
    const list = existingByNumber.get(number) ?? [];
    list.push(card);
    existingByNumber.set(number, list);
  }

  console.log(`Cartes déjà liées au set S4 : ${existingForSet.length}`);

  const existingTcgdex = existingForSet.filter(
    (card) => card.source === "tcgdex",
  );

  const existingPtcgDatabase = existingForSet.filter(
    (card) => card.source === SOURCE,
  );

  console.log(`  TCGdex          : ${existingTcgdex.length}`);
  console.log(`  PTCG-database   : ${existingPtcgDatabase.length}`);

  // ------------------------------------------------------------
  // 5. Comparaison par numéro
  // ------------------------------------------------------------

  const newCards = cards.filter((card) => {
    const number = card.number ?? "";
    return !existingByNumber.has(number);
  });

  const sameNumber = cards.filter((card) => {
    const number = card.number ?? "";
    return existingByNumber.has(number);
  });

  console.log("\n==============================================");
  console.log(" COMPARAISON");
  console.log("==============================================");
  console.log(`Cartes PTCG-database : ${cards.length}`);
  console.log(`Numéros déjà présents : ${sameNumber.length}`);
  console.log(`Numéros nouveaux      : ${newCards.length}`);

  if (sameNumber.length) {
    console.log("\nNuméros déjà présents :");
    for (const card of sameNumber) {
      const existing = existingByNumber.get(card.number!) ?? [];
      console.log(
        `  ${card.number} | ${card.name ?? "?"} | déjà présent : ${existing
          .map((item) => `${item.source}/${item.source_id}`)
          .join(", ")}`,
      );
    }
  }

  if (newCards.length) {
    console.log("\nCartes qui seraient ajoutées :");
    for (const card of newCards) {
      console.log(
        `  ${card.number} | ${card.name ?? "?"} | rarity=${
          card.rarity ?? "NULL"
        } | pokedex=${card.pokedex_number ?? "NULL"} | jp_id=${card.jp_id}`,
      );
    }
  }

  // ------------------------------------------------------------
  // 6. Relations Pokémon prévues
  // ------------------------------------------------------------

  const pokemonNumbers = [
    ...new Set(
      newCards
        .map((card) => card.pokedex_number)
        .filter((value): value is number => value != null),
    ),
  ];

  const pokemonEntities = await fetchAll<{
    id: string;
    dex_id: number;
    name_fr: string | null;
  }>("pokemon_entities", "id,dex_id,name_fr");

  const pokemonByDex = new Map(
    pokemonEntities.map((pokemon) => [pokemon.dex_id, pokemon]),
  );

  const missingPokemonEntities = pokemonNumbers.filter(
    (dexId) => !pokemonByDex.has(dexId),
  );

  console.log("\n==============================================");
  console.log(" RELATIONS POKÉMON");
  console.log("==============================================");

  console.log(`Nouvelles cartes avec Pokédex : ${pokemonNumbers.length}`);
  console.log(
    `Pokémon trouvés dans pokemon_entities : ${
      pokemonNumbers.length - missingPokemonEntities.length
    }`,
  );
  console.log(
    `Pokémon absents de pokemon_entities : ${missingPokemonEntities.length}`,
  );

  if (missingPokemonEntities.length) {
    console.log(
      `  Dex IDs absents : ${missingPokemonEntities.join(", ")}`,
    );
  }

  // ------------------------------------------------------------
  // 7. Résumé
  // ------------------------------------------------------------

  console.log("\n==============================================");
  console.log(" RÉSUMÉ DU DRY-RUN");
  console.log("==============================================");

  console.log(`Source                 : ${SOURCE}`);
  console.log(`Langue                 : ${LANGUAGE}`);
  console.log(`Set                    : ${SET_SOURCE_ID}`);
  console.log(`Fichiers source        : ${cards.length}`);
  console.log(`Cartes valides         : ${cards.length - invalidCards.length}`);
  console.log(`Cartes déjà présentes  : ${sameNumber.length}`);
  console.log(`Nouvelles cartes       : ${newCards.length}`);
  console.log(`Relations Pokémon      : ${pokemonNumbers.length}`);
  console.log(
    `Relations sans entité : ${missingPokemonEntities.length}`,
  );

  console.log("\n⚠️ AUCUNE MODIFICATION SUPABASE.");
  console.log("Ce script est strictement en lecture seule.");
  console.log("==============================================");
}

main().catch((error) => {
  console.error("\n❌ ERREUR");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
