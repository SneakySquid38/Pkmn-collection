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

async function main() {
  console.log("=== Vérification pokemon_entities ===\n");

  const { data, error } = await supabase
    .from("pokemon_entities")
    .select("dex_id, name_fr")
    .order("dex_id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`Nombre total : ${data.length}`);

  console.log("\nDerniers Pokémon présents :");

  for (const pokemon of data.slice(-30)) {
    console.log(
      `#${pokemon.dex_id} - ${pokemon.name_fr}`
    );
  }

  console.log("\nRecherche des #1001 à #1025 :");

  for (let dexId = 1001; dexId <= 1025; dexId++) {
    const pokemon = data.find((p) => p.dex_id === dexId);

    if (pokemon) {
      console.log(
        `✅ #${dexId} - ${pokemon.name_fr}`
      );
    } else {
      console.log(
        `❌ #${dexId} - ABSENT`
      );
    }
  }
}

main().catch((error) => {
  console.error("\n❌ ERREUR :", error);
  process.exit(1);
});