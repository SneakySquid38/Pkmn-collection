import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

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
// TCGdex
// --------------------------------------------------

const TCGDEX_API =
  "https://api.tcgdex.net/v2";

const LANGUAGE = "ja";
const DATABASE_LANGUAGE = "JP";

// --------------------------------------------------
// Réglages
// --------------------------------------------------

// Pause entre les lots de requêtes
const REQUEST_DELAY = 200;

// Nombre de cartes récupérées depuis Supabase
// à chaque page
const SUPABASE_PAGE_SIZE = 500;

// Nombre de cartes traitées simultanément
const CONCURRENCY = 5;

// Nombre maximum de tentatives
const MAX_RETRIES = 5;

// --------------------------------------------------
// Types
// --------------------------------------------------

type SupabaseCard = {
  id: string;
  source_id: string;
  local_id: string;
  name: string;
  set_id: string;
};

type TCGdexCard = {
  id: string;
  localId: string;
  name: string;
  image?: string;

  category?: string;
  illustrator?: string;
  rarity?: string;
  hp?: number;
  types?: string[];

  regulationMark?: string;

  dexId?: number[];

  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
};

type FailedCard = {
  cardId: string;
  sourceId: string;
  localId: string;
  name: string;
  error: string;
};

// --------------------------------------------------
// Utilitaires
// --------------------------------------------------

async function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

// --------------------------------------------------
// HTTP avec retry
// --------------------------------------------------

async function fetchJsonWithRetry<T>(
  url: string
): Promise<T> {
  let lastError =
    "Erreur inconnue";

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response.json();
      }

      const status =
        response.status;

      lastError =
        `${status} ${response.statusText}`;

      const temporaryError =
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (!temporaryError) {
        throw new Error(lastError);
      }

      if (attempt < MAX_RETRIES) {
        const delay =
          2000 *
          Math.pow(2, attempt - 1);

        console.log(
          `      ⚠️ ${status} → retry dans ${delay / 1000}s (${attempt}/${MAX_RETRIES})`
        );

        await sleep(delay);
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      if (attempt < MAX_RETRIES) {
        const delay =
          2000 *
          Math.pow(2, attempt - 1);

        console.log(
          `      ⚠️ ${lastError} → retry dans ${delay / 1000}s (${attempt}/${MAX_RETRIES})`
        );

        await sleep(delay);
      }
    }
  }

  throw new Error(lastError);
}

// --------------------------------------------------
// TCGdex : détail d'une carte
// --------------------------------------------------

async function fetchCardDetail(
  setId: string,
  localId: string
): Promise<TCGdexCard> {
  const url =
    `${TCGDEX_API}/${LANGUAGE}/sets/` +
    `${encodeURIComponent(setId)}/` +
    `${encodeURIComponent(localId)}`;

  return fetchJsonWithRetry<TCGdexCard>(
    url
  );
}

// --------------------------------------------------
// Supabase : récupérer les cartes JP
// --------------------------------------------------

async function getJapaneseCards(): Promise<
  SupabaseCard[]
> {
  const cards: SupabaseCard[] = [];

  let from = 0;

  while (true) {
    const to =
      from + SUPABASE_PAGE_SIZE - 1;

    const { data, error } =
      await supabase
        .from("cards")
        .select(
          "id, source_id, local_id, name, set_id"
        )
        .eq(
          "source",
          "tcgdex"
        )
        .eq(
          "language",
          DATABASE_LANGUAGE
        )
        .order("source_id")
        .range(from, to);

    if (error) {
      throw new Error(
        `Erreur récupération cartes JP : ${error.message}`
      );
    }

    const page =
      data ?? [];

    cards.push(...page);

    console.log(
      `Cartes JP récupérées : ${cards.length}`
    );

    if (
      page.length <
      SUPABASE_PAGE_SIZE
    ) {
      break;
    }

    from +=
      SUPABASE_PAGE_SIZE;
  }

  return cards;
}

// --------------------------------------------------
// Mise à jour d'une carte
// --------------------------------------------------

async function updateCardDexIds(
  cardId: string,
  dexIds: number[]
): Promise<void> {
  const { error } =
    await supabase
      .from("cards")
      .update({
        dex_ids: dexIds,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", cardId);

  if (error) {
    throw new Error(
      `Supabase : ${error.message}`
    );
  }
}

// --------------------------------------------------
// Traitement d'une carte
// --------------------------------------------------

async function enrichCard(
  card: SupabaseCard
): Promise<{
  dexIds: number[];
}> {
  /*
   * source_id = par exemple :
   *
   * SV2a-001
   *
   * On utilise directement le set_id provenant
   * de source_id.
   */

  const separator =
    card.source_id.lastIndexOf("-");

  if (separator === -1) {
    throw new Error(
      `source_id invalide : ${card.source_id}`
    );
  }

  const setId =
    card.source_id.substring(
      0,
      separator
    );

  const localId =
    card.source_id.substring(
      separator + 1
    );

  const detail =
    await fetchCardDetail(
      setId,
      localId
    );

  /*
   * dexId est optionnel dans TCGdex.
   *
   * Pour les Pokémon :
   *   [1]
   *   [25]
   *   [1, 2]
   *
   * Pour les Dresseurs / Énergies :
   *   []
   */
  const dexIds =
    Array.isArray(detail.dexId)
      ? detail.dexId
      : [];

  await updateCardDexIds(
    card.id,
    dexIds
  );

  return {
    dexIds,
  };
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  console.log(
    "=============================================="
  );

  console.log(
    " ENRICHISSEMENT TCGdex JP"
  );

  console.log(
    " dex_ids → cards"
  );

  console.log(
    "==============================================\n"
  );

  console.log(
    `Langue API       : ${LANGUAGE}`
  );

  console.log(
    `Langue DB        : ${DATABASE_LANGUAGE}`
  );

  console.log(
    `Pause            : ${REQUEST_DELAY} ms`
  );

  console.log(
    `Concurrence      : ${CONCURRENCY}`
  );

  console.log(
    `Retries maximum  : ${MAX_RETRIES}\n`
  );

  // ------------------------------------------------
  // Récupération des cartes
  // ------------------------------------------------

  const cards =
    await getJapaneseCards();

  console.log(
    `\nTotal cartes JP : ${cards.length}\n`
  );

  if (cards.length === 0) {
    throw new Error(
      "Aucune carte JP trouvée."
    );
  }

  // ------------------------------------------------
  // Compteurs
  // ------------------------------------------------

  let processed = 0;
  let successful = 0;
  let errors = 0;
  let pokemonCards = 0;
  let nonPokemonCards = 0;

  const failedCards: FailedCard[] = [];

  // ------------------------------------------------
  // Traitement par lots
  // ------------------------------------------------

  for (
    let i = 0;
    i < cards.length;
    i += CONCURRENCY
  ) {
    const batch =
      cards.slice(
        i,
        i + CONCURRENCY
      );

    const results =
      await Promise.all(
        batch.map(
          async (card) => {
            try {
              const result =
                await enrichCard(
                  card
                );

              return {
                card,
                result,
                error: null,
              };
            } catch (error) {
              return {
                card,
                result: null,
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
              };
            }
          }
        )
      );

    for (const result of results) {
      processed++;

      if (result.error) {
        errors++;

        failedCards.push({
          cardId:
            result.card.id,

          sourceId:
            result.card.source_id,

          localId:
            result.card.local_id,

          name:
            result.card.name,

          error:
            result.error,
        });

        console.error(
          `❌ ${result.card.source_id} - ${result.card.name}`
        );

        console.error(
          `   ${result.error}`
        );

        continue;
      }

      successful++;

      const dexIds =
        result.result?.dexIds ?? [];

      if (dexIds.length > 0) {
        pokemonCards++;
      } else {
        nonPokemonCards++;
      }

      console.log(
        `✓ ${result.card.source_id} - ${result.card.name} → dex_ids: [${dexIds.join(", ")}]`
      );
    }

    console.log(
      `Progression : ${processed}/${cards.length}`
    );

    // Pause entre les lots
    if (
      i + CONCURRENCY <
      cards.length
    ) {
      await sleep(
        REQUEST_DELAY
      );
    }
  }

  // ------------------------------------------------
  // Sauvegarder les erreurs
  // ------------------------------------------------

  if (
    failedCards.length > 0
  ) {
    await writeFile(
      "scripts/tcgdex-jp-enrichment-errors.json",

      JSON.stringify(
        failedCards,
        null,
        2
      ),

      "utf-8"
    );

    console.log(
      "\n⚠️ Erreurs sauvegardées dans :"
    );

    console.log(
      "scripts/tcgdex-jp-enrichment-errors.json"
    );
  }

  // ------------------------------------------------
  // Résumé
  // ------------------------------------------------

  console.log(
    "\n\n=============================================="
  );

  console.log(
    " ENRICHISSEMENT TERMINÉ"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `Cartes traitées     : ${processed}`
  );

  console.log(
    `Succès              : ${successful}`
  );

  console.log(
    `Erreurs             : ${errors}`
  );

  console.log(
    `Avec dex_ids        : ${pokemonCards}`
  );

  console.log(
    `Sans dex_ids        : ${nonPokemonCards}`
  );

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