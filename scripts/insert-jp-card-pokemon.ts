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
const INSERT_BATCH_SIZE = 500;

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
   RÉCUPÉRATION DES CARTES JP
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
        `Erreur récupération cartes JP: ${error.message}`
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    cards.push(...data);

    console.log(`Cartes JP chargées : ${cards.length}`);

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return cards;
}


/* =========================================================
   RÉCUPÉRATION DES POKÉMON
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
        `Erreur récupération pokemon_entities: ${error.message}`
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
   RECHERCHE D'UN POKÉMON PAR SON DEX ID
   ========================================================= */

function findPokemon(
  dexId: number,
  pokemonByDexId: Map<number, PokemonEntity>
): PokemonEntity | undefined {

  // Correspondance exacte
  const exact = pokemonByDexId.get(dexId);

  if (exact) {
    return exact;
  }

  /*
   * Certains dex_ids TCGdex utilisent des valeurs comme :
   *
   * 384.1
   *
   * alors que notre table pokemon_entities contient :
   *
   * 384 = Rayquaza
   *
   * On utilise donc le numéro entier comme fallback.
   */
  if (!Number.isInteger(dexId)) {
    const baseDexId = Math.trunc(dexId);

    return pokemonByDexId.get(baseDexId);
  }

  return undefined;
}


/* =========================================================
   DÉTECTION ET DÉDUPLICATION DES RELATIONS
   ========================================================= */

function deduplicateRelations(
  relations: CardPokemonRelation[]
): {
  uniqueRelations: CardPokemonRelation[];
  duplicates: CardPokemonRelation[];
} {

  const seen = new Map<string, CardPokemonRelation>();
  const duplicates: CardPokemonRelation[] = [];

  for (const relation of relations) {

    /*
     * La contrainte SQL est :
     *
     * UNIQUE(card_id, pokemon_entity_id)
     *
     * Donc notre clé de déduplication doit utiliser
     * exactement ces deux valeurs.
     */
    const key =
      `${relation.card_id}-${relation.pokemon_entity_id}`;

    if (seen.has(key)) {
      duplicates.push(relation);
      continue;
    }

    seen.set(key, relation);
  }

  return {
    uniqueRelations: Array.from(seen.values()),
    duplicates,
  };
}


/* =========================================================
   SUPPRESSION DES ANCIENNES RELATIONS JP
   ========================================================= */

async function deleteExistingJapaneseRelations(
  cardIds: string[]
) {

  console.log("\nSuppression des anciennes relations JP...");

  let processed = 0;

  for (
    let i = 0;
    i < cardIds.length;
    i += INSERT_BATCH_SIZE
  ) {

    const batch = cardIds.slice(
      i,
      i + INSERT_BATCH_SIZE
    );

    const { error } = await supabase
      .from("card_pokemon")
      .delete()
      .in("card_id", batch);

    if (error) {
      throw new Error(
        `Erreur suppression relations JP: ${error.message}`
      );
    }

    processed += batch.length;

    console.log(
      `  Vérifiées/supprimées : ${processed}/${cardIds.length}`
    );
  }

  console.log(
    `Relations JP précédentes supprimées pour ${processed} cartes.`
  );
}


/* =========================================================
   INSERTION DES RELATIONS
   ========================================================= */

async function insertRelations(
  relations: CardPokemonRelation[]
) {

  console.log(
    `\nInsertion de ${relations.length} relations...`
  );

  let inserted = 0;

  for (
    let i = 0;
    i < relations.length;
    i += INSERT_BATCH_SIZE
  ) {

    const batch = relations.slice(
      i,
      i + INSERT_BATCH_SIZE
    );

    const { error } = await supabase
      .from("card_pokemon")
      .insert(batch);

    if (error) {

      console.error(
        "Erreur Supabase :",
        error
      );

      throw new Error(
        `Erreur insertion relations: ${error.message}`
      );
    }

    inserted += batch.length;

    console.log(
      `  ${inserted}/${relations.length} relations insérées`
    );
  }

  return inserted;
}


/* =========================================================
   PROGRAMME PRINCIPAL
   ========================================================= */

async function main() {

  console.log(
    "=== Création des relations JP card_pokemon ===\n"
  );


  /* -------------------------------------------------------
     1. Charger les données
     ------------------------------------------------------- */

  const [cards, pokemonEntities] =
    await Promise.all([
      getAllJapaneseCards(),
      getAllPokemonEntities(),
    ]);


  console.log(`\nCartes JP : ${cards.length}`);
  console.log(
    `Pokémon référencés : ${pokemonEntities.length}`
  );


  /* -------------------------------------------------------
     2. Créer l'index des Pokémon
     ------------------------------------------------------- */

  const pokemonByDexId =
    new Map<number, PokemonEntity>();

  for (const pokemon of pokemonEntities) {
    pokemonByDexId.set(
      pokemon.dex_id,
      pokemon
    );
  }


  /* -------------------------------------------------------
     3. Construire les relations
     ------------------------------------------------------- */

  const relations: CardPokemonRelation[] = [];

  const cardsWithDexIds: Card[] = [];
  const cardsWithoutDexIds: Card[] = [];

  const unknownDexIds = new Set<number>();

  const normalizedDexIds = new Map<
    string,
    {
      original: number;
      normalized: number;
      cardSourceId: string;
    }
  >();


  for (const card of cards) {

    if (
      !card.dex_ids ||
      card.dex_ids.length === 0
    ) {

      cardsWithoutDexIds.push(card);

      continue;
    }


    cardsWithDexIds.push(card);


    card.dex_ids.forEach(
      (dexId, index) => {

        const pokemon =
          findPokemon(
            dexId,
            pokemonByDexId
          );


        /* -----------------------------------------------
           Pokémon inconnu
           ----------------------------------------------- */

        if (!pokemon) {

          unknownDexIds.add(dexId);

          return;
        }


        /* -----------------------------------------------
           Dex ID normalisé
           ----------------------------------------------- */

        if (pokemon.dex_id !== dexId) {

          normalizedDexIds.set(
            `${card.id}-${index}`,
            {
              original: dexId,
              normalized: pokemon.dex_id,
              cardSourceId: card.source_id,
            }
          );
        }


        /* -----------------------------------------------
           Création de la relation
           ----------------------------------------------- */

        relations.push({
          card_id: card.id,
          pokemon_entity_id: pokemon.id,
          dex_position: index,
        });

      }
    );
  }


  console.log(
    `Cartes avec dex_ids : ${cardsWithDexIds.length}`
  );

  console.log(
    `Cartes sans dex_ids : ${cardsWithoutDexIds.length}`
  );

  console.log(
    `Relations brutes à créer : ${relations.length}`
  );


  /* -------------------------------------------------------
     4. Vérifier les dex_ids inconnus
     ------------------------------------------------------- */

  if (unknownDexIds.size > 0) {

    console.log(
      "\n⚠️ dex_ids inconnus :"
    );

    for (const dexId of unknownDexIds) {
      console.log(`  - ${dexId}`);
    }

    throw new Error(
      "Des dex_ids inconnus existent. Aucune modification n'a été effectuée."
    );
  }


  /* -------------------------------------------------------
     5. Afficher les normalisations
     ------------------------------------------------------- */

  console.log(
    `Identifiants normalisés : ${normalizedDexIds.size}`
  );


  for (const value of normalizedDexIds.values()) {

    console.log(
      `  ${value.cardSourceId} : ` +
      `${value.original} → ${value.normalized}`
    );
  }


  /* -------------------------------------------------------
     6. Dédupliquer les relations
     ------------------------------------------------------- */

  const {
    uniqueRelations,
    duplicates,
  } = deduplicateRelations(relations);


  console.log(
    `Relations uniques : ${uniqueRelations.length}`
  );

  console.log(
    `Relations en doublon supprimées : ${duplicates.length}`
  );


  /*
   * Si des doublons existent, on les affiche.
   *
   * Ce n'est PAS une erreur :
   * ils seront simplement ignorés.
   */

  if (duplicates.length > 0) {

    console.log(
      "\n⚠️ Doublons détectés :"
    );

    for (const duplicate of duplicates) {

      const card =
        cards.find(
          (c) => c.id === duplicate.card_id
        );

      const pokemon =
        pokemonEntities.find(
          (p) =>
            p.id === duplicate.pokemon_entity_id
        );

      console.log(
        `  Carte ${card?.source_id ?? duplicate.card_id} → ` +
        `#${pokemon?.dex_id ?? "?"} ${pokemon?.name_fr ?? ""}`
      );
    }
  }


  /* -------------------------------------------------------
     7. Sécurité finale AVANT suppression
     ------------------------------------------------------- */

  if (uniqueRelations.length === 0) {

    throw new Error(
      "Aucune relation à insérer. Arrêt de sécurité."
    );
  }


  /*
   * On vérifie également qu'on possède bien les cartes JP.
   */

  const japaneseCardIds =
    cards.map(
      (card) => card.id
    );

  if (japaneseCardIds.length !== 13006) {

    console.warn(
      `⚠️ Attention : ${japaneseCardIds.length} cartes JP trouvées.`
    );

    console.warn(
      "Le nombre attendu actuellement est 13006."
    );
  }


  /* -------------------------------------------------------
     8. SEULEMENT MAINTENANT :
        supprimer les anciennes relations JP
     ------------------------------------------------------- */

  await deleteExistingJapaneseRelations(
    japaneseCardIds
  );


  /* -------------------------------------------------------
     9. Insérer les relations propres
     ------------------------------------------------------- */

  const inserted =
    await insertRelations(
      uniqueRelations
    );


  /* -------------------------------------------------------
     10. Résumé final
     ------------------------------------------------------- */

  console.log(
    "\n================================="
  );

  console.log(
    "IMPORT TERMINÉ"
  );

  console.log(
    "================================="
  );

  console.log(
    `Cartes JP : ${cards.length}`
  );

  console.log(
    `Avec dex_ids : ${cardsWithDexIds.length}`
  );

  console.log(
    `Sans dex_ids : ${cardsWithoutDexIds.length}`
  );

  console.log(
    `Relations brutes : ${relations.length}`
  );

  console.log(
    `Doublons supprimés : ${duplicates.length}`
  );

  console.log(
    `Relations uniques : ${uniqueRelations.length}`
  );

  console.log(
    `Relations insérées : ${inserted}`
  );

  console.log(
    `dex_ids normalisés : ${normalizedDexIds.size}`
  );

  console.log(
    "================================="
  );
}


main().catch((error) => {

  console.error(
    "\n❌ ERREUR :",
    error
  );

  process.exit(1);
});