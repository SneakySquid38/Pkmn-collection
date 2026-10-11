import fs from "node:fs/promises";
import path from "node:path";

type Language = "fr" | "jp" | "ko" | "sc" | "tc";

type Card = {
  file: string;
  sourceId: string | number | null;
  printKey: string | null;
  cardKey: string | null;
  number: string | null;
  name: string | null;
  setName: string | null;
};

type SetAudit = {
  setId: string;
  languages: Language[];
  counts: Record<string, number>;
  missingPrintKey: Record<string, number>;
  duplicatePrintKeys: Record<string, string[]>;
  duplicateNumbers: Record<string, string[]>;
  printKeyPairResults: PairResult[];
  numberPairResults: PairResult[];
};

type PairResult = {
  a: Language;
  b: Language;
  aCount: number;
  bCount: number;
  common: number;
  aOnly: number;
  bOnly: number;
  aOnlyExamples: string[];
  bOnlyExamples: string[];
  ambiguousA: number;
  ambiguousB: number;
};

const ROOT = path.resolve("PTCG-database");
const LANGUAGES: Language[] = ["fr", "jp", "ko", "sc", "tc"];
const OUT = path.resolve("audit-ptcg-database-all-multilang.json");

function normalize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function mapCard(raw: any, file: string): Card {
  return {
    file,
    sourceId: raw.jp_id ?? raw.ko_id ?? raw.id ?? null,
    printKey: normalize(raw.print_key),
    cardKey: normalize(raw.card_key),
    number: normalize(raw.number),
    name: normalize(raw.name),
    setName: normalize(raw.set_name),
  };
}

async function readJson(file: string): Promise<any> {
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

async function listSetIds(language: Language): Promise<string[]> {
  const dir = path.join(ROOT, `data_${language}`);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

async function loadSet(language: Language, setId: string): Promise<Card[]> {
  const dir = path.join(ROOT, `data_${language}`, setId);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .sort();

  const cards: Card[] = [];

  for (const file of files) {
    const full = path.join(dir, file);

    try {
      const raw = await readJson(full);
      if (!raw || typeof raw !== "object") continue;

      cards.push(mapCard(raw, file));
    } catch (error) {
      console.warn(`⚠️ JSON invalide ignoré : ${language}/${setId}/${file}`);
    }
  }

  return cards;
}

function indexBy(cards: Card[], field: "printKey" | "number") {
  const map = new Map<string, Card[]>();

  for (const card of cards) {
    const value = card[field];
    if (!value) continue;

    const arr = map.get(value) ?? [];
    arr.push(card);
    map.set(value, arr);
  }

  return map;
}

function duplicateKeys(cards: Card[], field: "printKey" | "number") {
  const map = indexBy(cards, field);
  const result: Record<string, string[]> = {};

  for (const [key, rows] of map) {
    if (rows.length > 1) {
      result[key] = rows.map((r) => r.file);
    }
  }

  return result;
}

function pairResult(
  a: Language,
  b: Language,
  cardsA: Card[],
  cardsB: Card[],
  field: "printKey" | "number",
): PairResult {
  const indexA = indexBy(cardsA, field);
  const indexB = indexBy(cardsB, field);

  const keysA = new Set(indexA.keys());
  const keysB = new Set(indexB.keys());

  const commonKeys = [...keysA].filter((k) => keysB.has(k));
  const aOnlyKeys = [...keysA].filter((k) => !keysB.has(k));
  const bOnlyKeys = [...keysB].filter((k) => !keysA.has(k));

  let ambiguousA = 0;
  let ambiguousB = 0;

  for (const key of commonKeys) {
    if ((indexA.get(key)?.length ?? 0) > 1) ambiguousA++;
    if ((indexB.get(key)?.length ?? 0) > 1) ambiguousB++;
  }

  return {
    a,
    b,
    aCount: cardsA.length,
    bCount: cardsB.length,
    common: commonKeys.length,
    aOnly: aOnlyKeys.length,
    bOnly: bOnlyKeys.length,
    aOnlyExamples: aOnlyKeys.slice(0, 20),
    bOnlyExamples: bOnlyKeys.slice(0, 20),
    ambiguousA,
    ambiguousB,
  };
}

function allPairs(languages: Language[]): [Language, Language][] {
  const result: [Language, Language][] = [];

  for (let i = 0; i < languages.length; i++) {
    for (let j = i + 1; j < languages.length; j++) {
      result.push([languages[i], languages[j]]);
    }
  }

  return result;
}

async function main() {
  console.log("\n==============================================");
  console.log(" AUDIT GLOBAL PTCG-DATABASE MULTILINGUE");
  console.log(" FR / JP / KR / SC / TC");
  console.log("==============================================\n");

  const setLists = new Map<Language, string[]>();

  for (const language of LANGUAGES) {
    const ids = await listSetIds(language);
    setLists.set(language, ids);
    console.log(`${language.toUpperCase()} : ${ids.length} sets`);
  }

  const allSetIds = new Set<string>();
  for (const ids of setLists.values()) {
    for (const id of ids) allSetIds.add(id);
  }

  const eligibleSetIds = [...allSetIds]
    .filter((setId) => {
      let count = 0;
      for (const language of LANGUAGES) {
        if (setLists.get(language)?.includes(setId)) count++;
      }
      return count >= 2;
    })
    .sort();

  console.log(`\nSets présents dans au moins 2 langues : ${eligibleSetIds.length}\n`);

  const audits: SetAudit[] = [];

  for (const setId of eligibleSetIds) {
    const languages = LANGUAGES.filter((language) =>
      setLists.get(language)?.includes(setId),
    );

    const cardsByLanguage = new Map<Language, Card[]>();

    for (const language of languages) {
      cardsByLanguage.set(language, await loadSet(language, setId));
    }

    const counts: Record<string, number> = {};
    const missingPrintKey: Record<string, number> = {};
    const duplicatePrintKeys: Record<string, string[]> = {};
    const duplicateNumbers: Record<string, string[]> = {};

    for (const language of languages) {
      const cards = cardsByLanguage.get(language)!;

      counts[language] = cards.length;
      missingPrintKey[language] = cards.filter((c) => !c.printKey).length;
      duplicatePrintKeys[language] = Object.keys(
        duplicateKeys(cards, "printKey"),
      );
      duplicateNumbers[language] = Object.keys(
        duplicateKeys(cards, "number"),
      );
    }

    const printKeyPairResults: PairResult[] = [];
    const numberPairResults: PairResult[] = [];

    for (const [a, b] of allPairs(languages)) {
      const cardsA = cardsByLanguage.get(a)!;
      const cardsB = cardsByLanguage.get(b)!;

      printKeyPairResults.push(
        pairResult(a, b, cardsA, cardsB, "printKey"),
      );

      numberPairResults.push(
        pairResult(a, b, cardsA, cardsB, "number"),
      );
    }

    audits.push({
      setId,
      languages,
      counts,
      missingPrintKey,
      duplicatePrintKeys,
      duplicateNumbers,
      printKeyPairResults,
      numberPairResults,
    });

    const hasPrintProblem =
      Object.values(missingPrintKey).some((n) => n > 0) ||
      Object.values(duplicatePrintKeys).some((keys) => keys.length > 0) ||
      printKeyPairResults.some(
        (r) =>
          r.aOnly > 0 ||
          r.bOnly > 0 ||
          r.ambiguousA > 0 ||
          r.ambiguousB > 0,
      );

    const marker = hasPrintProblem ? "⚠️" : "✅";
    console.log(
      `${marker} ${setId.padEnd(12)} | ${languages.join(",").toUpperCase()}`,
    );
  }

  const pairSummary = new Map<
    string,
    {
      sets: number;
      perfect: number;
      withDifference: number;
      common: number;
      aOnly: number;
      bOnly: number;
      ambiguous: number;
    }
  >();

  for (const audit of audits) {
    for (const result of audit.printKeyPairResults) {
      const key = `${result.a}-${result.b}`;

      const current = pairSummary.get(key) ?? {
        sets: 0,
        perfect: 0,
        withDifference: 0,
        common: 0,
        aOnly: 0,
        bOnly: 0,
        ambiguous: 0,
      };

      current.sets++;
      current.common += result.common;
      current.aOnly += result.aOnly;
      current.bOnly += result.bOnly;
      current.ambiguous += result.ambiguousA + result.ambiguousB;

      if (
        result.aOnly === 0 &&
        result.bOnly === 0 &&
        result.ambiguousA === 0 &&
        result.ambiguousB === 0
      ) {
        current.perfect++;
      } else {
        current.withDifference++;
      }

      pairSummary.set(key, current);
    }
  }

  const global = {
    setsEligible: audits.length,
    setsByLanguage: Object.fromEntries(
      LANGUAGES.map((language) => [
        language,
        audits.filter((a) => a.languages.includes(language)).length,
      ]),
    ),
    setsWithMissingPrintKey: audits.filter((a) =>
      Object.values(a.missingPrintKey).some((n) => n > 0),
    ).length,
    setsWithDuplicatePrintKey: audits.filter((a) =>
      Object.values(a.duplicatePrintKeys).some((keys) => keys.length > 0),
    ).length,
    setsWithDuplicateNumber: audits.filter((a) =>
      Object.values(a.duplicateNumbers).some((keys) => keys.length > 0),
    ).length,
    pairSummary: Object.fromEntries(pairSummary),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    repository: ROOT,
    languages: LANGUAGES,
    global,
    sets: audits,
  };

  await fs.writeFile(OUT, JSON.stringify(report, null, 2), "utf8");

  console.log("\n==============================================");
  console.log(" RÉSUMÉ GLOBAL — PRINT_KEY");
  console.log("==============================================");

  for (const [pair, summary] of pairSummary) {
    console.log(
      `${pair.padEnd(5)} | sets ${String(summary.sets).padStart(3)} | ` +
        `parfaits ${String(summary.perfect).padStart(3)} | ` +
        `différences ${String(summary.withDifference).padStart(3)} | ` +
        `ambigus ${String(summary.ambiguous).padStart(5)}`,
    );
  }

  console.log("\n----------------------------------------------");
  console.log(`Sets avec print_key manquant : ${global.setsWithMissingPrintKey}`);
  console.log(`Sets avec print_key dupliqué  : ${global.setsWithDuplicatePrintKey}`);
  console.log(`Sets avec numéro dupliqué     : ${global.setsWithDuplicateNumber}`);
  console.log(`\nRapport JSON : ${OUT}`);
  console.log("\nAucune donnée Supabase n'a été modifiée.");
  console.log("==============================================\n");
}

main().catch((error) => {
  console.error("\nERREUR FATALE :", error);
  process.exit(1);
});
