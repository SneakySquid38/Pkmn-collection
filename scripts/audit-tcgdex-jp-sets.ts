import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: ".env.local",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Variables Supabase manquantes dans .env.local"
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

const TCGDEX_API = "https://api.tcgdex.net/v2";
const LANGUAGE = "ja";

type SupabaseSet = {
  id: string;
  source_id: string;
  name: string;
};

type AuditResult = {
  sourceId: string;
  name: string;
  httpStatus: number | null;
  cardCount: number | null;
  error: string | null;
};

async function getJapaneseSets(): Promise<SupabaseSet[]> {
  const { data, error } = await supabase
    .from("sets")
    .select("id, source_id, name")
    .eq("source", "tcgdex")
    .eq("language", "JP")
    .eq("product_type", "tcg")
    .order("source_id");

  if (error) {
    throw new Error(
      `Impossible de récupérer les sets JP : ${error.message}`
    );
  }

  return data ?? [];
}

async function auditSet(
  set: SupabaseSet
): Promise<AuditResult> {
  const url =
    `${TCGDEX_API}/${LANGUAGE}/sets/${encodeURIComponent(
      set.source_id
    )}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        sourceId: set.source_id,
        name: set.name,
        httpStatus: response.status,
        cardCount: null,
        error: response.statusText,
      };
    }

    const data = await response.json();

    return {
      sourceId: set.source_id,
      name: set.name,
      httpStatus: response.status,
      cardCount: Array.isArray(data.cards)
        ? data.cards.length
        : 0,
      error: null,
    };
  } catch (error) {
    return {
      sourceId: set.source_id,
      name: set.name,
      httpStatus: null,
      cardCount: null,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

async function main() {
  console.log("==============================================");
  console.log(" AUDIT TCGdex — SETS JP");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  const sets = await getJapaneseSets();

  console.log(
    `Sets JP trouvés dans Supabase : ${sets.length}\n`
  );

  if (sets.length === 0) {
    throw new Error("Aucun set JP trouvé.");
  }

  const results: AuditResult[] = [];

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];

    console.log(
      `[${i + 1}/${sets.length}] ${set.source_id} - ${set.name}`
    );

    const result = await auditSet(set);

    results.push(result);

    if (result.error) {
      console.log(
        `   ❌ HTTP ${result.httpStatus ?? "?"} - ${result.error}`
      );
    } else {
      console.log(
        `   ${result.cardCount} cartes`
      );
    }

    // Petite pause pour éviter de marteler l'API
    await new Promise((resolve) =>
      setTimeout(resolve, 200)
    );
  }

  const zeroCardSets = results.filter(
    (result) =>
      result.cardCount === 0 &&
      result.error === null
  );

  const errorSets = results.filter(
    (result) => result.error !== null
  );

  const positiveSets = results.filter(
    (result) =>
      result.cardCount !== null &&
      result.cardCount > 0
  );

  const totalCards = positiveSets.reduce(
    (sum, result) =>
      sum + (result.cardCount ?? 0),
    0
  );

  console.log("\n\n==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================");

  console.log(
    `Sets audités       : ${results.length}`
  );

  console.log(
    `Sets avec cartes   : ${positiveSets.length}`
  );

  console.log(
    `Sets avec 0 carte  : ${zeroCardSets.length}`
  );

  console.log(
    `Sets en erreur     : ${errorSets.length}`
  );

  console.log(
    `Total cartes TCGdex : ${totalCards}`
  );

  if (zeroCardSets.length > 0) {
    console.log("\n==============================================");
    console.log(" SETS AVEC 0 CARTE");
    console.log("==============================================");

    for (const result of zeroCardSets) {
      console.log(
        `${result.sourceId.padEnd(10)} | ${result.name}`
      );
    }
  }

  if (errorSets.length > 0) {
    console.log("\n==============================================");
    console.log(" SETS EN ERREUR");
    console.log("==============================================");

    for (const result of errorSets) {
      console.log(
        `${result.sourceId.padEnd(10)} | HTTP ${
          result.httpStatus ?? "?"
        } | ${result.error}`
      );
    }
  }

  console.log("\n==============================================");
  console.log(" FIN DE L'AUDIT");
  console.log(" Aucune donnée n'a été modifiée.");
  console.log("==============================================");
}

main().catch((error) => {
  console.error("\nERREUR FATALE :", error);
  process.exit(1);
});