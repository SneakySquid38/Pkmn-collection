import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_SET_IDS = [
  "SM3+",
  "S4a",
  "ADV2",
  "S4",
  "SV2a",
  "PMCG1",
];

type SetRow = {
  id: string;
  source_id: string;
  name: string;
  language: string;
};

type MappingRow = {
  id: string;
  source_set_id: string;
  target_set_id: string;
  mapping_type: string;
  status: string;
};

async function main() {
  console.log("==============================================");
  console.log(" DIAGNOSTIC SET MAPPINGS → CARTES");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  // ----------------------------------------------------------
  // 1. Récupérer les sets
  // ----------------------------------------------------------

  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("id,source_id,name,language")
    .in("source_id", TEST_SET_IDS);

  if (setsError) {
    throw new Error(`Erreur sets : ${setsError.message}`);
  }

  console.log(`Sets trouvés avec source_id : ${sets?.length ?? 0}\n`);

  for (const set of sets ?? []) {
    console.log(
      `[${set.language}] source_id=${set.source_id} | id=${set.id} | ${set.name}`,
    );
  }

  // ----------------------------------------------------------
  // 2. Récupérer les mappings concernés
  // ----------------------------------------------------------

  const { data: mappings, error: mappingsError } = await supabase
    .from("set_mappings")
    .select(
      "id,source_set_id,target_set_id,mapping_type,status",
    );

  if (mappingsError) {
    throw new Error(`Erreur mappings : ${mappingsError.message}`);
  }

  const relevantMappings = (mappings ?? []).filter((mapping) => {
    return (
      sets?.some((set) => set.id === mapping.source_set_id) ||
      sets?.some((set) => set.id === mapping.target_set_id)
    );
  });

  console.log(
    `\nMappings concernés : ${relevantMappings.length}\n`,
  );

  // ----------------------------------------------------------
  // 3. Pour chaque set JP, vérifier la chaîne complète
  // ----------------------------------------------------------

  for (const sourceId of TEST_SET_IDS) {
    const jpSets =
      (sets ?? []).filter(
        (set) =>
          set.source_id === sourceId &&
          set.language === "JP",
      );

    if (jpSets.length === 0) {
      console.log(`\n❌ Aucun set JP trouvé pour source_id=${sourceId}`);
      continue;
    }

    for (const jpSet of jpSets) {
      console.log("\n----------------------------------------------");
      console.log(`JP : ${jpSet.source_id} | ${jpSet.name}`);
      console.log("----------------------------------------------");

      console.log(`sets.id = ${jpSet.id}`);

      // Cartes reliées à ce set
      const { count: cardCount, error: cardError } = await supabase
        .from("cards")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("set_id", jpSet.id);

      if (cardError) {
        console.log(
          `❌ Erreur cartes : ${cardError.message}`,
        );
      } else {
        console.log(`cards.set_id = ${cardCount ?? 0} cartes`);
      }

      // Mappings dont ce set est la source
      const sourceMappings = (mappings ?? []).filter(
        (mapping) => mapping.source_set_id === jpSet.id,
      );

      if (sourceMappings.length === 0) {
        console.log("⚠️ Aucun mapping depuis ce set JP");
        continue;
      }

      for (const mapping of sourceMappings) {
        const targetSet = (sets ?? []).find(
          (set) => set.id === mapping.target_set_id,
        );

        // Si le set cible n'est pas dans notre petite sélection,
        // on le récupère directement.
        let resolvedTarget = targetSet;

        if (!resolvedTarget) {
          const { data, error } = await supabase
            .from("sets")
            .select("id,source_id,name,language")
            .eq("id", mapping.target_set_id)
            .maybeSingle();

          if (!error) {
            resolvedTarget = data ?? undefined;
          }
        }

        console.log("\n  MAPPING");
        console.log(`  id           : ${mapping.id}`);
        console.log(`  type         : ${mapping.mapping_type}`);
        console.log(`  status       : ${mapping.status}`);

        console.log(
          `  source_set_id: ${mapping.source_set_id}`,
        );

        console.log(
          `  target_set_id: ${mapping.target_set_id}`,
        );

        if (resolvedTarget) {
          console.log(
            `  cible        : [${resolvedTarget.language}] ${resolvedTarget.source_id} | ${resolvedTarget.name}`,
          );

          const { count: targetCardCount, error: targetCardError } =
            await supabase
              .from("cards")
              .select("id", {
                count: "exact",
                head: true,
              })
              .eq("set_id", resolvedTarget.id);

          if (targetCardError) {
            console.log(
              `  ❌ Erreur cartes cible : ${targetCardError.message}`,
            );
          } else {
            console.log(
              `  cartes cible : ${targetCardCount ?? 0}`,
            );
          }
        } else {
          console.log("  ❌ SET CIBLE INTROUVABLE");
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 4. Diagnostic supplémentaire :
  //    chercher les sets JP ayant des cartes mais aucun mapping
  // ----------------------------------------------------------

  console.log("\n==============================================");
  console.log(" VÉRIFICATION INVERSÉE");
  console.log("==============================================\n");

  const { data: jpSets, error: jpError } = await supabase
    .from("sets")
    .select("id,source_id,name,language")
    .eq("language", "JP");

  if (jpError) {
    throw new Error(`Erreur sets JP : ${jpError.message}`);
  }

  const mappedSourceIds = new Set(
    (mappings ?? []).map((mapping) => mapping.source_set_id),
  );

  let suspicious = 0;

  for (const set of jpSets ?? []) {
    if (mappedSourceIds.has(set.id)) continue;

    const { count } = await supabase
      .from("cards")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("set_id", set.id);

    if ((count ?? 0) > 0) {
      suspicious++;

      console.log(
        `⚠️ JP avec cartes mais sans mapping : ${set.source_id} | ${set.name} | ${count} cartes`,
      );
    }
  }

  console.log(
    `\nSets JP avec cartes mais sans mapping : ${suspicious}`,
  );

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