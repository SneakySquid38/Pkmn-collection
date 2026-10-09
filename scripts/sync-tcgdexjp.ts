import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

dotenv.config({
  path: ".env.local",
});

// --------------------------------------------------
// Supabase
// --------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const TCGDEX_API = "https://api.tcgdex.net/v2";

const LANGUAGE = "ja";
const DATABASE_LANGUAGE = "JP";

// --------------------------------------------------
// Réglages
// --------------------------------------------------

// Pause entre deux requêtes TCGdex
const REQUEST_DELAY = 200;

// Nombre maximum de tentatives pour une erreur temporaire
const MAX_RETRIES = 4;

// Nombre maximum d'IDs envoyés à Supabase
// à chaque recherche
const EXISTING_IDS_BATCH_SIZE = 500;

// --------------------------------------------------
// Types
// --------------------------------------------------

type SupabaseSet = {
  id: string;
  source_id: string;
  name: string;
};

type TCGdexCardSummary = {
  id: string;
  localId: string;
  name: string;
  image?: string;
};

type TCGdexSetDetail = {
  id: string;
  name: string;
  cards?: TCGdexCardSummary[];
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

  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
};

type FailedCard = {
  setId: string;
  setName: string;
  cardId: string;
  localId: string;
  cardName: string;
  error: string;
};

// --------------------------------------------------
// Utilitaires
// --------------------------------------------------

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(
  array: T[],
  size: number
): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

// --------------------------------------------------
// HTTP avec retry
// --------------------------------------------------

async function fetchJsonWithRetry<T>(
  url: string
): Promise<T> {
  let lastError = "Erreur inconnue";

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

      const status = response.status;

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
          2000 * Math.pow(2, attempt - 1);

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
          2000 * Math.pow(2, attempt - 1);

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
// TCGdex : sets
// --------------------------------------------------

async function getJapaneseSets(): Promise<
  { id: string; name: string }[]
> {
  const url =
    `${TCGDEX_API}/${LANGUAGE}/sets`;

  const sets =
    await fetchJsonWithRetry<
      {
        id: string;
        name: string;
      }[]
    >(url);

  // On exclut les sets Pokémon Card Game Pocket
  return sets.filter(
    (set) => !set.id.startsWith("CS")
  );
}

// --------------------------------------------------
// TCGdex : détail d'un set
// --------------------------------------------------

async function fetchSetDetail(
  setId: string
): Promise<TCGdexSetDetail> {
  const url =
    `${TCGDEX_API}/${LANGUAGE}/sets/${encodeURIComponent(
      setId
    )}`;

  return fetchJsonWithRetry<TCGdexSetDetail>(
    url
  );
}

// --------------------------------------------------
// TCGdex : détail d'une carte
// --------------------------------------------------

async function fetchCardDetail(
  setId: string,
  localId: string
): Promise<TCGdexCard> {
  const url =
    `${TCGDEX_API}/${LANGUAGE}/sets/${encodeURIComponent(
      setId
    )}/${encodeURIComponent(localId)}`;

  return fetchJsonWithRetry<TCGdexCard>(
    url
  );
}

// --------------------------------------------------
// Supabase : récupérer les sets JP
// --------------------------------------------------

async function getAllJapaneseSets(): Promise<
  SupabaseSet[]
> {
  const { data, error } = await supabase
    .from("sets")
    .select("id, source_id, name")
    .eq("source", "tcgdex")
    .eq("language", DATABASE_LANGUAGE)
    .eq("product_type", "tcg")
    .order("name");

  if (error) {
    throw new Error(
      `Impossible de récupérer les sets JP : ${error.message}`
    );
  }

  return data ?? [];
}

// --------------------------------------------------
// Supabase : cartes déjà présentes
// --------------------------------------------------

async function getExistingCardIds(
  cardIds: string[]
): Promise<Set<string>> {
  const existingIds =
    new Set<string>();

  const batches = chunk(
    cardIds,
    EXISTING_IDS_BATCH_SIZE
  );

  for (const batch of batches) {
    const { data, error } =
      await supabase
        .from("cards")
        .select("source_id")
        .eq("source", "tcgdex")
        .eq("language", DATABASE_LANGUAGE)
        .in("source_id", batch);

    if (error) {
      throw new Error(
        `Erreur recherche cartes existantes : ${error.message}`
      );
    }

    for (const row of data ?? []) {
      existingIds.add(row.source_id);
    }
  }

  return existingIds;
}

// --------------------------------------------------
// Import d'une carte
// --------------------------------------------------

async function importCard(
  cardSummary: TCGdexCardSummary,
  set: SupabaseSet
): Promise<void> {
  const card = await fetchCardDetail(
    set.source_id,
    cardSummary.localId
  );

  const cardData = {
    set_id: set.id,

    source: "tcgdex",

    source_id: card.id,

    local_id: card.localId,

    number: card.localId,

    name: card.name,

    language: DATABASE_LANGUAGE,

    category:
      card.category ?? null,

    hp:
      card.hp ?? null,

    types:
      card.types ?? null,

    rarity:
      card.rarity ?? null,

    artist:
      card.illustrator ?? null,

    variants:
      card.variants ?? null,

    regulation_mark:
      card.regulationMark ?? null,

    image_small: card.image
      ? `${card.image}/low.webp`
      : null,

    image_large: card.image
      ? `${card.image}/high.webp`
      : null,

    updated_at:
      new Date().toISOString(),
  };

  const { error } =
    await supabase
      .from("cards")
      .upsert(cardData, {
        onConflict:
          "source,source_id",
      });

  if (error) {
    throw new Error(
      `Supabase : ${error.message}`
    );
  }
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  console.log(
    "=============================================="
  );

  console.log(
    " Synchronisation TCGdex JP → Supabase"
  );

  console.log(
    " MODE REPRISE / CARTES MANQUANTES"
  );

  console.log(
    "==============================================\n"
  );

  console.log(
    `Langue API        : ${LANGUAGE}`
  );

  console.log(
    `Langue DB         : ${DATABASE_LANGUAGE}`
  );

  console.log(
    `Pause requêtes    : ${REQUEST_DELAY} ms`
  );

  console.log(
    `Retries maximum   : ${MAX_RETRIES}\n`
  );

  // ------------------------------------------------
  // Sets JP en DB
  // ------------------------------------------------

  const dbSets =
    await getAllJapaneseSets();

  console.log(
    `Sets JP présents dans Supabase : ${dbSets.length}\n`
  );

  if (dbSets.length === 0) {
    throw new Error(
      "Aucun set JP trouvé dans Supabase."
    );
  }

  // ------------------------------------------------
  // Sets disponibles chez TCGdex
  // ------------------------------------------------

  const apiSets =
    await getJapaneseSets();

  console.log(
    `Sets JP disponibles chez TCGdex : ${apiSets.length}\n`
  );

  // ------------------------------------------------
  // Correspondance DB / API
  // ------------------------------------------------

  const apiSetIds =
    new Set(apiSets.map((set) => set.id));

  const sets = dbSets.filter((set) =>
    apiSetIds.has(set.source_id)
  );

  console.log(
    `Sets JP à traiter : ${sets.length}\n`
  );

  const missingInApi =
    dbSets.filter(
      (set) => !apiSetIds.has(set.source_id)
    );

  if (missingInApi.length > 0) {
    console.log(
      `⚠️ Sets présents en DB mais absents de l'API : ${missingInApi.length}`
    );

    for (const set of missingInApi) {
      console.log(
        `   - ${set.source_id} - ${set.name}`
      );
    }

    console.log();
  }

  // ------------------------------------------------
  // Compteurs
  // ------------------------------------------------

  let totalSets = 0;
  let totalCardsFound = 0;
  let totalAlreadyPresent = 0;
  let totalMissing = 0;
  let totalImported = 0;
  let totalErrors = 0;

  const failedCards: FailedCard[] = [];

  // ------------------------------------------------
  // Parcours des sets
  // ------------------------------------------------

  for (const set of sets) {
    totalSets++;

    console.log(
      `\n[${totalSets}/${sets.length}] ${set.source_id} - ${set.name}`
    );

    try {
      const detail =
        await fetchSetDetail(
          set.source_id
        );

      const cards =
        detail.cards ?? [];

      totalCardsFound +=
        cards.length;

      console.log(
        `   ${cards.length} cartes TCGdex`
      );

      if (cards.length === 0) {
        console.log(
          "   ⚠️ Aucune carte fournie par TCGdex."
        );

        continue;
      }

      // --------------------------------------------
      // Cartes déjà présentes
      // --------------------------------------------

      const cardIds =
        cards.map(
          (card) => card.id
        );

      const existingIds =
        await getExistingCardIds(
          cardIds
        );

      const missingCards =
        cards.filter(
          (card) =>
            !existingIds.has(card.id)
        );

      totalAlreadyPresent +=
        existingIds.size;

      totalMissing +=
        missingCards.length;

      console.log(
        `   ${existingIds.size} déjà présentes`
      );

      console.log(
        `   ${missingCards.length} nouvelles`
      );

      if (missingCards.length === 0) {
        console.log(
          "   ✓ Set déjà entièrement synchronisé."
        );

        continue;
      }

      // --------------------------------------------
      // Import
      // --------------------------------------------

      for (
        let i = 0;
        i < missingCards.length;
        i++
      ) {
        const card =
          missingCards[i];

        try {
          await importCard(
            card,
            set
          );

          totalImported++;

          console.log(
            `   ✓ ${card.localId} - ${card.name}`
          );
        } catch (error) {
          totalErrors++;

          const errorMessage =
            error instanceof Error
              ? error.message
              : String(error);

          failedCards.push({
            setId:
              set.source_id,

            setName:
              set.name,

            cardId:
              card.id,

            localId:
              card.localId,

            cardName:
              card.name,

            error:
              errorMessage,
          });

          console.error(
            `   ❌ ${card.localId} - ${card.name}`
          );

          console.error(
            `      ${errorMessage}`
          );
        }

        await sleep(
          REQUEST_DELAY
        );
      }
    } catch (error) {
      totalErrors++;

      console.error(
        `   ❌ ERREUR SET : ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
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
      "scripts/tcgdex-jp-errors.json",

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
      "scripts/tcgdex-jp-errors.json"
    );
  }

  // ------------------------------------------------
  // Résumé
  // ------------------------------------------------

  console.log(
    "\n\n=============================================="
  );

  console.log(
    " SYNCHRONISATION TERMINÉE"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `Sets traités        : ${totalSets}`
  );

  console.log(
    `Cartes trouvées     : ${totalCardsFound}`
  );

  console.log(
    `Déjà présentes      : ${totalAlreadyPresent}`
  );

  console.log(
    `Cartes manquantes   : ${totalMissing}`
  );

  console.log(
    `Cartes importées    : ${totalImported}`
  );

  console.log(
    `Erreurs             : ${totalErrors}`
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