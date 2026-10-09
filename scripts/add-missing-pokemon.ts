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

const pokemon = [
  { dex_id: 1001, name_fr: "Chongjian" },
  { dex_id: 1002, name_fr: "Baojian" },
  { dex_id: 1003, name_fr: "Dinglu" },
  { dex_id: 1004, name_fr: "Yuyu" },
  { dex_id: 1005, name_fr: "Rugit-Lune" },
  { dex_id: 1006, name_fr: "Garde-de-Fer" },
  { dex_id: 1007, name_fr: "Koraidon" },
  { dex_id: 1008, name_fr: "Miraidon" },
  { dex_id: 1009, name_fr: "Serpente-Eau" },
  { dex_id: 1010, name_fr: "Vert-de-Fer" },
  { dex_id: 1011, name_fr: "Pomdramour" },
  { dex_id: 1012, name_fr: "Poltchageist" },
  { dex_id: 1013, name_fr: "Théffroyable" },
  { dex_id: 1014, name_fr: "Félicanis" },
  { dex_id: 1015, name_fr: "Fortusimia" },
  { dex_id: 1016, name_fr: "Favianos" },
  { dex_id: 1017, name_fr: "Ogerpon" },
  { dex_id: 1018, name_fr: "Pondralugon" },
  { dex_id: 1019, name_fr: "Pomdorochi" },
  { dex_id: 1020, name_fr: "Feu-Perçant" },
  { dex_id: 1021, name_fr: "Ire-Foudre" },
  { dex_id: 1022, name_fr: "Roc-de-Fer" },
  { dex_id: 1023, name_fr: "Chef-de-Fer" },
  { dex_id: 1024, name_fr: "Terapagos" },
  { dex_id: 1025, name_fr: "Pêchaminus" },
];

async function main() {
  console.log("=== Ajout des Pokémon #1001 à #1025 ===\n");

  const dexIds = pokemon.map((p) => p.dex_id);

  const { data: existing, error: existingError } = await supabase
    .from("pokemon_entities")
    .select("dex_id, name_fr")
    .in("dex_id", dexIds);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingIds = new Set(
    (existing ?? []).map((p) => p.dex_id)
  );

  const missing = pokemon.filter(
    (p) => !existingIds.has(p.dex_id)
  );

  console.log(`Pokémon prévus : ${pokemon.length}`);
  console.log(`Déjà présents : ${existing?.length ?? 0}`);
  console.log(`À insérer : ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("✅ Tous les Pokémon sont déjà présents.");
    return;
  }

  console.log("Pokémon qui vont être ajoutés :\n");

  for (const p of missing) {
    console.log(`#${p.dex_id} - ${p.name_fr}`);
  }

  console.log("\nInsertion...\n");

  const { error: insertError } = await supabase
    .from("pokemon_entities")
    .insert(missing);

  if (insertError) {
    throw new Error(insertError.message);
  }

  console.log(
    `✅ ${missing.length} Pokémon ajoutés avec succès.`
  );
}

main().catch((error) => {
  console.error("\n❌ ERREUR :", error);
  process.exit(1);
});