import fs from "fs/promises";
import path from "path";

type Category = "pokemon" | "trainer" | "energy" | "unknown";

type PtcgCard = {
  language: string;
  setDir: string;
  file: string;
  number: string | null;
  name: string | null;
  printKey: string | null;
  cardKey: string | null;
  author: string[];
  category: Category;
  pokedexNumber: number | null;
};

type PairVerdict =
  | "VERIFIED"
  | "STRUCTURAL_VERIFIED"
  | "REVIEW"
  | "CONFLICT"
  | "UNMATCHED";

type Evidence = {
  language: string;
  verdict: PairVerdict;
  printKey: string | null;
  number: string | null;
  name: string | null;
  category: Category;
  pokedexNumber: number | null;
  author: string[];
};

type CardReadiness = {
  setDir: string;
  language: string;
  file: string;
  number: string | null;
  name: string | null;
  category: Category;
  pokedexNumber: number | null;
  author: string[];
  printKey: string | null;

  verifiedLanguages: string[];
  structuralLanguages: string[];
  reviewLanguages: string[];
  conflictLanguages: string[];

  evidenceCount: number;
  uniquePositiveLanguages: number;
  ambiguousLanguages: string[];
  readiness:
    | "SAFE"
    | "SAFE_WITH_ANOMALY"
    | "REVIEW"
    | "CONFLICT"
    | "NO_MATCH";

  reasons: string[];
};

const LANGUAGES = ["fr", "jp", "ko", "sc", "tc"] as const;
const ROOT = path.resolve("PTCG-database");

async function listDirectories(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeNumber(value: unknown): string | null {
  const s = String(value ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(Number(s));
  return s;
}

/**
 * Author normalization:
 * - Unicode normalization
 * - whitespace/case normalization
 * - purely numeric credits: leading zeroes are ignored
 *   (0313 === 313)
 */
function normalizeAuthor(value: unknown): string {
  const s = normalizeText(value);
  if (!s) return "";

  if (/^\d+$/.test(s)) {
    return String(Number(s));
  }

  return s;
}

function normalizeAuthors(values: string[]): string[] {
  return values
    .map(normalizeAuthor)
    .filter(Boolean)
    .sort();
}

function authorsEqual(a: string[], b: string[]): boolean {
  const aa = normalizeAuthors(a);
  const bb = normalizeAuthors(b);

  if (!aa.length || !bb.length) return false;

  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function containsAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

/**
 * We prefer pokedex_number as the Pokémon signal because it is
 * language-independent. card_type is then used for Trainer/Energy.
 *
 * The mapping is intentionally conservative: unknown stays unknown.
 */
function getCategory(raw: any): Category {
  // A populated pokedex_number is the strongest language-independent
  // Pokémon signal in this repository.
  const pokedex = Number(raw?.pokedex_number);
  if (Number.isFinite(pokedex)) return "pokemon";

  const t = normalizeText(raw?.card_type);
  if (!t) return "unknown";

  // Japanese
  if (
    ["グッズ", "ポケモンのどうぐ", "サポート", "スタジアム"].includes(t)
  ) {
    return "trainer";
  }
  if (t === "特殊エネルギー" || t.includes("基本エネルギー")) {
    return "energy";
  }

  // Korean. Repository exports are not perfectly uniform between eras,
  // so we deliberately use broad but unambiguous substrings.
  if (
    containsAny(t, [
      "트레이너",
      "아이템",
      "포켓몬의도구",
      "포켓몬의도구",
      "서포트",
      "스타디움",
      "기술머신",
    ])
  ) {
    return "trainer";
  }
  if (containsAny(t, ["에너지", "특수에너지", "기본에너지"])) {
    return "energy";
  }

  // Simplified Chinese.
  if (
    containsAny(t, [
      "训练家",
      "宝可梦道具",
      "宝可梦工具",
      "物品",
      "支援者",
      "场地",
      "道具",
      "技术机",
    ])
  ) {
    return "trainer";
  }
  if (containsAny(t, ["能量", "特殊能量", "基本能量"])) {
    return "energy";
  }

  // Traditional Chinese.
  if (
    containsAny(t, [
      "訓練家",
      "寶可夢道具",
      "寶可夢工具",
      "物品",
      "支援者",
      "場地",
      "道具",
      "技術機",
    ])
  ) {
    return "trainer";
  }
  if (containsAny(t, ["能量", "特殊能量", "基本能量"])) {
    return "energy";
  }

  // Western languages / older repository generations.
  if (
    containsAny(t, [
      "trainer",
      "dresseur",
      "trainers",
      "trainer card",
      "item",
      "tool",
      "supporter",
      "stadium",
      "objet",
      "herramienta",
      "partidario",
      "estadio",
      "allenatore",
      "strumento",
      "stadio",
      "treinador",
      "apoiador",
      "estádio",
    ])
  ) {
    return "trainer";
  }

  if (
    containsAny(t, [
      "energy",
      "énergie",
      "energie",
      "energía",
      "energia",
      "energia",
    ])
  ) {
    return "energy";
  }

  return "unknown";
}

function getAuthors(raw: any): string[] {
  const values = Array.isArray(raw?.author) ? raw.author : [];
  return values.map((v: unknown) => String(v ?? "")).filter(Boolean);
}

function getPokedex(raw: any): number | null {
  const n = Number(raw?.pokedex_number);
  return Number.isFinite(n) ? n : null;
}

function getPrintKey(raw: any): string | null {
  const value = raw?.print_key;
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function getCardKey(raw: any): string | null {
  const value = raw?.card_key;
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toCard(
  language: string,
  setDir: string,
  file: string,
  raw: any
): PtcgCard {
  return {
    language,
    setDir,
    file,
    number: normalizeNumber(raw?.number),
    name: raw?.name ? String(raw.name) : null,
    printKey: getPrintKey(raw),
    cardKey: getCardKey(raw),
    author: getAuthors(raw),
    category: getCategory(raw),
    pokedexNumber: getPokedex(raw),
  };
}

async function loadRepoCards(): Promise<PtcgCard[]> {
  const cards: PtcgCard[] = [];

  for (const language of LANGUAGES) {
    const languageDir = path.join(ROOT, `data_${language}`);

    let setDirs: string[];
    try {
      setDirs = await listDirectories(languageDir);
    } catch {
      continue;
    }

    for (const setDir of setDirs) {
      const fullSetDir = path.join(languageDir, setDir);

      const files = (await fs.readdir(fullSetDir))
        .filter((file) => file.toLowerCase().endsWith(".json"))
        .sort();

      for (const file of files) {
        try {
          const raw = JSON.parse(
            await fs.readFile(path.join(fullSetDir, file), "utf8")
          );

          cards.push(toCard(language, setDir, file, raw));
        } catch (error) {
          console.warn(
            `JSON ignoré: ${language}/${setDir}/${file}`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  }

  return cards;
}

function buildIndex<T>(
  cards: T[],
  getKey: (card: T) => string | null
): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const card of cards) {
    const key = getKey(card);
    if (!key) continue;

    const list = map.get(key) ?? [];
    list.push(card);
    map.set(key, list);
  }

  return map;
}

/**
 * Pair matching rules.
 *
 * IMPORTANT:
 * print_key is a candidate locator, NOT an identity by itself.
 *
 * Pokémon:
 *   VERIFIED = same print_key + same number + same Dex + same author
 *   REVIEW   = same print_key/number/Dex but author missing/different
 *   CONFLICT = same print_key + same number but different Dex
 *              or Pokémon vs non-Pokémon
 *
 * Trainer/Energy:
 *   STRUCTURAL_VERIFIED = same print_key + number + category + author
 *   REVIEW               = same print_key + number + category
 *                          with missing/different author
 *   CONFLICT             = same print_key + number but category differs
 *
 * Unknown category is never allowed to produce an automatic positive match.
 */
function pairVerdict(a: PtcgCard, b: PtcgCard): PairVerdict {
  const samePrint =
    !!a.printKey && !!b.printKey && a.printKey === b.printKey;

  const sameNumber =
    !!a.number && !!b.number && a.number === b.number;

  const sameAuthor = authorsEqual(a.author, b.author);

  if (!samePrint || !sameNumber) {
    return "UNMATCHED";
  }

  // Category mismatch is a hard conflict.
  if (a.category !== "unknown" && b.category !== "unknown") {
    if (a.category !== b.category) {
      return "CONFLICT";
    }
  }

  // Pokémon
  if (a.category === "pokemon" && b.category === "pokemon") {
    if (
      a.pokedexNumber !== null &&
      b.pokedexNumber !== null &&
      a.pokedexNumber !== b.pokedexNumber
    ) {
      return "CONFLICT";
    }

    if (
      a.pokedexNumber !== null &&
      b.pokedexNumber !== null &&
      a.pokedexNumber === b.pokedexNumber
    ) {
      return sameAuthor ? "VERIFIED" : "REVIEW";
    }

    return "REVIEW";
  }

  // If one side is Pokémon and the other side is unknown,
  // do not auto-fuse: evidence is insufficient.
  if (
    (a.category === "pokemon" && b.category === "unknown") ||
    (a.category === "unknown" && b.category === "pokemon")
  ) {
    return "REVIEW";
  }

  // Trainer / Energy
  if (
    a.category !== "unknown" &&
    b.category !== "unknown" &&
    a.category === b.category
  ) {
    return sameAuthor ? "STRUCTURAL_VERIFIED" : "REVIEW";
  }

  // Unknown/unknown or unknown non-Pokémon: never automatic.
  return "REVIEW";
}

function makeCardStatus(card: PtcgCard): CardReadiness {
  return {
    setDir: card.setDir,
    language: card.language,
    file: card.file,
    number: card.number,
    name: card.name,
    category: card.category,
    pokedexNumber: card.pokedexNumber,
    author: card.author,
    printKey: card.printKey,
    verifiedLanguages: [],
    structuralLanguages: [],
    reviewLanguages: [],
    conflictLanguages: [],
    evidenceCount: 0,
    uniquePositiveLanguages: 0,
    ambiguousLanguages: [],
    readiness: "NO_MATCH",
    reasons: [],
  };
}

function addLanguage(
  list: string[],
  language: string
): void {
  if (!list.includes(language)) list.push(language);
}

function classifyStatus(status: CardReadiness): void {
  const hasVerified = status.verifiedLanguages.length > 0;
  const hasStructural = status.structuralLanguages.length > 0;
  const hasReview = status.reviewLanguages.length > 0;
  const hasConflict = status.conflictLanguages.length > 0;

  status.uniquePositiveLanguages =
    new Set([
      ...status.verifiedLanguages,
      ...status.structuralLanguages,
    ]).size;

  if (hasConflict) {
    status.readiness = "CONFLICT";
    status.reasons.push("au moins un conflit avec une autre langue");
    return;
  }

  if (hasReview) {
    status.readiness = "REVIEW";
    status.reasons.push("au moins une correspondance nécessite une vérification");
    return;
  }

  if (hasVerified) {
    status.readiness =
      hasStructural || status.ambiguousLanguages.length > 0
        ? "SAFE_WITH_ANOMALY"
        : "SAFE";

    if (hasStructural) {
      status.reasons.push("VERIFIED + STRUCTURAL_VERIFIED sans signal négatif");
    } else if (status.ambiguousLanguages.length > 0) {
      status.reasons.push(
        "VERIFIED mais au moins une langue possède plusieurs candidats pour le même print_key"
      );
    } else {
      status.reasons.push("au moins une correspondance VERIFIED et aucun signal négatif");
    }
    return;
  }

  if (hasStructural) {
    status.readiness = "SAFE_WITH_ANOMALY";
    status.reasons.push(
      status.ambiguousLanguages.length > 0
        ? "STRUCTURAL_VERIFIED mais candidat ambigu dans au moins une langue"
        : "uniquement STRUCTURAL_VERIFIED dans les preuves disponibles"
    );
    return;
  }

  status.readiness = "NO_MATCH";
  status.reasons.push("aucune correspondance positive");
}

async function main() {
  console.log("==============================================");
  console.log("AUDIT CARD ENTITY — TOUT LE DÉPÔT V3");
  console.log("Lecture seule — aucune écriture Supabase");
  console.log("==============================================");
  console.log("");

  const repoCards = await loadRepoCards();

  console.log(`Cartes PTCG-database chargées : ${repoCards.length}`);

  const bySetLanguage = new Map<string, PtcgCard[]>();
  const languagesBySet = new Map<string, Set<string>>();

  for (const card of repoCards) {
    const key = `${card.setDir}::${card.language}`;

    const list = bySetLanguage.get(key) ?? [];
    list.push(card);
    bySetLanguage.set(key, list);

    const langs = languagesBySet.get(card.setDir) ?? new Set<string>();
    langs.add(card.language);
    languagesBySet.set(card.setDir, langs);
  }

  const statuses = new Map<PtcgCard, CardReadiness>();
  for (const card of repoCards) {
    statuses.set(card, makeCardStatus(card));
  }

  const eligibleSets = [...languagesBySet.entries()]
    .filter(([, languages]) => languages.size >= 2)
    .map(([setDir]) => setDir)
    .sort();

  console.log(`Sets avec >=2 langues      : ${eligibleSets.length}`);
  console.log("");

  const global = {
    cardsTotal: repoCards.length,
    cardsWithEvidence: 0,
    safe: 0,
    safeWithAnomaly: 0,
    review: 0,
    conflict: 0,
    noMatch: 0,
    missingPrintKey: 0,
    duplicatePrintKeyCards: 0,
    duplicatePrintKeyGroups: 0,
    invalidJson: 0,
  };

  const setResults: any[] = [];

  for (const setDir of eligibleSets) {
    const languages = [
      ...(languagesBySet.get(setDir) ?? new Set<string>()),
    ].sort();

    const cardsByLanguage = new Map<string, PtcgCard[]>();

    for (const language of languages) {
      cardsByLanguage.set(
        language,
        bySetLanguage.get(`${setDir}::${language}`) ?? []
      );
    }

    const setStats = {
      setDir,
      languages,
      cardsTotal: languages.reduce(
        (sum, lang) => sum + (cardsByLanguage.get(lang)?.length ?? 0),
        0
      ),
      cardsWithEvidence: 0,
      safe: 0,
      safeWithAnomaly: 0,
      review: 0,
      conflict: 0,
      noMatch: 0,
      missingPrintKey: 0,
      duplicatePrintKeyGroups: 0,
      duplicatePrintKeyCards: 0,
    };

    for (const language of languages) {
      const cards = cardsByLanguage.get(language) ?? [];
      const printIndex = buildIndex(cards, (card) => card.printKey);

      for (const card of cards) {
        if (!card.printKey) {
          setStats.missingPrintKey++;
          global.missingPrintKey++;
        }
      }

      for (const [, group] of printIndex) {
        if (group.length > 1) {
          setStats.duplicatePrintKeyGroups++;
          global.duplicatePrintKeyGroups++;

          setStats.duplicatePrintKeyCards += group.length;
          global.duplicatePrintKeyCards += group.length;
        }
      }
    }

    // Compare each language pair. Every real card is then classified globally.
    for (let i = 0; i < languages.length; i++) {
      for (let j = i + 1; j < languages.length; j++) {
        const la = languages[i];
        const lb = languages[j];

        const aCards = cardsByLanguage.get(la) ?? [];
        const bCards = cardsByLanguage.get(lb) ?? [];

        const bPrintIndex = buildIndex(bCards, (card) => card.printKey);

        for (const a of aCards) {
          const statusA = statuses.get(a)!;

          if (!a.printKey) continue;

          const candidates = bPrintIndex.get(a.printKey) ?? [];

          // Multiple cards in the target language share the same candidate key.
          // Even if one candidate verifies, this is an ambiguity that must not
          // be silently treated as a perfect identity.
          if (candidates.length > 1) {
            addLanguage(statusA.ambiguousLanguages, lb);
            for (const candidate of candidates) {
              addLanguage(statuses.get(candidate)!.ambiguousLanguages, la);
            }
          }

          for (const b of candidates) {
            const statusB = statuses.get(b)!;
            const verdict = pairVerdict(a, b);

            if (verdict === "UNMATCHED") continue;

            statusA.evidenceCount++;
            statusB.evidenceCount++;

            if (verdict === "VERIFIED") {
              addLanguage(statusA.verifiedLanguages, lb);
              addLanguage(statusB.verifiedLanguages, la);
            } else if (verdict === "STRUCTURAL_VERIFIED") {
              addLanguage(statusA.structuralLanguages, lb);
              addLanguage(statusB.structuralLanguages, la);
            } else if (verdict === "REVIEW") {
              addLanguage(statusA.reviewLanguages, lb);
              addLanguage(statusB.reviewLanguages, la);
            } else if (verdict === "CONFLICT") {
              addLanguage(statusA.conflictLanguages, lb);
              addLanguage(statusB.conflictLanguages, la);
            }
          }
        }
      }
    }

    const setCards = languages.flatMap(
      (language) => cardsByLanguage.get(language) ?? []
    );

    for (const card of setCards) {
      const status = statuses.get(card)!;
      classifyStatus(status);

      if (status.evidenceCount > 0) {
        setStats.cardsWithEvidence++;
        global.cardsWithEvidence++;
      }

      switch (status.readiness) {
        case "SAFE":
          setStats.safe++;
          global.safe++;
          break;
        case "SAFE_WITH_ANOMALY":
          setStats.safeWithAnomaly++;
          global.safeWithAnomaly++;
          break;
        case "REVIEW":
          setStats.review++;
          global.review++;
          break;
        case "CONFLICT":
          setStats.conflict++;
          global.conflict++;
          break;
        case "NO_MATCH":
          setStats.noMatch++;
          global.noMatch++;
          break;
      }
    }

    setResults.push(setStats);
  }

  // Cards belonging to sets with only one language cannot be cross-language
  // matched. They are still included in the complete report.
  for (const card of repoCards) {
    const status = statuses.get(card)!;

    if (status.readiness === "NO_MATCH") {
      classifyStatus(status);
      if (status.evidenceCount === 0) {
        // Explicitly preserve NO_MATCH: absence of another language is not
        // evidence of a conflict.
        status.readiness = "NO_MATCH";
        status.reasons = ["aucune autre langue disponible pour ce set"];
      }
    }
  }

  // Recompute global totals from every repository card, not only eligible sets.
  const allStatuses = [...statuses.values()];

  const finalSummary = {
    cardsTotal: allStatuses.length,
    cardsWithEvidence: allStatuses.filter((s) => s.evidenceCount > 0).length,
    safe: allStatuses.filter((s) => s.readiness === "SAFE").length,
    safeWithAnomaly: allStatuses.filter(
      (s) => s.readiness === "SAFE_WITH_ANOMALY"
    ).length,
    review: allStatuses.filter((s) => s.readiness === "REVIEW").length,
    conflict: allStatuses.filter((s) => s.readiness === "CONFLICT").length,
    noMatch: allStatuses.filter((s) => s.readiness === "NO_MATCH").length,
    eligibleSets: eligibleSets.length,
    totalSets: languagesBySet.size,
    missingPrintKey: global.missingPrintKey,
    duplicatePrintKeyGroups: global.duplicatePrintKeyGroups,
    duplicatePrintKeyCards: global.duplicatePrintKeyCards,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    mode: "full-repository-card-level-audit-v3",
    languages: [...LANGUAGES],
    source: ROOT,
    rules: {
      candidateKey:
        "print_key uniquement comme clé de candidature; jamais comme identité suffisante",
      authorNormalization:
        "NFKC + casse/espaces normalisés + identifiants numériques sans zéros initiaux",
      pokemonVerified:
        "même print_key + même numéro + même pokedex_number + même auteur normalisé",
      pokemonReview:
        "même print_key + même numéro + même pokedex_number mais auteur absent/différent",
      pokemonConflict:
        "même print_key + même numéro mais pokedex_number différent, ou catégorie Pokémon/non-Pokémon",
      trainerEnergyVerified:
        "même print_key + même numéro + même catégorie + même auteur normalisé",
      trainerEnergyReview:
        "même print_key + même numéro + même catégorie mais auteur absent/différent",
      categoryUnknown:
        "jamais automatiquement fusionnée",
      duplicateCandidateRule:
        "plusieurs cartes dans une langue pour le même print_key => SAFE_WITH_ANOMALY au maximum, jamais SAFE pur",
      noCrossLanguageEvidence:
        "NO_MATCH, jamais CONFLICT",
      noSupabaseWrites: true,
    },
    summary: finalSummary,
    sets: setResults.sort((a, b) => a.setDir.localeCompare(b.setDir)),
    cards: allStatuses.sort(
      (a, b) =>
        a.setDir.localeCompare(b.setDir) ||
        a.language.localeCompare(b.language) ||
        String(a.number ?? "").localeCompare(String(b.number ?? ""))
    ),
  };

  const outputPath = path.resolve("audit-card-entity-readiness-v3.json");

  await fs.writeFile(
    outputPath,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log("==============================================");
  console.log("RÉSULTAT FINAL");
  console.log("==============================================");
  console.log(`Cartes total          : ${finalSummary.cardsTotal}`);
  console.log(`Avec preuve           : ${finalSummary.cardsWithEvidence}`);
  console.log(`SAFE                  : ${finalSummary.safe}`);
  console.log(`SAFE_WITH_ANOMALY     : ${finalSummary.safeWithAnomaly}`);
  console.log(`REVIEW                : ${finalSummary.review}`);
  console.log(`CONFLICT              : ${finalSummary.conflict}`);
  console.log(`NO_MATCH              : ${finalSummary.noMatch}`);
  console.log(`Sets total            : ${finalSummary.totalSets}`);
  console.log(`Sets multi-langues    : ${finalSummary.eligibleSets}`);
  console.log(`Missing print_key     : ${finalSummary.missingPrintKey}`);
  console.log(
    `Duplicate print_key   : ${finalSummary.duplicatePrintKeyGroups} groupes / ${finalSummary.duplicatePrintKeyCards} cartes`
  );
  console.log(`Fichier               : ${outputPath}`);
  console.log("");
  console.log("AUCUNE écriture Supabase.");
}

main().catch((error) => {
  console.error("");
  console.error("ERREUR FATALE");
  console.error(error);
  process.exit(1);
});
