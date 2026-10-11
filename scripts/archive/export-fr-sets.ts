import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from("sets")
    .select(
      "id, code, name, series, language, region, product_type, release_date, total_cards"
    )
    .eq("language", "FR")
    .order("release_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const outputPath = "fr-sets.json";

  fs.writeFileSync(
    outputPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log(
    `\n✅ ${data?.length ?? 0} sets FR exportés dans : ${outputPath}`
  );
}

main().catch((error) => {
  console.error("🔴 ERREUR :", error.message);
  process.exit(1);
});