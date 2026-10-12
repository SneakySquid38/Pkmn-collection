import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes.");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

const PAGE_SIZE = 1000;

async function fetchAllCards() {
  const cards: any[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;

    console.log(`Chargement des cartes ${from + 1} → ${to + 1}...`);

    const { data, error } = await supabase
      .from("cards")
      .select(
        "id,set_id,source,source_id,local_id,name,language,dex_ids"
      )
      .range(from, to);

    if (error) {
      throw error;
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

async function main() {
  console.log("");
  console.log("==============================================");
  console.log(" DIAGNOSTIC CARTES JP");
  console.log("==============================================");
  console.log("");

  const allCards = await fetchAllCards();

  console.log("");
  console.log(`Cartes récupérées : ${allCards.length}`);

  // -------------------------------------------------------
  // Languages
  // -------------------------------------------------------

  const languageCounts = new Map<string, number>();

  for (const card of allCards) {
    const language = String(card.language ?? "NULL");

    languageCounts.set(
      language,
      (languageCounts.get(language) ?? 0) + 1
    );
  }

  console.log("");
  console.log("LANGUAGES :");

  for (const [language, count] of languageCounts) {
    console.log(`  ${language} : ${count}`);
  }

  // -------------------------------------------------------
  // Recherche SV2a
  // -------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log(" RECHERCHE SV2a");
  console.log("==============================================");

  const sv2aCards = allCards.filter(
    (card) =>
      String(card.source_id ?? "").toLowerCase() ===
      "sv2a"
  );

  console.log(
    `Cartes avec source_id = SV2a : ${sv2aCards.length}`
  );

  for (const card of sv2aCards.slice(0, 10)) {
    console.log(
      `  ${card.local_id} — ${card.name} | language=${card.language} | source=${card.source}`
    );
  }

  // -------------------------------------------------------
  // SV2a 003
  // -------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log(" RECHERCHE SV2a 003");
  console.log("==============================================");

  const target = sv2aCards.filter(
    (card) =>
      String(card.local_id).trim() === "003"
  );

  console.log(
    `SV2a 003 trouvées : ${target.length}`
  );

  for (const card of target) {
    console.log("");
    console.log(`ID       : ${card.id}`);
    console.log(`set_id   : ${card.set_id}`);
    console.log(`source   : ${card.source}`);
    console.log(`source_id: ${card.source_id}`);
    console.log(`local_id : ${card.local_id}`);
    console.log(`name     : ${card.name}`);
    console.log(`language : ${card.language}`);
    console.log(
      `dex_ids  : ${JSON.stringify(card.dex_ids)}`
    );

    // -----------------------------------------------------
    // card_pokemon
    // -----------------------------------------------------

    const { data: relations, error: relationError } =
      await supabase
        .from("card_pokemon")
        .select(
          "card_id,pokemon_entity_id,dex_position"
        )
        .eq("card_id", card.id);

    if (relationError) {
      throw relationError;
    }

    console.log(
      `card_pokemon : ${relations?.length ?? 0} relation(s)`
    );

    if (!relations?.length) {
      console.log(
        "⚠️ Aucune relation card_pokemon."
      );
      continue;
    }

    for (const relation of relations) {
      const { data: pokemon, error: pokemonError } =
        await supabase
          .from("pokemon_entities")
          .select("id,dex_id,name_fr")
          .eq("id", relation.pokemon_entity_id)
          .maybeSingle();

      if (pokemonError) {
        throw pokemonError;
      }

      console.log(
        `   → #${pokemon?.dex_id ?? "?"} ${
          pokemon?.name_fr ?? "?"
        }`
      );
    }
  }

  console.log("");
  console.log("==============================================");
  console.log(" FIN DU DIAGNOSTIC");
  console.log("==============================================");
}

main().catch((error) => {
  console.error("");
  console.error("❌ ERREUR");
  console.error(error);
  process.exit(1);
});