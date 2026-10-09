import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_SOURCE_IDS = [
  "SM3+",
  "S4a",
  "ADV2",
  "S4",
];

type SetRow = {
  id: string;
  source_id: string;
  name: string;
  language: string;
};

type CardRow = {
  id: string;
  set_id: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string;
};

async function getAllCards(): Promise<CardRow[]> {
  const results: CardRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("cards")
      .select(
        "id,set_id,source_id,local_id,number,name,language",
      )
      .eq("language", "JP")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Erreur cards : ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    results.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  return results;
}

async function main() {
  console.log("==============================================");
  console.log(" DIAGNOSTIC CARTES JP ORPHELINES");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  // ----------------------------------------------------------
  // Tous les sets
  // ----------------------------------------------------------

  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("id,source_id,name,language")
    .eq("language", "JP");

  if (setsError) {
    throw new Error(`Erreur sets : ${setsError.message}`);
  }

  const jpSets = sets ?? [];

  console.log(`Sets JP en base : ${jpSets.length}`);

  // ----------------------------------------------------------
  // Toutes les cartes JP
  // ----------------------------------------------------------

  console.log("Chargement des cartes JP...");

  const cards = await getAllCards();

  console.log(`Cartes JP : ${cards.length}\n`);

  const setsById = new Map<string, SetRow>();

  for (const set of jpSets) {
    setsById.set(set.id, set);
  }

  // ----------------------------------------------------------
  // Pour chaque set problématique
  // ----------------------------------------------------------

  for (const sourceId of TEST_SOURCE_IDS) {
    console.log("\n==============================================");
    console.log(` SOURCE_ID : ${sourceId}`);
    console.log("==============================================");

    const matchingSets = jpSets.filter(
      (set) => set.source_id === sourceId,
    );

    console.log(
      `Sets JP avec source_id "${sourceId}" : ${matchingSets.length}`,
    );

    for (const set of matchingSets) {
      console.log(`\nSET`);
      console.log(`  id        : ${set.id}`);
      console.log(`  source_id : ${set.source_id}`);
      console.log(`  nom       : ${set.name}`);

      const linkedCards = cards.filter(
        (card) => card.set_id === set.id,
      );

      console.log(
        `  cartes avec ce set_id : ${linkedCards.length}`,
      );
    }

    // --------------------------------------------------------
    // Cartes dont source_id ressemble au set recherché
    // --------------------------------------------------------

    const matchingCards = cards.filter(
      (card) =>
        card.source_id.toUpperCase().includes(
          sourceId.toUpperCase(),
        ),
    );

    console.log(
      `\nCartes dont source_id contient "${sourceId}" : ${matchingCards.length}`,
    );

    if (matchingCards.length === 0) {
      console.log("  → Aucune carte trouvée.");
      continue;
    }

    // --------------------------------------------------------
    // Regroupement par set_id
    // --------------------------------------------------------

    const cardsBySetId = new Map<string, CardRow[]>();

    for (const card of matchingCards) {
      const existing = cardsBySetId.get(card.set_id) ?? [];
      existing.push(card);
      cardsBySetId.set(card.set_id, existing);
    }

    console.log("\nRépartition des cartes par set_id :\n");

    for (const [setId, setCards] of cardsBySetId) {
      const set = setsById.get(setId);

      console.log(`  set_id : ${setId}`);
      console.log(`  cartes : ${setCards.length}`);

      if (set) {
        console.log(
          `  set    : [${set.language}] ${set.source_id} | ${set.name}`,
        );
      } else {
        console.log(
          `  ⚠️ set_id ABSENT de la table sets`,
        );
      }

      console.log(
        `  exemples : ${setCards
          .slice(0, 5)
          .map(
            (card) =>
              `${card.source_id} / ${card.number ?? card.local_id ?? "?"}`,
          )
          .join(", ")}`,
      );

      console.log("");
    }
  }

  console.log("\n==============================================");
  console.log(" FIN DU DIAGNOSTIC");
  console.log(" Aucune donnée n'a été modifiée.");
  console.log("==============================================");
}

main().catch((error) => {
  console.error("\n❌ ERREUR");
  console.error(error);
  process.exit(1);
});