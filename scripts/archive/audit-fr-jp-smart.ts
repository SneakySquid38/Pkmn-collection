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

// --------------------------------------------------
// Types
// --------------------------------------------------

type SetRow = {
  id: string;
  source_id: string;
  name: string;
  language: string;
};

type MappingRow = {
  source_set_id: string;
  target_set_id: string;
  mapping_type:
    | "direct"
    | "combined"
    | "partial"
    | "official"
    | "manual";
  confidence: number | null;
  status: string;
  evidence: string | null;
};

type CardRow = {
  id: string;
  set_id: string;
  source_id: string;
  local_id: string;
  number: string | null;
  name: string;
};

type AuditStatus =
  | "MATCH PARFAIT"
  | "JP INCOMPLET TCGDEX"
  | "DIFFÉRENCE NUMÉROTATION"
  | "MAPPING COMBINÉ"
  | "MAPPING PARTIEL"
  | "JP SANS CARTES"
  | "ANOMALIE";

// --------------------------------------------------
// Pagination Supabase
// --------------------------------------------------

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
        `Erreur lecture ${table} : ${error.message}`
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

// --------------------------------------------------
// Normalisation des numéros
// --------------------------------------------------

function normalizeNumber(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  const cleaned = value.trim();

  // 001 → 1
  // 010 → 10
  if (/^\d+$/.test(cleaned)) {
    return String(Number(cleaned));
  }

  return cleaned.toUpperCase();
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  console.log(
    "=============================================="
  );
  console.log(
    " AUDIT INTELLIGENT FR ↔ JP"
  );
  console.log(
    " Lecture seule — aucune modification"
  );
  console.log(
    "==============================================\n"
  );

  // ------------------------------------------------
  // Chargement
  // ------------------------------------------------

  console.log("Chargement des sets...");

  const sets = await getAllRows<SetRow>(
    "sets",
    "id, source_id, name, language"
  );

  const jpSets = sets.filter(
    (set) => set.language === "JP"
  );

  const frSets = sets.filter(
    (set) => set.language === "FR"
  );

  console.log(
    `Sets JP : ${jpSets.length}`
  );

  console.log(
    `Sets FR : ${frSets.length}`
  );

  console.log("\nChargement des cartes...");

  const cards = await getAllRows<CardRow>(
    "cards",
    "id, set_id, source_id, local_id, number, name"
  );

  const jpCards = cards.filter(
    (card) =>
      jpSets.some((set) => set.id === card.set_id)
  );

  const frCards = cards.filter(
    (card) =>
      frSets.some((set) => set.id === card.set_id)
  );

  console.log(
    `Cartes JP : ${jpCards.length}`
  );

  console.log(
    `Cartes FR : ${frCards.length}`
  );

  console.log("\nChargement des mappings...");

  const mappings =
    await getAllRows<MappingRow>(
      "set_mappings",
      "source_set_id, target_set_id, mapping_type, confidence, status, evidence"
    );

  const verifiedMappings =
    mappings.filter(
      (mapping) =>
        mapping.status === "verified"
    );

  console.log(
    `Mappings vérifiés : ${verifiedMappings.length}`
  );

  // ------------------------------------------------
  // Index
  // ------------------------------------------------

  const setsById = new Map(
    sets.map((set) => [set.id, set])
  );

  const cardsBySet = new Map<
    string,
    CardRow[]
  >();

  for (const card of cards) {
    const existing =
      cardsBySet.get(card.set_id) ?? [];

    existing.push(card);

    cardsBySet.set(
      card.set_id,
      existing
    );
  }

  // ------------------------------------------------
  // Résultats
  // ------------------------------------------------

  type AuditResult = {
    jpSet: SetRow;
    frSets: SetRow[];
    mapping: MappingRow;
    jpCount: number;
    frCount: number;
    commonCount: number;
    jpOnly: string[];
    frOnly: string[];
    status: AuditStatus;
  };

  const results: AuditResult[] = [];

  // ------------------------------------------------
  // Audit mapping par mapping
  // ------------------------------------------------

  for (const mapping of verifiedMappings) {
    const jpSet =
      setsById.get(
        mapping.source_set_id
      );

    if (!jpSet || jpSet.language !== "JP") {
      continue;
    }

    const targetSet =
      setsById.get(
        mapping.target_set_id
      );

    if (!targetSet) {
      continue;
    }

    // ----------------------------------------------
    // Sets FR concernés
    // ----------------------------------------------

    let targetSets: SetRow[];

    if (
      mapping.mapping_type ===
        "combined"
    ) {
      // Pour les mappings combinés, evidence
      // peut contenir plusieurs sets.
      //
      // On prend d'abord le target direct.
      // Les autres seront détectés via les
      // cartes communes si nécessaire.
      targetSets = [targetSet];
    } else {
      targetSets = [targetSet];
    }

    // ----------------------------------------------
    // Cartes
    // ----------------------------------------------

    const jpSetCards =
      cardsBySet.get(jpSet.id) ?? [];

    const frSetCards =
      targetSets.flatMap(
        (set) =>
          cardsBySet.get(set.id) ?? []
      );

    const jpNumbers = new Set(
      jpSetCards
        .map((card) =>
          normalizeNumber(
            card.number ?? card.local_id
          )
        )
        .filter(Boolean)
    );

    const frNumbers = new Set(
      frSetCards
        .map((card) =>
          normalizeNumber(
            card.number ?? card.local_id
          )
        )
        .filter(Boolean)
    );

    const common = [...jpNumbers].filter(
      (number) =>
        frNumbers.has(number)
    );

    const jpOnly = [...jpNumbers].filter(
      (number) =>
        !frNumbers.has(number)
    );

    const frOnly = [...frNumbers].filter(
      (number) =>
        !jpNumbers.has(number)
    );

    // ----------------------------------------------
    // Statut
    // ----------------------------------------------

    let status: AuditStatus;

    if (jpSetCards.length === 0) {
      status = "JP SANS CARTES";
    } else if (
      mapping.mapping_type ===
      "combined"
    ) {
      status = "MAPPING COMBINÉ";
    } else if (
      mapping.mapping_type ===
      "partial"
    ) {
      status = "MAPPING PARTIEL";
    } else if (
      jpOnly.length === 0 &&
      frOnly.length === 0 &&
      jpNumbers.size === frNumbers.size
    ) {
      status = "MATCH PARFAIT";
    } else if (
      jpNumbers.size === common.length &&
      frNumbers.size > common.length
    ) {
      status = "JP INCOMPLET TCGDEX";
    } else if (
      common.length > 0
    ) {
      status = "DIFFÉRENCE NUMÉROTATION";
    } else {
      status = "ANOMALIE";
    }

    results.push({
      jpSet,
      frSets: targetSets,
      mapping,
      jpCount: jpSetCards.length,
      frCount: frSetCards.length,
      commonCount: common.length,
      jpOnly: jpOnly.sort(),
      frOnly: frOnly.sort(),
      status,
    });
  }

  // ------------------------------------------------
  // Résumé
  // ------------------------------------------------

  const statusCounts =
    new Map<AuditStatus, number>();

  for (const result of results) {
    statusCounts.set(
      result.status,
      (statusCounts.get(result.status) ?? 0) + 1
    );
  }

  console.log(
    "\n=============================================="
  );
  console.log(
    " RÉSUMÉ"
  );
  console.log(
    "=============================================="
  );

  console.log(
    `Mappings analysés : ${results.length}`
  );

  const orderedStatuses: AuditStatus[] = [
    "MATCH PARFAIT",
    "JP INCOMPLET TCGDEX",
    "DIFFÉRENCE NUMÉROTATION",
    "MAPPING COMBINÉ",
    "MAPPING PARTIEL",
    "JP SANS CARTES",
    "ANOMALIE",
  ];

  for (const status of orderedStatuses) {
    console.log(
      `${status.padEnd(28)} : ${
        statusCounts.get(status) ?? 0
      }`
    );
  }

  // ------------------------------------------------
  // Détail
  // ------------------------------------------------

  for (const status of orderedStatuses) {
    const matchingResults =
      results.filter(
        (result) =>
          result.status === status
      );

    if (matchingResults.length === 0) {
      continue;
    }

    console.log(
      `\n==============================================`
    );

    console.log(
      ` ${status}`
    );

    console.log(
      `==============================================`
    );

    for (const result of matchingResults) {
      const frNames =
        result.frSets
          .map((set) =>
            `${set.source_id} | ${set.name}`
          )
          .join(" + ");

      console.log(
        `\n${result.jpSet.source_id} | ${result.jpSet.name}`
      );

      console.log(
        `  → FR : ${frNames}`
      );

      console.log(
        `  → Mapping : ${result.mapping.mapping_type}`
      );

      console.log(
        `  → JP cartes : ${result.jpCount}`
      );

      console.log(
        `  → FR cartes : ${result.frCount}`
      );

      console.log(
        `  → Communes  : ${result.commonCount}`
      );

      if (result.jpOnly.length > 0) {
        console.log(
          `  → JP uniquement : ${result.jpOnly.join(", ")}`
        );
      }

      if (result.frOnly.length > 0) {
        console.log(
          `  → FR uniquement : ${result.frOnly.join(", ")}`
        );
      }
    }
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
    "=============================================="
  );
}

main().catch((error) => {
  console.error(
    "\nERREUR FATALE :",
    error
  );

  process.exit(1);
});