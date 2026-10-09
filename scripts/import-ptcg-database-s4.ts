import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const SOURCE = "ptcg-database";
const LANGUAGE = "JP";
const SET_SOURCE_ID = "S4";
const DATA_DIR = path.resolve(
  process.cwd(),
  "PTCG-database",
  "data_jp",
  SET_SOURCE_ID,
);
const BATCH_SIZE = 50;
const PAGE_SIZE = 1000;

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

type DbSet = {
  id: string;
  source: string;
  source_id: string;
  name: string | null;
  language: string | null;
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
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement absente : ${name}`);
  return value;
}

const supabase = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
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

function readCards(): PtcgCard[] {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Dossier introuvable : ${DATA_DIR}`);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const fullPath = path.join(DATA_DIR, file);
    const card = JSON.parse(fs.readFileSync(fullPath, "utf8")) as PtcgCard;

    if (!card.jp_id || !card.number || !card.print_key) {
      throw new Error(`Carte invalide : ${file}`);
    }

    if (card.set_name !== SET_SOURCE_ID) {
      throw new Error(
        `${file}: set_name=${card.set_name ?? "NULL"}, attendu ${SET_SOURCE_ID}`,
      );
    }

    return card;
  });
}

function normalizeNumber(number: string): string {
  return number.trim().replace(/^0+/, "") || "0";
}

function inferCategory(card: PtcgCard): string | null {
  // PTCG-database n'est pas suffisamment fiable pour utiliser
  // card_type comme catégorie : certaines cartes Dresseur ont dans
  // ce champ le texte de leur effet. On n'importe donc pas une
  // catégorie déduite de card_type.
  //
  // Pour les Pokémon, pokedex_number est une indication robuste.
  if (card.pokedex_number != null) return "Pokémon";

  return null;
}

async function findTargetSet(): Promise<DbSet> {
  const sets = await fetchAll<DbSet>(
    "sets",
    "id,source,source_id,name,language,product_type",
  );

  const matches = sets.filter(
    (set) =>
      set.source === "tcgdex" &&
      set.source_id.toUpperCase() === SET_SOURCE_ID &&
      set.language?.toUpperCase() === LANGUAGE &&
      set.product_type === "tcg",
  );

  if (matches.length !== 1) {
    throw new Error(
      `Set cible introuvable ou ambigu : ${SET_SOURCE_ID}/JP (${matches.length} résultat(s)).`,
    );
  }

  return matches[0];
}

async function assertNoSourceCollision(cards: PtcgCard[]) {
  const sourceIds = cards.map((card) => String(card.jp_id));
  const existing: DbCard[] = [];

  for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
    const batch = sourceIds.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from("cards")
      .select("id,set_id,source,source_id,local_id,number,name")
      .eq("source", SOURCE)
      .in("source_id", batch);

    if (error) throw new Error(`Vérification collisions : ${error.message}`);
    existing.push(...((data ?? []) as DbCard[]));
  }

  if (existing.length > 0) {
    const details = existing
      .map(
        (card) =>
          `${card.source_id} → set_id=${card.set_id}, number=${card.number ?? "NULL"}`,
      )
      .join("\n  ");

    throw new Error(
      `IMPORT ABORTÉ : ${existing.length} carte(s) avec source=${SOURCE} existent déjà.\n  ${details}`,
    );
  }
}

async function insertCards(
  cards: PtcgCard[],
  setId: string,
): Promise<string[]> {
  const insertedIds: string[] = [];

  const rows = cards.map((card) => ({
    set_id: setId,
    source: SOURCE,
    source_id: String(card.jp_id),
    local_id: card.number!,
    number: card.number!,
    name: card.name ?? null,
    language: LANGUAGE,

    // Ne pas déduire abusivement les Dresseur/Énergie depuis card_type.
    category: inferCategory(card),
    hp: card.hp ?? null,
    types: card.types ?? null,
    rarity: card.rarity ?? null,
    artist: Array.isArray(card.author) ? card.author.join(", ") : null,
    variants: null,
    regulation_mark: null,

    // La source ne fournit qu'une image publique par carte.
    // On conserve la même URL dans les deux colonnes plutôt
    // que d'inventer une URL "small".
    image_small: card.img ?? null,
    image_large: card.img ?? null,

    // Cohérent avec le modèle actuel utilisé par les scripts JP.
    dex_ids:
      card.pokedex_number != null ? [card.pokedex_number] : [],
    updated_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from("cards")
      .insert(batch)
      .select("id");

    if (error) {
      // Nettoyage des cartes déjà insérées par CE run.
      if (insertedIds.length > 0) {
        await cleanupCards(insertedIds);
      }

      throw new Error(`Insertion cards échouée : ${error.message}`);
    }

    insertedIds.push(...((data ?? []) as { id: string }[]).map((row) => row.id));

    console.log(
      `  Cartes insérées : ${Math.min(i + batch.length, rows.length)}/${rows.length}`,
    );
  }

  return insertedIds;
}

async function cleanupCards(cardIds: string[]) {
  for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
    const batch = cardIds.slice(i, i + BATCH_SIZE);

    const { error: relationError } = await supabase
      .from("card_pokemon")
      .delete()
      .in("card_id", batch);

    if (relationError) {
      console.error(
        `⚠️ Nettoyage card_pokemon échoué : ${relationError.message}`,
      );
    }

    const { error } = await supabase
      .from("cards")
      .delete()
      .in("id", batch);

    if (error) {
      console.error(`⚠️ Nettoyage cards échoué : ${error.message}`);
    }
  }
}

async function fetchPokemonMap(): Promise<Map<number, string>> {
  const entities = await fetchAll<{
    id: string;
    dex_id: number;
  }>("pokemon_entities", "id,dex_id");

  return new Map(entities.map((entity) => [entity.dex_id, entity.id]));
}

async function insertPokemonRelations(
  cards: PtcgCard[],
  cardIds: string[],
  pokemonByDex: Map<number, string>,
): Promise<number> {
  const relations: {
    card_id: string;
    pokemon_entity_id: string;
    dex_position: number;
  }[] = [];

  for (let i = 0; i < cards.length; i++) {
    const dexId = cards[i].pokedex_number;

    if (dexId == null) continue;

    const entityId = pokemonByDex.get(Math.trunc(dexId));

    if (!entityId) {
      throw new Error(
        `Pokémon #${dexId} absent de pokemon_entities pour ${cards[i].print_key}.`,
      );
    }

    relations.push({
      card_id: cardIds[i],
      pokemon_entity_id: entityId,
      dex_position: 0,
    });
  }

  // Une carte PTCG-database porte actuellement un seul pokedex_number.
  // On déduplique par sécurité selon la contrainte SQL.
  const unique = [
    ...new Map(
      relations.map((relation) => [
        `${relation.card_id}:${relation.pokemon_entity_id}`,
        relation,
      ]),
    ).values(),
  ];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("card_pokemon").insert(batch);

    if (error) {
      throw new Error(`Insertion card_pokemon échouée : ${error.message}`);
    }

    console.log(
      `  Relations Pokémon insérées : ${Math.min(
        i + batch.length,
        unique.length,
      )}/${unique.length}`,
    );
  }

  return unique.length;
}

async function main() {
  console.log("==============================================");
  console.log(" IMPORT PTCG-DATABASE — SET S4");
  console.log("==============================================");
  console.log("MODE : IMPORT RÉEL");
  console.log("Source : ptcg-database");
  console.log("Langue : JP");
  console.log("Set    : S4");
  console.log("");

  const cards = readCards();

  if (cards.length !== 111) {
    throw new Error(
      `Sécurité : ${cards.length} cartes trouvées, 111 attendues pour S4.`,
    );
  }

  const numbers = cards.map((card) => card.number!);
  if (new Set(numbers).size !== 111) {
    throw new Error("Sécurité : les 111 numéros S4 ne sont pas uniques.");
  }

  console.log(`Fichiers PTCG-database validés : ${cards.length}`);

  const set = await findTargetSet();

  console.log("");
  console.log("SET CIBLE");
  console.log(`  id        : ${set.id}`);
  console.log(`  source    : ${set.source}`);
  console.log(`  source_id : ${set.source_id}`);
  console.log(`  language  : ${set.language}`);
  console.log(`  name      : ${set.name}`);

  await assertNoSourceCollision(cards);

  const pokemonByDex = await fetchPokemonMap();

  const missingDex = [
    ...new Set(
      cards
        .map((card) => card.pokedex_number)
        .filter((dex): dex is number => dex != null)
        .map((dex) => Math.trunc(dex))
        .filter((dex) => !pokemonByDex.has(dex)),
    ),
  ];

  if (missingDex.length > 0) {
    throw new Error(
      `IMPORT ABORTÉ : Pokémon absents de pokemon_entities : ${missingDex.join(", ")}`,
    );
  }

  console.log("");
  console.log("PRÉ-CHECKS");
  console.log("  Collision source_id : 0");
  console.log(
    `  Pokémon nécessaires : ${
      new Set(
        cards
          .map((card) => card.pokedex_number)
          .filter((dex): dex is number => dex != null)
          .map((dex) => Math.trunc(dex)),
      ).size
    }`,
  );
  console.log("  Pokémon manquants   : 0");

  console.log("");
  console.log("INSERTION DES CARTES");

  let insertedCardIds: string[] = [];

  try {
    insertedCardIds = await insertCards(cards, set.id);

    const relationCount = await insertPokemonRelations(
      cards,
      insertedCardIds,
      pokemonByDex,
    );

    console.log("");
    console.log("==============================================");
    console.log(" IMPORT TERMINÉ");
    console.log("==============================================");
    console.log(`Cartes insérées       : ${insertedCardIds.length}`);
    console.log(`Relations Pokémon     : ${relationCount}`);
    console.log(`Set                   : ${SET_SOURCE_ID}`);
    console.log(`Source                : ${SOURCE}`);
    console.log("");
    console.log("Les données TCGdex n'ont pas été modifiées.");
  } catch (error) {
    console.error("");
    console.error("❌ ERREUR PENDANT L'IMPORT");

    if (insertedCardIds.length > 0) {
      console.error("Nettoyage des cartes insérées par ce run...");
      await cleanupCards(insertedCardIds);
      console.error("Nettoyage terminé.");
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
