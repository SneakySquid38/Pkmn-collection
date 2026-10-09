import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const PAGE_SIZE = 500;

type Card = {
  id: string;
  source_id: string;
  dex_ids: number[] | null;
};

type PokemonEntity = {
  id: string;
  dex_id: number;
  name_fr: string;
};

type CardPokemonRelation = {
  card_id: string;
  pokemon_entity_id: string;
  dex_position: number;
};


/* =========================================================
   CARTES JP
   ========================================================= */

async function getAllJapaneseCards(): Promise<Card[]> {
  const cards: Card[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, source_id, dex_ids")
      .eq("source", "tcgdex")
      .eq("language", "JP")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Erreur récupération cartes JP : ${error.message}`
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    cards.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return cards;
}


/* =========================================================
   POKÉMON
   ========================================================= */

async function getAllPokemonEntities(): Promise<PokemonEntity[]> {
  const pokemon: PokemonEntity[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("pokemon_entities")
      .select("id, dex_id, name_fr")
      .order("dex_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Erreur récupération pokemon_entities : ${error.message}`
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    pokemon.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return pokemon;
}


/* =========================================================
   RELATIONS CARD_POKEMON
   ========================================================= */

async function getAllCardPokemonRelations(): Promise<CardPokemonRelation[]> {
  const relations: CardPokemonRelation[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("card_pokemon")
      .select("card_id, pokemon_entity_id, dex_position")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Erreur récupération card_pokemon : ${error.message}`
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    relations.push(...data);

    console.log(
      `Relations chargées : ${relations.length}`
    );

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return relations;
}


/* =========================================================
   MAIN
   ========================================================= */

async function main() {

  console.log(
    "=== Vérification des relations JP card_pokemon ===\n"
  );


  /* -------------------------------------------------------
     1. Charger les données
     ------------------------------------------------------- */

  const [
    cards,
    pokemonEntities,
    allRelations,
  ] = await Promise.all([
    getAllJapaneseCards(),
    getAllPokemonEntities(),
    getAllCardPokemonRelations(),
  ]);


  console.log(`\nCartes JP : ${cards.length}`);
  console.log(
    `Pokémon entities : ${pokemonEntities.length}`
  );


  /*
   * -------------------------------------------------------
   * 2. Identifier les cartes JP
   * -------------------------------------------------------
   */

  const japaneseCardIds = new Set(
    cards.map(card => card.id)
  );


  /*
   * -------------------------------------------------------
   * 3. Garder uniquement les relations JP
   * -------------------------------------------------------
   */

  const relations =
    allRelations.filter(
      relation =>
        japaneseCardIds.has(relation.card_id)
    );


  console.log(
    `Relations JP : ${relations.length}`
  );


  /*
   * -------------------------------------------------------
   * 4. Index Pokémon
   * -------------------------------------------------------
   */

  const pokemonById =
    new Map<string, PokemonEntity>();

  const pokemonByDexId =
    new Map<number, PokemonEntity>();

  for (const pokemon of pokemonEntities) {

    pokemonById.set(
      pokemon.id,
      pokemon
    );

    pokemonByDexId.set(
      pokemon.dex_id,
      pokemon
    );
  }


  /*
   * -------------------------------------------------------
   * 5. Relations orphelines
   * -------------------------------------------------------
   */

  const orphanRelations =
    relations.filter(
      relation =>
        !pokemonById.has(
          relation.pokemon_entity_id
        )
    );

  console.log(
    `Relations vers Pokémon inexistant : ${orphanRelations.length}`
  );


  /*
   * -------------------------------------------------------
   * 6. Cartes avec / sans dex_ids
   * -------------------------------------------------------
   */

  const cardsWithDexIds =
    cards.filter(
      card =>
        card.dex_ids &&
        card.dex_ids.length > 0
    );

  const cardsWithoutDexIds =
    cards.filter(
      card =>
        !card.dex_ids ||
        card.dex_ids.length === 0
    );

  console.log(
    `Cartes JP avec dex_ids : ${cardsWithDexIds.length}`
  );

  console.log(
    `Cartes JP sans dex_ids : ${cardsWithoutDexIds.length}`
  );


  /*
   * -------------------------------------------------------
   * 7. Relations par carte
   * -------------------------------------------------------
   */

  const relationsByCard =
    new Map<string, CardPokemonRelation[]>();

  for (const relation of relations) {

    const existing =
      relationsByCard.get(
        relation.card_id
      ) ?? [];

    existing.push(relation);

    relationsByCard.set(
      relation.card_id,
      existing
    );
  }


  /*
   * -------------------------------------------------------
   * 8. Vérifier les cartes avec dex_ids
   * -------------------------------------------------------
   */

  const cardsMissingRelations: Card[] = [];

  const cardsWithUnexpectedRelations: Card[] = [];

  for (const card of cardsWithDexIds) {

    const cardRelations =
      relationsByCard.get(card.id) ?? [];

    const expectedPokemonIds =
      new Set<string>();


    for (const dexId of card.dex_ids!) {

      let pokemon =
        pokemonByDexId.get(dexId);

      /*
       * 384.1 → 384
       */

      if (
        !pokemon &&
        !Number.isInteger(dexId)
      ) {
        pokemon =
          pokemonByDexId.get(
            Math.trunc(dexId)
          );
      }

      if (pokemon) {
        expectedPokemonIds.add(
          pokemon.id
        );
      }
    }


    const actualPokemonIds =
      new Set(
        cardRelations.map(
          relation =>
            relation.pokemon_entity_id
        )
      );


    /*
     * Relations manquantes
     */

    for (
      const expectedId of expectedPokemonIds
    ) {

      if (!actualPokemonIds.has(
        expectedId
      )) {

        cardsMissingRelations.push(card);

        break;
      }
    }


    /*
     * Relations inattendues
     */

    for (
      const actualId of actualPokemonIds
    ) {

      if (!expectedPokemonIds.has(
        actualId
      )) {

        cardsWithUnexpectedRelations.push(
          card
        );

        break;
      }
    }
  }


  /*
   * -------------------------------------------------------
   * 9. Doublons
   * -------------------------------------------------------
   */

  const relationKeys =
    new Set<string>();

  const duplicateRelations:
    CardPokemonRelation[] = [];

  for (const relation of relations) {

    const key =
      `${relation.card_id}-${relation.pokemon_entity_id}`;

    if (relationKeys.has(key)) {

      duplicateRelations.push(
        relation
      );

    } else {

      relationKeys.add(key);
    }
  }

  console.log(
    `Doublons card_id + pokemon_entity_id : ${duplicateRelations.length}`
  );


  /*
   * -------------------------------------------------------
   * 10. Vérification 384.1
   * -------------------------------------------------------
   */

  const rayquazaDeltaCards =
    cards.filter(
      card =>
        card.dex_ids?.includes(384.1)
    );

  let rayquazaDeltaCorrect = 0;

  for (
    const card of rayquazaDeltaCards
  ) {

    const cardRelations =
      relationsByCard.get(card.id) ?? [];

    const hasRayquaza =
      cardRelations.some(
        relation => {

          const pokemon =
            pokemonById.get(
              relation.pokemon_entity_id
            );

          return pokemon?.dex_id === 384;
        }
      );

    if (hasRayquaza) {
      rayquazaDeltaCorrect++;
    }
  }

  console.log(
    `Cartes avec dex_id 384.1 : ${rayquazaDeltaCards.length}`
  );

  console.log(
    `384.1 correctement lié à Rayquaza #384 : ${rayquazaDeltaCorrect}/${rayquazaDeltaCards.length}`
  );


  /*
   * -------------------------------------------------------
   * 11. Résultat
   * ------------------------------------------------------- */

  console.log(
    "\n================================="
  );

  console.log(
    "RÉSULTAT DE LA VÉRIFICATION"
  );

  console.log(
    "================================="
  );

  console.log(
    `Cartes JP : ${cards.length}/13006`
  );

  console.log(
    `Pokémon : ${pokemonEntities.length}/1025`
  );

  console.log(
    `Relations JP : ${relations.length}/10193`
  );

  console.log(
    `Relations orphelines : ${orphanRelations.length}`
  );

  console.log(
    `Cartes avec relations manquantes : ${cardsMissingRelations.length}`
  );

  console.log(
    `Relations inattendues : ${cardsWithUnexpectedRelations.length}`
  );

  console.log(
    `Doublons : ${duplicateRelations.length}`
  );

  console.log(
    `384.1 → Rayquaza : ${rayquazaDeltaCorrect}/${rayquazaDeltaCards.length}`
  );

  console.log(
    "================================="
  );


  const success =
    cards.length === 13006 &&
    pokemonEntities.length === 1025 &&
    relations.length === 10193 &&
    orphanRelations.length === 0 &&
    cardsMissingRelations.length === 0 &&
    cardsWithUnexpectedRelations.length === 0 &&
    duplicateRelations.length === 0 &&
    rayquazaDeltaCorrect === rayquazaDeltaCards.length;


  if (success) {

    console.log(
      "\n✅ VÉRIFICATION RÉUSSIE"
    );

    console.log(
      "Les relations JP sont cohérentes."
    );

  } else {

    console.log(
      "\n⚠️ VÉRIFICATION À EXAMINER"
    );

    console.log(
      "Des incohérences ont été détectées."
    );
  }
}


main().catch(error => {

  console.error(
    "\n❌ ERREUR :",
    error
  );

  process.exit(1);
});