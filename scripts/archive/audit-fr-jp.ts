import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: ".env.local",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

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
  local_id: string;
  number: string | null;
  name: string;
};

type MappingRow = {
  source_set_id: string;
  target_set_id: string;
  mapping_type: string;
  confidence: number | null;
  status: string;
};

async function getAllRows<T>(
  table: string,
  select: string
): Promise<T[]> {
  const results: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `Erreur ${table}: ${error.message}`
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    results.push(...(data as T[]));

    if (data.length < pageSize) {
      break;
    }
  }

  return results;
}

function normalizeNumber(
  value: string | null | undefined
): string {
  if (!value) return "";

  const cleaned = value.trim();

  if (/^\d+$/.test(cleaned)) {
    return String(Number(cleaned));
  }

  return cleaned.toUpperCase();
}

async function main() {
  console.log("\n==============================================");
  console.log(" AUDIT COMPLET DES SETS JP");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  // ------------------------------------------------
  // Chargement
  // ------------------------------------------------

  console.log("Chargement des données...\n");

  const sets = await getAllRows<SetRow>(
    "sets",
    "id, source_id, name, language"
  );

  const cards = await getAllRows<CardRow>(
    "cards",
    "id, set_id, source_id, local_id, number, name"
  );

  const mappings = await getAllRows<MappingRow>(
    "set_mappings",
    "source_set_id, target_set_id, mapping_type, confidence, status"
  );

  const jpSets = sets
    .filter((s) => s.language === "JP")
    .sort((a, b) =>
      a.source_id.localeCompare(b.source_id)
    );

  const frSets = sets.filter(
    (s) => s.language === "FR"
  );

  const jpCards = cards.filter(
    (card) =>
      jpSets.some(
        (set) => set.id === card.set_id
      )
  );

  const frCards = cards.filter(
    (card) =>
      frSets.some(
        (set) => set.id === card.set_id
      )
  );

  const setsById = new Map(
    sets.map((set) => [set.id, set])
  );

  // ------------------------------------------------
  // Cartes par set
  // ------------------------------------------------

  const cardsBySet = new Map<
    string,
    CardRow[]
  >();

  for (const card of cards) {
    const list =
      cardsBySet.get(card.set_id) ?? [];

    list.push(card);

    cardsBySet.set(card.set_id, list);
  }

  // ------------------------------------------------
  // Mappings par set JP
  // ------------------------------------------------

  const mappingsBySource = new Map<
    string,
    MappingRow[]
  >();

  for (const mapping of mappings) {
    if (mapping.status !== "verified") {
      continue;
    }

    const list =
      mappingsBySource.get(
        mapping.source_set_id
      ) ?? [];

    list.push(mapping);

    mappingsBySource.set(
      mapping.source_set_id,
      list
    );
  }

  // ------------------------------------------------
  // En-tête
  // ------------------------------------------------

  console.log(
    `Sets JP trouvés : ${jpSets.length}`
  );

  console.log(
    `Cartes JP : ${jpCards.length}`
  );

  console.log(
    `Mappings vérifiés : ${
      mappings.filter(
        (m) => m.status === "verified"
      ).length
    }\n`
  );

  console.log("==============================================");
  console.log(" LISTE EXHAUSTIVE DES SETS JP");
  console.log("==============================================\n");

  // ------------------------------------------------
  // Audit de TOUS les sets JP
  // ------------------------------------------------

  let withoutMapping = 0;
  let withoutCards = 0;
  let withMapping = 0;

  for (const jpSet of jpSets) {
    const jpSetCards =
      cardsBySet.get(jpSet.id) ?? [];

    const setMappings =
      mappingsBySource.get(jpSet.id) ?? [];

    const hasCards =
      jpSetCards.length > 0;

    const hasMapping =
      setMappings.length > 0;

    if (!hasMapping) {
      withoutMapping++;
    } else {
      withMapping++;
    }

    if (!hasCards) {
      withoutCards++;
    }

    let status = "";

    if (!hasMapping && !hasCards) {
      status = "⚪ SANS CARTES + SANS MAPPING";
    } else if (!hasMapping) {
      status = "🔴 CARTES MAIS SANS MAPPING";
    } else if (!hasCards) {
      status = "🟡 MAPPING MAIS 0 CARTE";
    } else {
      status = "🟢 OK";
    }

    console.log(
      `${jpSet.source_id.padEnd(10)} | ` +
      `${String(jpSetCards.length).padStart(4)} cartes | ` +
      `${hasMapping ? "MAPPING" : "         "} | ` +
      `${status}`
    );

    if (hasMapping) {
      for (const mapping of setMappings) {
        const target =
          setsById.get(
            mapping.target_set_id
          );

        console.log(
          `    → ${target?.source_id ?? "??"} | ` +
          `${mapping.mapping_type} | ` +
          `confidence=${mapping.confidence ?? "?"}`
        );
      }
    }
  }

  // ------------------------------------------------
  // Résumé
  // ------------------------------------------------

  console.log(
    "\n=============================================="
  );

  console.log(
    " RÉSUMÉ"
  );

  console.log(
    "==============================================\n"
  );

  console.log(
    `Sets JP total                 : ${jpSets.length}`
  );

  console.log(
    `Sets avec mapping              : ${withMapping}`
  );

  console.log(
    `Sets sans mapping              : ${withoutMapping}`
  );

  console.log(
    `Sets avec 0 carte              : ${withoutCards}`
  );

  console.log(
    `Sets avec cartes + sans mapping: ${
      jpSets.filter(
        (set) =>
          (cardsBySet.get(set.id)?.length ?? 0) > 0 &&
          (mappingsBySource.get(set.id)?.length ?? 0) === 0
      ).length
    }`
  );

  // ------------------------------------------------
  // Liste des sets sans mapping
  // ------------------------------------------------

  console.log(
    "\n=============================================="
  );

  console.log(
    " SETS JP SANS MAPPING"
  );

  console.log(
    "==============================================\n"
  );

  for (const jpSet of jpSets) {
    const cardCount =
      cardsBySet.get(jpSet.id)?.length ?? 0;

    const hasMapping =
      (mappingsBySource.get(jpSet.id)?.length ?? 0) > 0;

    if (!hasMapping) {
      console.log(
        `${jpSet.source_id.padEnd(10)} | ` +
        `${String(cardCount).padStart(4)} cartes | ` +
        `${jpSet.name}`
      );
    }
  }

  // ------------------------------------------------
  // Analyse des cartes orphelines
  // ------------------------------------------------

  console.log(
    "\n=============================================="
  );

  console.log(
    " CARTES JP AVEC set_id INCONNU"
  );

  console.log(
    "==============================================\n"
  );

  const jpCardSetIds = new Set(
    jpCards.map((card) => card.set_id)
  );

  const orphanSetIds = [
    ...jpCardSetIds
  ].filter(
    (setId) =>
      !setsById.has(setId)
  );

  console.log(
    `set_id inconnus : ${orphanSetIds.length}`
  );

  for (const setId of orphanSetIds) {
    const count =
      jpCards.filter(
        (card) =>
          card.set_id === setId
      ).length;

    console.log(
      `⚠️ ${setId} → ${count} cartes`
    );
  }

  console.log(
    "\n=============================================="
  );

  console.log(
    " FIN DE L'AUDIT"
  );

  console.log(
    " Aucune donnée n'a été modifiée."
  );

  console.log(
    "==============================================\n"
  );
}

main().catch((error) => {
  console.error(
    "\nERREUR FATALE :",
    error
  );

  process.exit(1);
});