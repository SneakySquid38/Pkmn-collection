import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const SET_SOURCE_ID = "S4";
const SET_LANGUAGE = "JP";
const SOURCE = "ptcg-database";
const EXPECTED_CARD_COUNT = 111;
const PAGE_SIZE = 1000;

type SetRow = {
  id: string;
  source: string;
  source_id: string;
  language: string;
  name: string | null;
};

type CardRow = {
  id: string;
  set_id: string;
  source: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string | null;
  rarity: string | null;
  artist: string | null;
  image_small: string | null;
  image_large: string | null;
  dex_ids: number[] | null;
};

type PokemonRelationRow = {
  card_id: string;
  pokemon_entity_id: string;
  dex_position: number | null;
};

type PokemonRow = {
  id: string;
  dex_id: number;
  name_fr: string | null;
};

async function getAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Erreur lecture ${table}: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

function normalizeNumber(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (/^\d+$/.test(v)) return String(Number(v));
  return v.toUpperCase();
}

function formatList(values: string[], max = 20): string {
  if (values.length === 0) return "aucun";
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} ... (+${values.length - max})`;
}

async function main() {
  console.log("==============================================");
  console.log(" AUDIT PTCG-DATABASE — SET S4");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  // 1. Set cible
  const sets = await getAll<SetRow>(
    "sets",
    "id,source,source_id,language,name"
  );

  const targetSets = sets.filter(
    (set) =>
      set.source_id.toUpperCase() === SET_SOURCE_ID &&
      set.language.toUpperCase() === SET_LANGUAGE
  );

  console.log("SET CIBLE");
  console.log(`  Correspondances : ${targetSets.length}`);

  if (targetSets.length !== 1) {
    throw new Error(
      `Le set ${SET_SOURCE_ID}/${SET_LANGUAGE} doit être unique.`
    );
  }

  const set = targetSets[0];

  console.log(`  id        : ${set.id}`);
  console.log(`  source    : ${set.source}`);
  console.log(`  source_id : ${set.source_id}`);
  console.log(`  language  : ${set.language}`);
  console.log(`  nom       : ${set.name}`);

  // 2. Cartes S4 PTCG-database
  const allCards = await getAll<CardRow>(
    "cards",
    [
      "id",
      "set_id",
      "source",
      "source_id",
      "local_id",
      "number",
      "name",
      "language",
      "rarity",
      "artist",
      "image_small",
      "image_large",
      "dex_ids",
    ].join(",")
  );

  const s4Cards = allCards.filter(
    (card) =>
      card.set_id === set.id &&
      card.source === SOURCE &&
      card.language?.toUpperCase() === SET_LANGUAGE
  );

  console.log("\nCARTES S4 PTCG-DATABASE");
  console.log(`  Total : ${s4Cards.length}`);

  const numbers = s4Cards
    .map((card) => normalizeNumber(card.number ?? card.local_id))
    .filter(Boolean);

  const uniqueNumbers = new Set(numbers);

  const duplicateNumbers = [
    ...new Set(
      numbers.filter((number, index) => numbers.indexOf(number) !== index)
    ),
  ];

  const expectedNumbers = Array.from({ length: EXPECTED_CARD_COUNT }, (_, i) =>
    String(i + 1)
  );

  const missingNumbers = expectedNumbers.filter(
    (number) => !uniqueNumbers.has(number)
  );

  console.log(`  Numéros uniques : ${uniqueNumbers.size}`);
  console.log(`  Doublons        : ${duplicateNumbers.length}`);
  console.log(`  Manquants 001-111 : ${missingNumbers.length}`);

  // 3. Contrôles source
  const wrongLanguage = s4Cards.filter(
    (card) => card.language?.toUpperCase() !== SET_LANGUAGE
  );
  const wrongSource = s4Cards.filter((card) => card.source !== SOURCE);
  const missingSourceId = s4Cards.filter((card) => !card.source_id);
  const missingNumber = s4Cards.filter(
    (card) => !card.number && !card.local_id
  );
  const missingImage = s4Cards.filter(
    (card) => !card.image_large || !card.image_small
  );
  const missingName = s4Cards.filter((card) => !card.name);
  const missingRarity = s4Cards.filter((card) => !card.rarity);

  console.log("\nINTÉGRITÉ DES CARTES");
  console.log(`  Mauvaise source       : ${wrongSource.length}`);
  console.log(`  Mauvaise langue       : ${wrongLanguage.length}`);
  console.log(`  Source ID manquant    : ${missingSourceId.length}`);
  console.log(`  Numéro manquant       : ${missingNumber.length}`);
  console.log(`  Nom manquant          : ${missingName.length}`);
  console.log(`  Image manquante       : ${missingImage.length}`);
  console.log(`  Rareté NULL           : ${missingRarity.length}`);

  if (missingRarity.length) {
    console.log(
      `    Numéros sans rareté : ${formatList(
        missingRarity.map((card) => normalizeNumber(card.number))
      )}`
    );
  }

  // 4. Vérifier les source_id uniques
  const sourceIds = s4Cards.map((card) => card.source_id);
  const duplicateSourceIds = [
    ...new Set(
      sourceIds.filter((sourceId, index) => sourceIds.indexOf(sourceId) !== index)
    ),
  ];

  console.log(`  source_id dupliqués   : ${duplicateSourceIds.length}`);

  // 5. Vérifier les relations card_pokemon
  const cardIds = new Set(s4Cards.map((card) => card.id));

  const allRelations = await getAll<PokemonRelationRow>(
    "card_pokemon",
    "card_id,pokemon_entity_id,dex_position"
  );

  const s4Relations = allRelations.filter((relation) =>
    cardIds.has(relation.card_id)
  );

  const relationCardIds = new Set(s4Relations.map((r) => r.card_id));

  const cardsWithDex = s4Cards.filter(
    (card) => Array.isArray(card.dex_ids) && card.dex_ids.length > 0
  );

  const cardsWithoutDex = s4Cards.filter(
    (card) => !Array.isArray(card.dex_ids) || card.dex_ids.length === 0
  );

  const cardsWithRelation = s4Cards.filter((card) =>
    relationCardIds.has(card.id)
  );

  const cardsMissingRelation = cardsWithDex.filter(
    (card) => !relationCardIds.has(card.id)
  );

  const relationsWithoutCard = s4Relations.filter(
    (relation) => !cardIds.has(relation.card_id)
  );

  const relationKeys = s4Relations.map(
    (relation) => `${relation.card_id}|${relation.pokemon_entity_id}`
  );

  const duplicateRelations = [
    ...new Set(
      relationKeys.filter(
        (key, index) => relationKeys.indexOf(key) !== index
      )
    ),
  ];

  console.log("\nRELATIONS card_pokemon");
  console.log(`  Relations S4           : ${s4Relations.length}`);
  console.log(`  Cartes avec dex_ids    : ${cardsWithDex.length}`);
  console.log(`  Cartes sans dex_ids    : ${cardsWithoutDex.length}`);
  console.log(`  Cartes avec relation   : ${cardsWithRelation.length}`);
  console.log(`  Cartes sans relation   : ${cardsMissingRelation.length}`);
  console.log(`  Relations orphelines   : ${relationsWithoutCard.length}`);
  console.log(`  Doublons de relation   : ${duplicateRelations.length}`);

  // 6. Vérifier les Pokémon référencés
  const pokemonEntities = await getAll<PokemonRow>(
    "pokemon_entities",
    "id,dex_id,name_fr"
  );

  const pokemonById = new Map(
    pokemonEntities.map((pokemon) => [pokemon.id, pokemon])
  );

  const relationPokemonIds = new Set(
    s4Relations.map((relation) => relation.pokemon_entity_id)
  );

  const missingPokemonEntities = s4Relations.filter(
    (relation) => !pokemonById.has(relation.pokemon_entity_id)
  );

  const cardPokemonMismatch: string[] = [];

  for (const card of cardsWithDex) {
    const expectedDex = new Set(card.dex_ids ?? []);
    const actualDex = new Set(
      s4Relations
        .filter((relation) => relation.card_id === card.id)
        .map((relation) => pokemonById.get(relation.pokemon_entity_id)?.dex_id)
        .filter((dex): dex is number => dex != null)
    );

    if (
      expectedDex.size !== actualDex.size ||
      [...expectedDex].some((dex) => !actualDex.has(dex))
    ) {
      cardPokemonMismatch.push(
        `${normalizeNumber(card.number)} (${card.name ?? "?"})`
      );
    }
  }

  console.log("\nCOHÉRENCE POKÉMON");
  console.log(
    `  Entités Pokémon référencées : ${relationPokemonIds.size}`
  );
  console.log(`  Entités introuvables        : ${missingPokemonEntities.length}`);
  console.log(
    `  Cartes dex_ids ≠ relations  : ${cardPokemonMismatch.length}`
  );

  // 7. Vérifier les doublons globaux par source/source_id
  const sourceIdMatches = allCards.filter(
    (card) =>
      card.source === SOURCE &&
      card.source_id &&
      s4Cards.some((s4) => s4.source_id === card.source_id)
  );

  const sourceIdCounts = new Map<string, number>();
  for (const card of sourceIdMatches) {
    sourceIdCounts.set(
      card.source_id,
      (sourceIdCounts.get(card.source_id) ?? 0) + 1
    );
  }

  const globalDuplicateSourceIds = [...sourceIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sourceId]) => sourceId);

  console.log("\nUNICITÉ SOURCE");
  console.log(
    `  source_id PTCG-database S4 dupliqués globalement : ${globalDuplicateSourceIds.length}`
  );

  // 8. Contrôle TCGdex : les cartes TCGdex du même set ne doivent pas avoir été modifiées
  const tcgdexS4 = allCards.filter(
    (card) =>
      card.set_id === set.id &&
      card.source === "tcgdex" &&
      card.language?.toUpperCase() === SET_LANGUAGE
  );

  console.log("\nTCGDEX");
  console.log(`  Cartes TCGdex S4 : ${tcgdexS4.length}`);
  console.log(
    "  Contrôle : l'import PTCG-database ne doit pas modifier ces lignes."
  );

  // 9. Verdict
  const errors =
    targetSets.length !== 1 ||
    s4Cards.length !== EXPECTED_CARD_COUNT ||
    uniqueNumbers.size !== EXPECTED_CARD_COUNT ||
    duplicateNumbers.length !== 0 ||
    missingNumbers.length !== 0 ||
    wrongSource.length !== 0 ||
    wrongLanguage.length !== 0 ||
    missingSourceId.length !== 0 ||
    missingNumber.length !== 0 ||
    missingName.length !== 0 ||
    missingImage.length !== 0 ||
    duplicateSourceIds.length !== 0 ||
    cardsMissingRelation.length !== 0 ||
    relationsWithoutCard.length !== 0 ||
    duplicateRelations.length !== 0 ||
    missingPokemonEntities.length !== 0 ||
    cardPokemonMismatch.length !== 0 ||
    globalDuplicateSourceIds.length !== 0;

  console.log("\n==============================================");
  console.log(errors ? "🔴 AUDIT S4 : ANOMALIES" : "🟢 AUDIT S4 : RÉUSSI");
  console.log("==============================================");
  console.log("Aucune donnée n'a été modifiée.");
}

main().catch((error) => {
  console.error("\n🔴 ERREUR :", error instanceof Error ? error.message : error);
  process.exit(1);
});
