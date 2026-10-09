import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Correspondances déjà vérifiées.
// IMPORTANT : ce tableau ne sert qu'à classer l'audit.
// Le script n'écrit rien dans Supabase.
const verifiedMappings = [
  {
    jp: "PMCG1",
    fr: "base1",
    type: "direct",
  },
  {
    jp: "PMCG2",
    fr: "base2",
    type: "direct",
  },
  {
    jp: "PMCG3",
    fr: "base3",
    type: "direct",
  },
  {
    jp: "PMCG4",
    fr: "base5",
    type: "direct",
  },
  {
    jp: "E1",
    fr: "ecard1",
    type: "direct",
  },
  {
    jp: "E2",
    fr: "ecard2",
    type: "direct",
  },
  {
    jp: "SV2a",
    fr: "sv03.5",
    type: "direct",
  },
  {
    jp: "S12a",
    fr: "swsh12.5",
    type: "partial",
  },
  {
    jp: "M2a",
    fr: "me02.5",
    type: "partial",
  },
];

async function main() {
  console.log("\n==============================================");
  console.log(" AUDIT DES CORRESPONDANCES DE SETS JP → FR");
  console.log("==============================================\n");

  // --------------------------------------------------
  // 1. Récupération des sets JP
  // --------------------------------------------------

  const { data: jpSets, error: jpError } = await supabase
    .from("sets")
    .select(
      "id, code, name, language, region, product_type, release_date, total_cards"
    )
    .eq("language", "JP")
    .order("release_date", { ascending: true });

  if (jpError) {
    throw new Error(`Erreur récupération sets JP : ${jpError.message}`);
  }

  // --------------------------------------------------
  // 2. Récupération des sets FR
  // --------------------------------------------------

  const { data: frSets, error: frError } = await supabase
    .from("sets")
    .select(
      "id, code, name, language, region, product_type, release_date, total_cards"
    )
    .eq("language", "FR")
    .order("release_date", { ascending: true });

  if (frError) {
    throw new Error(`Erreur récupération sets FR : ${frError.message}`);
  }

  // --------------------------------------------------
  // 3. Récupération des mappings déjà présents
  // --------------------------------------------------

  const { data: existingMappings, error: mappingError } = await supabase
    .from("set_mappings")
    .select(
      "source_set_id, target_set_id, mapping_type, confidence, status"
    );

  if (mappingError) {
    throw new Error(
      `Erreur récupération set_mappings : ${mappingError.message}`
    );
  }

  const jpById = new Map((jpSets ?? []).map((set) => [set.id, set]));
  const frById = new Map((frSets ?? []).map((set) => [set.id, set]));

  // --------------------------------------------------
  // 4. Affichage général
  // --------------------------------------------------

  console.log(`Sets JP présents : ${jpSets?.length ?? 0}`);
  console.log(`Sets FR présents : ${frSets?.length ?? 0}`);
  console.log(
    `Mappings déjà enregistrés : ${existingMappings?.length ?? 0}`
  );

  console.log("\n==============================================");
  console.log(" DÉTAIL DES SETS JP");
  console.log("==============================================\n");

  let verifiedCount = 0;
  let partialCount = 0;
  let toResearchCount = 0;

  for (const jpSet of jpSets ?? []) {
    const known = verifiedMappings.find(
      (mapping) => mapping.jp === jpSet.code
    );

    if (known) {
      const frSet = frSets?.find(
        (set) => set.code === known.fr
      );

      if (known.type === "partial") {
        partialCount++;

        console.log(
          `⚠️  ${jpSet.code} — ${jpSet.name}`
        );

        console.log(
          `    → PARTIAL : ${known.fr}${
            frSet ? ` — ${frSet.name}` : ""
          }`
        );
      } else {
        verifiedCount++;

        console.log(
          `✅ ${jpSet.code} — ${jpSet.name}`
        );

        console.log(
          `    → ${known.fr}${
            frSet ? ` — ${frSet.name}` : ""
          }`
        );
      }

      continue;
    }

    toResearchCount++;

    console.log(
      `🔍 ${jpSet.code} — ${jpSet.name}`
    );

    console.log(
      `    → CORRESPONDANCE À RECHERCHER`
    );
  }

  // --------------------------------------------------
  // 5. Résumé
  // --------------------------------------------------

  console.log("\n==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================\n");

  console.log(`🇯🇵 Sets JP analysés       : ${jpSets?.length ?? 0}`);
  console.log(`🇫🇷 Sets FR disponibles   : ${frSets?.length ?? 0}`);
  console.log(`✅ Directement vérifiés   : ${verifiedCount}`);
  console.log(`⚠️  Partiels               : ${partialCount}`);
  console.log(`🔍 À rechercher            : ${toResearchCount}`);

  // --------------------------------------------------
  // 6. Mappings présents en DB mais absents du tableau
  // --------------------------------------------------

  console.log("\n==============================================");
  console.log(" CONTRÔLE DES MAPPINGS EXISTANTS");
  console.log("==============================================\n");

  for (const mapping of existingMappings ?? []) {
    const jpSet = jpById.get(mapping.source_set_id);
    const frSet = frById.get(mapping.target_set_id);

    console.log(
      `${jpSet?.code ?? "UNKNOWN"} → ${frSet?.code ?? "UNKNOWN"}`
    );

    console.log(
      `  type=${mapping.mapping_type} | confidence=${mapping.confidence}% | status=${mapping.status}`
    );
  }

  console.log("\n==============================================");
  console.log(" FIN DE L'AUDIT");
  console.log("==============================================");

  console.log(
    "\n🟢 Aucune donnée n'a été modifiée par ce script."
  );
}

main().catch((error) => {
  console.error("\n🔴 ERREUR :", error.message);
  process.exit(1);
});