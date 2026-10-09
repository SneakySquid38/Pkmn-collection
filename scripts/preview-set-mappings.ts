import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const mappings = [
  {
    jp: "PMCG1",
    fr: "base1",
    type: "direct",
    confidence: 100,
    label: "Expansion Pack japonais → Set de Base français",
  },
  {
    jp: "PMCG2",
    fr: "base2",
    type: "direct",
    confidence: 100,
    label: "Pokémon Jungle japonais → Jungle français",
  },
  {
    jp: "PMCG3",
    fr: "base3",
    type: "direct",
    confidence: 100,
    label: "Fossil japonais → Fossile français",
  },
  {
    jp: "PMCG4",
    fr: "base5",
    type: "direct",
    confidence: 100,
    label: "Rocket Gang japonais → Team Rocket français",
  },
  {
    jp: "E1",
    fr: "ecard1",
    type: "direct",
    confidence: 100,
    label: "E1 japonais → Expedition français",
  },
  {
    jp: "E2",
    fr: "ecard2",
    type: "direct",
    confidence: 100,
    label: "E2 japonais → Aquapolis français",
  },
  {
    jp: "SV2a",
    fr: "sv03.5",
    type: "direct",
    confidence: 100,
    label: "Pokémon Card 151 japonais → 151 français",
  },
  {
    jp: "S12a",
    fr: "swsh12.5",
    type: "partial",
    confidence: 100,
    label: "VSTAR Universe japonais → Zénith Suprême français",
  },
  {
    jp: "M2a",
    fr: "me02.5",
    type: "partial",
    confidence: 100,
    label: "MEGA Dream ex japonais → Héros Transcendants français",
  },
];

async function main() {
  console.log("\n=== PREVIEW DES CORRESPONDANCES JP → FR ===\n");

  let errors = 0;

  for (const mapping of mappings) {
    const { data: jpSet, error: jpError } = await supabase
      .from("sets")
      .select("id, code, name, language, region, product_type")
      .eq("code", mapping.jp)
      .eq("language", "JP")
      .maybeSingle();

    const { data: frSet, error: frError } = await supabase
      .from("sets")
      .select("id, code, name, language, region, product_type")
      .eq("code", mapping.fr)
      .eq("language", "FR")
      .maybeSingle();

    console.log("────────────────────────────────────────────");

    console.log(`\n${mapping.jp} → ${mapping.fr}`);
    console.log(mapping.label);

    if (jpError) {
      console.log("❌ Erreur recherche JP :", jpError.message);
      errors++;
      continue;
    }

    if (frError) {
      console.log("❌ Erreur recherche FR :", frError.message);
      errors++;
      continue;
    }

    if (!jpSet) {
      console.log(`❌ SET JP INTROUVABLE : ${mapping.jp}`);
      errors++;
    } else {
      console.log("🇯🇵 JP :", jpSet.code, "—", jpSet.name);
      console.log(
        `   id=${jpSet.id} | language=${jpSet.language} | region=${jpSet.region} | type=${jpSet.product_type}`
      );
    }

    if (!frSet) {
      console.log(`❌ SET FR INTROUVABLE : ${mapping.fr}`);
      errors++;
    } else {
      console.log("🇫🇷 FR :", frSet.code, "—", frSet.name);
      console.log(
        `   id=${frSet.id} | language=${frSet.language} | region=${frSet.region} | type=${frSet.product_type}`
      );
    }

    if (jpSet && frSet) {
      console.log(
        `\n✅ Correspondance trouvée | type=${mapping.type} | confiance=${mapping.confidence}%`
      );
    }
  }

  console.log("\n────────────────────────────────────────────");
  console.log(`\nNombre de correspondances : ${mappings.length}`);
  console.log(`Erreurs : ${errors}`);

  if (errors === 0) {
    console.log("\n🟢 PREVIEW OK");
    console.log("Aucune donnée n'a été modifiée.");
    console.log("Les 9 correspondances existent bien dans Supabase.");
  } else {
    console.log("\n🔴 PREVIEW ÉCHOUÉ");
    console.log("Aucune donnée n'a été modifiée.");
  }
}

main().catch((error) => {
  console.error("\nErreur fatale :", error);
  process.exit(1);
});