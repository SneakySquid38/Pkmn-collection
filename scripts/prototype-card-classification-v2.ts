import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
dotenv.config({ path: ENV_PATH });
const REPO = path.join(ROOT, "PTCG-database");
const OUTPUT = path.join(ROOT, "prototype-card-classification-v2.json");

const LANGUAGES = ["FR", "JP", "KO", "SC", "TC"] as const;
type Language = (typeof LANGUAGES)[number];

const LANGUAGE_GROUP: Record<Language, "WESTERN" | "ASIAN"> = {
  FR: "WESTERN",
  JP: "ASIAN",
  KO: "ASIAN",
  SC: "ASIAN",
  TC: "ASIAN",
};

const TEST_POKEMON = [
  { name: "Pikachu", dexId: 25 },
  { name: "Dracaufeu", dexId: 6 },
  { name: "Mew", dexId: 151 },
  { name: "Rayquaza", dexId: 384 },
  { name: "Évoli", dexId: 133 },
  { name: "Lugia", dexId: 249 },
  { name: "Latios", dexId: 381 },
  { name: "Latias", dexId: 380 },
  { name: "Tarsal", dexId: 280 },
  { name: "Alakazam", dexId: 65 },
];

type CardRow = {
  id: string;
  set_id: string | null;
  source: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string;
  rarity: string | null;
  category: string | null;
  image_small: string | null;
  image_large: string | null;
  dex_ids: unknown;
};

type SetRow = {
  id: string;
  source: string;
  source_id: string;
  name: string | null;
  language: string;
  code: string | null;
};

type PokemonRow = {
  id: string;
  dex_id: number;
  name_fr: string;
};

type CardPokemonRow = {
  card_id: string;
  pokemon_entity_id: string;
  dex_position: number | null;
};

type ClassifiedCard = {
  cardId: string;
  source: string;
  sourceId: string;
  language: Language;
  languageGroup: "WESTERN" | "ASIAN";
  set: {
    id: string | null;
    sourceId: string | null;
    name: string | null;
    code: string | null;
  };
  number: string | null;
  nameOriginal: string | null;
  image: {
    small: string | null;
    large: string | null;
  };
  pokemon: Array<{
    dexId: number;
    nameFr: string;
    position: number | null;
  }>;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(
      `.env.local introuvable à cet emplacement : ${ENV_PATH}`
    );
  }

  if (!url || !key) {
    const missing = [
      !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !key ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter(Boolean).join(", ");

    throw new Error(
      `Variables Supabase manquantes dans ${ENV_PATH} : ${missing}. ` +
      "Vérifie les noms des variables, sans afficher leurs valeurs."
    );
  }

  return createClient(url, key);
}

async function fetchAll<T>(
  supabase: ReturnType<typeof getSupabase>,
  table: string,
  columns: string
): Promise<T[]> {
  const pageSize = 1000;
  const result: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Erreur ${table} [${from}-${from + pageSize - 1}]: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    result.push(...(data as T[]));

    if (data.length < pageSize) break;
  }

  return result;
}

function normalizeLanguage(value: string): Language | null {
  const v = value.toUpperCase();
  return (LANGUAGES as readonly string[]).includes(v) ? (v as Language) : null;
}

function normalizeDexIds(value: unknown): number[] {
  if (value == null) return [];

  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((x) => x.trim())
      : [];

  const result: number[] = [];

  for (const item of raw) {
    const n = Number(String(item).trim());
    if (Number.isFinite(n)) {
      // 384.1 and similar variants are normalized to the National Dex integer.
      result.push(Math.trunc(n));
    }
  }

  return [...new Set(result)];
}

function countBy<T extends string | number>(values: T[]) {
  const out: Record<string, number> = {};
  for (const value of values) {
    const key = String(value);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function increment(
  target: Record<string, number>,
  key: string,
  amount = 1
) {
  target[key] = (target[key] ?? 0) + amount;
}

async function main() {
  console.log("=== PROTOTYPE CARD CLASSIFICATION V2 ===");
  console.log("Lecture seule : aucune modification Supabase.");
  console.log("");

  if (!fs.existsSync(REPO)) {
    throw new Error(
      `Dépôt PTCG-database introuvable : ${REPO}\n` +
      "Place le dépôt à la racine du projet, comme dans les tests précédents."
    );
  }

  const supabase = getSupabase();

  console.log("Chargement Supabase...");
  const [cards, sets, pokemon, cardPokemon] = await Promise.all([
    fetchAll<CardRow>(
      supabase,
      "cards",
      "id,set_id,source,source_id,local_id,number,name,language,rarity,category,image_small,image_large,dex_ids"
    ),
    fetchAll<SetRow>(
      supabase,
      "sets",
      "id,source,source_id,name,language,code"
    ),
    fetchAll<PokemonRow>(
      supabase,
      "pokemon_entities",
      "id,dex_id,name_fr"
    ),
    fetchAll<CardPokemonRow>(
      supabase,
      "card_pokemon",
      "card_id,pokemon_entity_id,dex_position"
    ),
  ]);

  console.log(`Cards Supabase : ${cards.length}`);
  console.log(`Sets Supabase : ${sets.length}`);
  console.log(`Pokémon entities : ${pokemon.length}`);
  console.log(`Relations card_pokemon : ${cardPokemon.length}`);

  const pokemonById = new Map(pokemon.map((p) => [p.id, p]));
  const pokemonByDex = new Map<number, PokemonRow>();
  for (const p of pokemon) pokemonByDex.set(p.dex_id, p);

  const setById = new Map(sets.map((s) => [s.id, s]));

  const relationsByCard = new Map<string, CardPokemonRow[]>();
  for (const relation of cardPokemon) {
    const list = relationsByCard.get(relation.card_id) ?? [];
    list.push(relation);
    relationsByCard.set(relation.card_id, list);
  }

  const classified: ClassifiedCard[] = [];
  const excludedLanguages: Record<string, number> = {};
  const cardsWithoutPokemon: string[] = [];
  const cardsWithMissingPokemonEntity: string[] = [];
  const cardsWithDexButNoRelation: string[] = [];
  const relationDexMismatches: Array<{
    cardId: string;
    sourceId: string;
    language: string;
    dexIds: number[];
    relationDexIds: number[];
  }> = [];

  const languageSummary: Record<string, {
    cards: number;
    withPokemon: number;
    withoutPokemon: number;
    multiPokemon: number;
    withImage: number;
    withoutImage: number;
  }> = {};

  for (const lang of LANGUAGES) {
    languageSummary[lang] = {
      cards: 0,
      withPokemon: 0,
      withoutPokemon: 0,
      multiPokemon: 0,
      withImage: 0,
      withoutImage: 0,
    };
  }

  for (const card of cards) {
    const language = normalizeLanguage(card.language);

    if (!language) {
      increment(excludedLanguages, card.language);
      continue;
    }

    languageSummary[language].cards++;

    const set = card.set_id ? setById.get(card.set_id) : undefined;
    const relations = relationsByCard.get(card.id) ?? [];

    const relationPokemon = relations
      .map((r) => {
        const p = pokemonById.get(r.pokemon_entity_id);
        return p
          ? {
              dexId: p.dex_id,
              nameFr: p.name_fr,
              position: r.dex_position,
            }
          : null;
      })
      .filter((x): x is {
        dexId: number;
        nameFr: string;
        position: number | null;
      } => x !== null)
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

    const dexIds = normalizeDexIds(card.dex_ids);
    const relationDexIds = [...new Set(relationPokemon.map((p) => p.dexId))].sort(
      (a, b) => a - b
    );

    const dexSet = new Set(dexIds);
    const relationSet = new Set(relationDexIds);

    const mismatch =
      dexIds.length !== relationDexIds.length ||
      dexIds.some((id) => !relationSet.has(id)) ||
      relationDexIds.some((id) => !dexSet.has(id));

    if (mismatch && (dexIds.length > 0 || relationDexIds.length > 0)) {
      relationDexMismatches.push({
        cardId: card.id,
        sourceId: card.source_id,
        language,
        dexIds,
        relationDexIds,
      });
    }

    if (dexIds.length > 0 && relationPokemon.length === 0) {
      cardsWithDexButNoRelation.push(card.id);
    }

    const missingRelationEntity = relations.some(
      (r) => !pokemonById.has(r.pokemon_entity_id)
    );

    if (missingRelationEntity) {
      cardsWithMissingPokemonEntity.push(card.id);
    }

    if (relationPokemon.length === 0) {
      cardsWithoutPokemon.push(card.id);
      languageSummary[language].withoutPokemon++;
    } else {
      languageSummary[language].withPokemon++;
      if (relationPokemon.length > 1) {
        languageSummary[language].multiPokemon++;
      }
    }

    if (card.image_small || card.image_large) {
      languageSummary[language].withImage++;
    } else {
      languageSummary[language].withoutImage++;
    }

    classified.push({
      cardId: card.id,
      source: card.source,
      sourceId: card.source_id,
      language,
      languageGroup: LANGUAGE_GROUP[language],
      set: {
        id: card.set_id,
        sourceId: set?.source_id ?? null,
        name: set?.name ?? null,
        code: set?.code ?? null,
      },
      number: card.number ?? card.local_id,
      nameOriginal: card.name,
      image: {
        small: card.image_small,
        large: card.image_large,
      },
      pokemon: relationPokemon,
    });
  }

  const pokemonSearchTests = TEST_POKEMON.map((test) => {
    const matching = classified.filter((card) =>
      card.pokemon.some((p) => p.dexId === test.dexId)
    );

    const byLanguage: Record<string, number> = {};
    const byGroup: Record<string, number> = {};

    for (const card of matching) {
      increment(byLanguage, card.language);
      increment(byGroup, card.languageGroup);
    }

    const examples = matching
      .slice(0, 25)
      .map((card) => ({
        cardId: card.cardId,
        language: card.language,
        languageGroup: card.languageGroup,
        set: card.set,
        number: card.number,
        nameOriginal: card.nameOriginal,
        image: card.image,
      }));

    return {
      query: test.name,
      dexId: test.dexId,
      totalCards: matching.length,
      byLanguage,
      byGroup,
      examples,
    };
  });

  const byLanguageAndGroup = {
    WESTERN: countBy(
      classified
        .filter((c) => c.languageGroup === "WESTERN")
        .map((c) => c.language)
    ),
    ASIAN: countBy(
      classified
        .filter((c) => c.languageGroup === "ASIAN")
        .map((c) => c.language)
    ),
  };

  const pokemonCoverage = new Map<number, number>();
  for (const card of classified) {
    for (const p of card.pokemon) {
      pokemonCoverage.set(p.dexId, (pokemonCoverage.get(p.dexId) ?? 0) + 1);
    }
  }

  const pokemonWithoutCards = pokemon
    .filter((p) => !pokemonCoverage.has(p.dex_id))
    .map((p) => ({
      dexId: p.dex_id,
      nameFr: p.name_fr,
    }));

  const multiPokemonCards = classified
    .filter((c) => c.pokemon.length > 1)
    .slice(0, 500)
    .map((c) => ({
      cardId: c.cardId,
      language: c.language,
      languageGroup: c.languageGroup,
      set: c.set,
      number: c.number,
      nameOriginal: c.nameOriginal,
      pokemon: c.pokemon,
    }));

  const result = {
    generatedAt: new Date().toISOString(),
    mode: "prototype-card-classification-v2",
    writeToSupabase: false,

    model: {
      westernLanguages: ["FR"],
      asianLanguages: ["JP", "KO", "SC", "TC"],
      identityRule:
        "Chaque carte reste indépendante. Une correspondance interlangue est une information supplémentaire.",
      searchRule:
        "La recherche fonctionnelle se fait via pokemon_entities.name_fr / dex_id.",
      imageRule:
        "L'image reste attachée à la carte et à sa langue.",
      languageGroupRule:
        "FR = WESTERN ; JP/KO/SC/TC = ASIAN.",
    },

    source: {
      repository: REPO,
      cardsFromSupabase: true,
      pokemonClassificationFromSupabaseCardPokemon: true,
    },

    summary: {
      cardsTotalInSupabase: cards.length,
      cardsAnalyzed: classified.length,
      cardsExcludedByLanguage: cards.length - classified.length,
      cardsWithPokemon: classified.filter((c) => c.pokemon.length > 0).length,
      cardsWithoutPokemon: cardsWithoutPokemon.length,
      multiPokemonCards: classified.filter((c) => c.pokemon.length > 1).length,
      cardsWithImage: classified.filter(
        (c) => c.image.small || c.image.large
      ).length,
      cardsWithoutImage: classified.filter(
        (c) => !c.image.small && !c.image.large
      ).length,
      pokemonEntities: pokemon.length,
      pokemonWithAtLeastOneCard: pokemonCoverage.size,
      pokemonWithoutAnyCard: pokemonWithoutCards.length,
      relationDexMismatches: relationDexMismatches.length,
      cardsWithDexButNoRelation: cardsWithDexButNoRelation.length,
      missingPokemonEntitiesInRelations: cardsWithMissingPokemonEntity.length,
    },

    languageSummary,
    byLanguageAndGroup,
    excludedLanguages,

    pokemonSearchTests,

    quality: {
      relationDexMismatches,
      cardsWithDexButNoRelation,
      cardsWithMissingPokemonEntity,
      pokemonWithoutCards,
      multiPokemonCards,
    },

    cards: classified,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");

  console.log("");
  console.log("=== RÉSULTATS ===");
  console.log(`Cartes analysées : ${classified.length}`);
  console.log(
    `Avec Pokémon : ${classified.filter((c) => c.pokemon.length > 0).length}`
  );
  console.log(`Sans Pokémon : ${cardsWithoutPokemon.length}`);
  console.log(
    `Multi-Pokémon : ${classified.filter((c) => c.pokemon.length > 1).length}`
  );
  console.log(`Avec image : ${result.summary.cardsWithImage}`);
  console.log(`Sans image : ${result.summary.cardsWithoutImage}`);
  console.log(
    `Pokémon couverts : ${pokemonCoverage.size}/${pokemon.length}`
  );
  console.log(`Discordances Dex/relation : ${relationDexMismatches.length}`);
  console.log(
    `Cartes avec dex_ids mais sans relation : ${cardsWithDexButNoRelation.length}`
  );
  console.log(
    `Relations vers Pokémon inexistants : ${cardsWithMissingPokemonEntity.length}`
  );

  console.log("");
  console.log("=== LANGUES ===");
  for (const lang of LANGUAGES) {
    const s = languageSummary[lang];
    console.log(
      `${lang}: ${s.cards} cartes | Pokémon ${s.withPokemon} | sans Pokémon ${s.withoutPokemon} | multi ${s.multiPokemon} | images ${s.withImage}`
    );
  }

  console.log("");
  console.log("=== TESTS DE RECHERCHE ===");
  for (const test of pokemonSearchTests) {
    console.log(
      `${test.query} (#${test.dexId}) : ${test.totalCards} cartes | ` +
      `FR ${test.byLanguage.FR ?? 0} | JP ${test.byLanguage.JP ?? 0} | ` +
      `KO ${test.byLanguage.KO ?? 0} | SC ${test.byLanguage.SC ?? 0} | TC ${test.byLanguage.TC ?? 0}`
    );
  }

  console.log("");
  console.log(`JSON écrit : ${OUTPUT}`);
  console.log("=== FIN ===");
}

main().catch((error) => {
  console.error("");
  console.error("❌ ERREUR");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
