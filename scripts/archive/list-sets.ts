import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function getSets(language: "FR" | "JP") {
  const { data, error } = await supabase
    .from("sets")
    .select(
      "id, code, source_id, name, series, language, region, total_cards, release_date, product_type"
    )
    .eq("source", "tcgdex")
    .eq("language", language)
    .order("release_date", { ascending: true });

  if (error) {
    throw new Error(
      `Erreur récupération ${language}: ${error.message}`
    );
  }

  return data ?? [];
}

async function main() {
  const fr = await getSets("FR");
  const jp = await getSets("JP");

  console.log("==============================================");
  console.log(" SETS FRANÇAIS");
  console.log("==============================================\n");

  console.table(
    fr.map((set) => ({
      code: set.code,
      source_id: set.source_id,
      name: set.name,
      series: set.series,
      cards: set.total_cards,
      release: set.release_date,
      type: set.product_type,
    }))
  );

  console.log("\n==============================================");
  console.log(" SETS JAPONAIS");
  console.log("==============================================\n");

  console.table(
    jp.map((set) => ({
      code: set.code,
      source_id: set.source_id,
      name: set.name,
      series: set.series,
      cards: set.total_cards,
      release: set.release_date,
      type: set.product_type,
    }))
  );

  console.log("\n==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================");

  console.log(`Sets FR : ${fr.length}`);
  console.log(`Sets JP : ${jp.length}`);
}

main().catch((error) => {
  console.error("\n❌ ERREUR");
  console.error(error);
  process.exit(1);
});