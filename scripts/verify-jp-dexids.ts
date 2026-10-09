import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: ".env.local",
});

// --------------------------------------------------
// Supabase
// --------------------------------------------------

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Variables Supabase manquantes dans .env.local"
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

// --------------------------------------------------
// Types
// --------------------------------------------------

type Card = {
  id: string;
  source_id: string;
  name: string;
  dex_ids: number[] | null;
};

type PokemonEntity = {
  id: string;
  dex_id: number;
  name_fr: string;
};

// --------------------------------------------------
// Pagination Supabase
// --------------------------------------------------

async function getAllJapaneseCards(): Promise<Card[]> {
  const cards: Card[] = [];

  const PAGE_SIZE = 1000;

  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("cards")
      .select(
        "id, source_id, name, dex_ids"
      )
      .eq("source", "tcgdex")
      .eq("language", "JP")
      .order("source_id")
      .range(from, to);

    if (error) {
      throw new Error(
        `Erreur récupération cartes JP : ${error.message}`
      );
    }

    const page = data ?? [];

    cards.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return cards;
}

// --------------------------------------------------
// Pokémon
// --------------------------------------------------

async function getAllPokemon(): Promise<
  PokemonEntity[]
> {
  const pokemon: PokemonEntity[] = [];

  const PAGE_SIZE = 1000;

  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("pokemon_entities")
      .select(
        "id, dex_id, name_fr"
      )
      .order("dex_id")
      .range(from, to);

    if (error) {
      throw new Error(
        `Erreur récupération Pokémon : ${error.message}`
      );
    }

    const page = data ?? [];

    pokemon.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return pokemon;
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  console.log(
    "=============================================="
  );

  console.log(
    " VÉRIFICATION DEX_ID — CARTES JP"
  );

  console.log(
    "==============================================\n"
  );

  // ------------------------------------------------
  // Charger les données
  // ------------------------------------------------

  const cards =
    await getAllJapaneseCards();

  const pokemon =
    await getAllPokemon();

  console.log(
    `Cartes JP        : ${cards.length}`
  );

  console.log(
    `Pokémon référencés : ${pokemon.length}\n`
  );

  // ------------------------------------------------
  // Index dex_id → Pokémon
  // ------------------------------------------------

  const pokemonByDexId =
    new Map<number, PokemonEntity>();

  for (const p of pokemon) {
    pokemonByDexId.set(
      p.dex_id,
      p
    );
  }

  // ------------------------------------------------
  // Compteurs
  // ------------------------------------------------

  let cardsWithDexIds = 0;
  let cardsWithoutDexIds = 0;

  let totalRelations = 0;

  const unknownDexIds =
    new Set<number>();

  const cardsWithUnknownDexIds: {
    source_id: string;
    name: string;
    dex_ids: number[];
    unknown: number[];
  }[] = [];

  const examples: {
    source_id: string;
    card_name: string;
    dex_ids: number[];
    pokemon: string[];
  }[] = [];

  // ------------------------------------------------
  // Vérification
  // ------------------------------------------------

  for (const card of cards) {
    const dexIds =
      Array.isArray(card.dex_ids)
        ? card.dex_ids
        : [];

    if (dexIds.length === 0) {
      cardsWithoutDexIds++;
      continue;
    }

    cardsWithDexIds++;

    totalRelations +=
      dexIds.length;

    const names: string[] = [];
    const unknown: number[] = [];

    for (const dexId of dexIds) {
      const p =
        pokemonByDexId.get(
          dexId
        );

      if (!p) {
        unknown.push(dexId);
        unknownDexIds.add(dexId);
      } else {
        names.push(
          `#${p.dex_id} ${p.name_fr}`
        );
      }
    }

    if (unknown.length > 0) {
      cardsWithUnknownDexIds.push({
        source_id:
          card.source_id,

        name:
          card.name,

        dex_ids:
          dexIds,

        unknown,
      });
    }

    // Quelques exemples seulement
    if (
      examples.length < 20
    ) {
      examples.push({
        source_id:
          card.source_id,

        card_name:
          card.name,

        dex_ids:
          dexIds,

        pokemon:
          names,
      });
    }
  }

  // ------------------------------------------------
  // Résultats
  // ------------------------------------------------

  console.log(
    "=============================================="
  );

  console.log(
    " RÉSULTATS"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `Cartes avec dex_ids       : ${cardsWithDexIds}`
  );

  console.log(
    `Cartes sans dex_ids       : ${cardsWithoutDexIds}`
  );

  console.log(
    `Relations potentielles    : ${totalRelations}`
  );

  console.log(
    `Cartes avec dex_id inconnu : ${cardsWithUnknownDexIds.length}`
  );

  console.log(
    `dex_ids inconnus uniques  : ${unknownDexIds.size}`
  );

  // ------------------------------------------------
  // Exemples
  // ------------------------------------------------

  console.log(
    "\n=============================================="
  );

  console.log(
    " EXEMPLES"
  );

  console.log(
    "==============================================\n"
  );

  for (const example of examples) {
    console.log(
      `${example.source_id} - ${example.card_name}`
    );

    console.log(
      `   dex_ids : [${example.dex_ids.join(", ")}]`
    );

    console.log(
      `   Pokémon : ${example.pokemon.join(", ")}`
    );
  }

  // ------------------------------------------------
  // Problèmes
  // ------------------------------------------------

  if (
    cardsWithUnknownDexIds.length > 0
  ) {
    console.log(
      "\n=============================================="
    );

    console.log(
      " ⚠️ DEX_ID INCONNUS"
    );

    console.log(
      "==============================================\n"
    );

    for (
      const card
      of cardsWithUnknownDexIds
    ) {
      console.log(
        `${card.source_id} - ${card.name}`
      );

      console.log(
        `   dex_ids : [${card.dex_ids.join(", ")}]`
      );

      console.log(
        `   inconnus : [${card.unknown.join(", ")}]`
      );
    }
  }

  // ------------------------------------------------
  // Verdict
  // ------------------------------------------------

  console.log(
    "\n=============================================="
  );

  if (
    cardsWithUnknownDexIds.length === 0
  ) {
    console.log(
      " ✅ VÉRIFICATION OK"
    );

    console.log(
      " Tous les dex_ids JP correspondent"
    );

    console.log(
      " à un Pokémon de pokemon_entities."
    );
  } else {
    console.log(
      " ⚠️ VÉRIFICATION À CORRIGER"
    );

    console.log(
      `${cardsWithUnknownDexIds.length} cartes`
    );

    console.log(
      "possèdent au moins un dex_id inconnu."
    );
  }

  console.log(
    "=============================================="
  );
}

main().catch((error) => {
  console.error(
    "\nERREUR FATALE :",
    error
  );

  process.exit(1);
});