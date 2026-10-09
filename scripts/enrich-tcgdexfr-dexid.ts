import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const TCGDEX_API = "https://api.tcgdex.net/v2";
const LANGUAGE = "fr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

const RETRIES = 5;
const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry<T>(
  url: string,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return await response.json();
      }

      const retryable =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!retryable) {
        throw new Error(
          `${response.status} ${response.statusText}`
        );
      }

      console.log(
        `  ${label} → HTTP ${response.status}, tentative ${attempt}/${RETRIES}`
      );

      await sleep(1000 * attempt);
    } catch (error) {
      lastError = error;

      if (attempt < RETRIES) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw lastError ?? new Error(`Échec : ${label}`);
}

type TCGdexCard = {
  id: string;
  localId: string;
  name: string;
  dexId?: number[];
};

type CardRow = {
  id: string;
  source_id: string;
  set_id: string;
};

type SetRow = {
  id: string;
  source_id: string;
};

async function getCardsWithoutDexId(): Promise<{
  cards: CardRow[];
  sets: Map<string, string>;
}> {
  const cards: CardRow[] = [];
  const sets = new Map<string, string>();

  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select(`
        id,
        source_id,
        set_id,
        sets!inner (
          source_id
        )
      `)
      .eq("source", "tcgdex")
      .eq("language", "FR")
      .is("dex_ids", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data as any[]) {
      cards.push({
        id: row.id,
        source_id: row.source_id,
        set_id: row.set_id,
      });

      if (row.sets?.source_id) {
        sets.set(row.set_id, row.sets.source_id);
      }
    }

    console.log(
      `Cartes récupérées : ${cards.length}`
    );

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return { cards, sets };
}

async function updateDexIds(
  cardId: string,
  dexIds: number[]
) {
  const { error } = await supabase
    .from("cards")
    .update({
      dex_ids: dexIds,
    })
    .eq("id", cardId);

  if (error) {
    throw error;
  }
}

async function main() {
  console.log("==============================================");
  console.log("ENRICHISSEMENT TCGDEX — DEX ID FR");
  console.log("==============================================");
  console.log("");

  const { cards, sets } =
    await getCardsWithoutDexId();

  console.log("");
  console.log(
    `Cartes FR à enrichir : ${cards.length}`
  );

  console.log(
    `Sets concernés : ${sets.size}`
  );

  if (cards.length === 0) {
    console.log("");
    console.log("Toutes les cartes possèdent déjà dex_ids.");
    return;
  }

  let processed = 0;
  let updated = 0;
  let noDexId = 0;
  let errors = 0;

  for (const cardRow of cards) {
    try {
      const setSourceId = sets.get(cardRow.set_id);

      if (!setSourceId) {
        throw new Error(
          `Set introuvable pour ${cardRow.source_id}`
        );
      }

      /*
       * source_id = setId-localId
       *
       * On utilise le set_id connu en DB et on récupère
       * le localId depuis la fin du source_id.
       */
      const prefix = `${setSourceId}-`;

      if (!cardRow.source_id.startsWith(prefix)) {
        throw new Error(
          `source_id inattendu : ${cardRow.source_id}`
        );
      }

      const localId =
        cardRow.source_id.substring(prefix.length);

      const url =
        `${TCGDEX_API}/${LANGUAGE}/sets/` +
        `${setSourceId}/${encodeURIComponent(localId)}`;

      const card =
        await fetchJsonWithRetry<TCGdexCard>(
          url,
          cardRow.source_id
        );

      const dexIds = card.dexId ?? [];

      await updateDexIds(
        cardRow.id,
        dexIds
      );

      if (dexIds.length > 0) {
        updated++;
      } else {
        noDexId++;
      }

      processed++;

      console.log(
        `[${processed}/${cards.length}] ` +
        `${cardRow.source_id} → ` +
        `${dexIds.length ? dexIds.join(", ") : "aucun dexId"}`
      );

    } catch (error) {
      errors++;

      console.error(
        `ERREUR ${cardRow.source_id} :`,
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  console.log("");
  console.log("==============================================");
  console.log("TERMINÉ");
  console.log("==============================================");
  console.log(`Cartes traitées : ${processed}`);
  console.log(`Avec dexId      : ${updated}`);
  console.log(`Sans dexId       : ${noDexId}`);
  console.log(`Erreurs          : ${errors}`);
}

main().catch((error) => {
  console.error("");
  console.error("ERREUR FATALE");
  console.error(error);
  process.exit(1);
});