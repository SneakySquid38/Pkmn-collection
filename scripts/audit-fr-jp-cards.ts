import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, supabaseKey);

type Card = {
  id: string;
  set_id: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string;
  rarity: string | null;
};

type SetMapping = {
  id: string;
  source_set_id: string;
  target_set_id: string;
  mapping_type: "direct" | "combined" | "partial" | "official" | "manual";
  confidence: number;
  status: string;
  evidence: string | null;
};

type SetInfo = {
  id: string;
  source_id: string;
  name: string;
  language: string;
};

const PAGE_SIZE = 1000;

async function getAll<T>(
  table: string,
  columns: string,
  orderColumn = "id",
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Erreur lecture ${table}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...(data as T[]));

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

/**
 * Normalisation volontairement légère.
 *
 * On ne transforme PAS les numéros complexes comme :
 * TG01/TG30
 * SVP001
 * AR001
 *
 * On retire seulement les espaces inutiles et on met en majuscules.
 * Pour les numéros purement numériques, on retire les zéros initiaux :
 * 001 -> 1
 */
function normalizeNumber(value: string | null): string | null {
  if (!value) return null;

  const normalized = value.trim().toUpperCase();

  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    return String(Number(normalized));
  }

  return normalized;
}

function getCardKey(card: Card): string | null {
  const number = normalizeNumber(card.number);

  if (number) {
    return number;
  }

  if (card.local_id) {
    return normalizeNumber(card.local_id);
  }

  return null;
}

function groupCardsBySet(cards: Card[]) {
  const result = new Map<string, Card[]>();

  for (const card of cards) {
    const existing = result.get(card.set_id) ?? [];
    existing.push(card);
    result.set(card.set_id, existing);
  }

  return result;
}

function getKeys(cards: Card[]) {
  const map = new Map<string, Card[]>();

  for (const card of cards) {
    const key = getCardKey(card);

    if (!key) continue;

    const existing = map.get(key) ?? [];
    existing.push(card);
    map.set(key, existing);
  }

  return map;
}

function formatList(values: string[], max = 30) {
  if (values.length === 0) return "aucun";

  if (values.length <= max) {
    return values.join(", ");
  }

  return `${values.slice(0, max).join(", ")} ... (+${values.length - max})`;
}

function setLabel(set: SetInfo) {
  return `${set.source_id} | ${set.name}`;
}

async function main() {
  console.log("==============================================");
  console.log(" AUDIT CARTES FR ↔ JP");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  console.log("Chargement des cartes...");

  const cards = await getAll<Card>(
    "cards",
    "id,set_id,source_id,local_id,number,name,language,rarity",
  );

  console.log(`Cartes chargées : ${cards.length}`);

  console.log("Chargement des sets...");

  const sets = await getAll<SetInfo>(
    "sets",
    "id,source_id,name,language",
  );

  const frSets = sets.filter((set) => set.language === "FR");
  const jpSets = sets.filter((set) => set.language === "JP");

  console.log(`Sets FR : ${frSets.length}`);
  console.log(`Sets JP : ${jpSets.length}`);

  console.log("Chargement des mappings...");

  const mappings = await getAll<SetMapping>(
    "set_mappings",
    "id,source_set_id,target_set_id,mapping_type,confidence,status,evidence",
  );

  const verifiedMappings = mappings.filter(
    (mapping) =>
      mapping.status === "verified" &&
      mapping.mapping_type !== "official" &&
      mapping.mapping_type !== "manual",
  );

  console.log(`Mappings vérifiés utilisés : ${verifiedMappings.length}\n`);

  const setsById = new Map(sets.map((set) => [set.id, set]));

  const cardsBySet = groupCardsBySet(cards);

  const jpCards = cards.filter((card) => card.language === "JP");
  const frCards = cards.filter((card) => card.language === "FR");

  console.log(`Cartes FR : ${frCards.length}`);
  console.log(`Cartes JP : ${jpCards.length}\n`);

  // ------------------------------------------------------------
  // Préparation des mappings
  // ------------------------------------------------------------

  /**
   * Un même set JP peut avoir plusieurs mappings FR,
   * notamment pour les mappings "combined".
   *
   * On regroupe donc les mappings par set JP source.
   */
  const mappingsByJpSet = new Map<string, SetMapping[]>();

  for (const mapping of verifiedMappings) {
    const existing = mappingsByJpSet.get(mapping.source_set_id) ?? [];
    existing.push(mapping);
    mappingsByJpSet.set(mapping.source_set_id, existing);
  }

  const directResults: any[] = [];
  const combinedResults: any[] = [];
  const partialResults: any[] = [];

  // ------------------------------------------------------------
  // Audit
  // ------------------------------------------------------------

  for (const [jpSetId, jpMappings] of mappingsByJpSet) {
    const jpSet = setsById.get(jpSetId);

    if (!jpSet) {
      console.log(
        `⚠️ Set JP introuvable dans sets : ${jpSetId}`,
      );
      continue;
    }

    const jpCardsForSet = cardsBySet.get(jpSetId) ?? [];
    const jpCardMap = getKeys(jpCardsForSet);

    const targetSetIds = [
      ...new Set(jpMappings.map((mapping) => mapping.target_set_id)),
    ];

    const frCardsForSets = targetSetIds.flatMap(
      (setId) => cardsBySet.get(setId) ?? [],
    );

    const frCardMap = getKeys(frCardsForSets);

    const jpKeys = new Set(jpCardMap.keys());
    const frKeys = new Set(frCardMap.keys());

    const common = [...jpKeys].filter((key) => frKeys.has(key));

    const jpOnly = [...jpKeys].filter((key) => !frKeys.has(key));

    const frOnly = [...frKeys].filter((key) => !jpKeys.has(key));

    const duplicateJp = [...jpCardMap.entries()]
      .filter(([, cards]) => cards.length > 1)
      .map(([key]) => key);

    const duplicateFr = [...frCardMap.entries()]
      .filter(([, cards]) => cards.length > 1)
      .map(([key]) => key);

    const types = [...new Set(jpMappings.map((m) => m.mapping_type))];

    const result = {
      jpSet,
      frSets: targetSetIds
        .map((id) => setsById.get(id))
        .filter(Boolean) as SetInfo[],
      types,
      jpCardCount: jpCardsForSet.length,
      frCardCount: frCardsForSets.length,
      jpUniqueNumbers: jpKeys.size,
      frUniqueNumbers: frKeys.size,
      common: common.length,
      jpOnly,
      frOnly,
      duplicateJp,
      duplicateFr,
    };

    if (types.includes("direct") && targetSetIds.length === 1) {
      directResults.push(result);
    } else if (types.includes("combined")) {
      combinedResults.push(result);
    } else if (types.includes("partial")) {
      partialResults.push(result);
    }
  }

  // ------------------------------------------------------------
  // Affichage DIRECT
  // ------------------------------------------------------------

  console.log("\n==============================================");
  console.log(" 1. MAPPINGS DIRECTS");
  console.log("==============================================\n");

  let directPerfect = 0;
  let directProblems = 0;

  for (const result of directResults) {
    const frSet = result.frSets[0];

    const perfect =
      result.jpOnly.length === 0 &&
      result.frOnly.length === 0 &&
      result.duplicateJp.length === 0 &&
      result.duplicateFr.length === 0;

    if (perfect) {
      directPerfect++;
    } else {
      directProblems++;
    }

    console.log(
      `${perfect ? "✅" : "⚠️"} ${setLabel(result.jpSet)}`
    );

    console.log(`   → ${setLabel(frSet)}`);

    console.log(
      `   JP : ${result.jpCardCount} cartes / ${result.jpUniqueNumbers} numéros`,
    );

    console.log(
      `   FR : ${result.frCardCount} cartes / ${result.frUniqueNumbers} numéros`,
    );

    console.log(`   Commun : ${result.common}`);

    if (!perfect) {
      console.log(
        `   JP uniquement : ${formatList(result.jpOnly)}`,
      );

      console.log(
        `   FR uniquement : ${formatList(result.frOnly)}`,
      );

      if (result.duplicateJp.length) {
        console.log(
          `   Doublons JP : ${formatList(result.duplicateJp)}`,
        );
      }

      if (result.duplicateFr.length) {
        console.log(
          `   Doublons FR : ${formatList(result.duplicateFr)}`,
        );
      }
    }

    console.log("");
  }

  console.log("Résumé DIRECT :");
  console.log(`  Parfaits : ${directPerfect}`);
  console.log(`  Avec différences : ${directProblems}`);

  // ------------------------------------------------------------
  // Affichage COMBINED
  // ------------------------------------------------------------

  console.log("\n==============================================");
  console.log(" 2. MAPPINGS COMBINED");
  console.log("==============================================\n");

  for (const result of combinedResults) {
    console.log(`🔀 ${setLabel(result.jpSet)}`);

    console.log(
      `   → ${result.frSets.map(setLabel).join(" + ")}`,
    );

    console.log(
      `   JP : ${result.jpCardCount} cartes / ${result.jpUniqueNumbers} numéros`,
    );

    console.log(
      `   FR total : ${result.frCardCount} cartes / ${result.frUniqueNumbers} numéros`,
    );

    console.log(`   Numéros communs : ${result.common}`);

    console.log(
      `   JP non retrouvés : ${formatList(result.jpOnly)}`,
    );

    console.log(
      `   FR supplémentaires : ${formatList(result.frOnly)}`,
    );

    if (result.duplicateJp.length) {
      console.log(
        `   Doublons JP : ${formatList(result.duplicateJp)}`,
      );
    }

    if (result.duplicateFr.length) {
      console.log(
        `   Doublons FR : ${formatList(result.duplicateFr)}`,
      );
    }

    console.log("");
  }

  // ------------------------------------------------------------
  // Affichage PARTIAL
  // ------------------------------------------------------------

  console.log("\n==============================================");
  console.log(" 3. MAPPINGS PARTIAL");
  console.log("==============================================\n");

  for (const result of partialResults) {
    console.log(`🟡 ${setLabel(result.jpSet)}`);

    console.log(
      `   → ${result.frSets.map(setLabel).join(" + ")}`,
    );

    console.log(
      `   JP : ${result.jpCardCount} cartes / ${result.jpUniqueNumbers} numéros`,
    );

    console.log(
      `   FR : ${result.frCardCount} cartes / ${result.frUniqueNumbers} numéros`,
    );

    console.log(`   Commun : ${result.common}`);

    console.log(
      `   JP non retrouvés : ${formatList(result.jpOnly)}`,
    );

    console.log(
      `   FR supplémentaires : ${formatList(result.frOnly)}`,
    );

    console.log("");
  }

  // ------------------------------------------------------------
  // Résumé global
  // ------------------------------------------------------------

  const allResults = [
    ...directResults,
    ...combinedResults,
    ...partialResults,
  ];

  const totalJpCards = allResults.reduce(
    (sum, result) => sum + result.jpCardCount,
    0,
  );

  const totalCommon = allResults.reduce(
    (sum, result) => sum + result.common,
    0,
  );

  console.log("\n==============================================");
  console.log(" RÉSUMÉ GLOBAL");
  console.log("==============================================\n");

  console.log(`Sets JP audités : ${allResults.length}`);
  console.log(`Mappings directs : ${directResults.length}`);
  console.log(`Mappings combined : ${combinedResults.length}`);
  console.log(`Mappings partial : ${partialResults.length}`);

  console.log(`Cartes JP concernées : ${totalJpCards}`);
  console.log(`Numéros communs : ${totalCommon}`);

  console.log("\nAudit terminé.");
  console.log("Aucune donnée n'a été modifiée.");
}

main().catch((error) => {
  console.error("\n❌ ERREUR");
  console.error(error);
  process.exit(1);
});