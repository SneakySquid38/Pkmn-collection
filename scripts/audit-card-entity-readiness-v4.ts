import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_REPO = path.join(PROJECT_ROOT, "PTCG-database");
const DEFAULT_V3 = path.join(PROJECT_ROOT, "audit-card-entity-readiness-v3.json");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "audit-card-entity-readiness-v4.json");

const LANGUAGES = ["fr", "jp", "ko", "sc", "tc"] as const;
type Language = (typeof LANGUAGES)[number];

type V3Readiness = "SAFE" | "SAFE_WITH_ANOMALY" | "REVIEW" | "CONFLICT" | "NO_MATCH";
type V4Status = "SAFE_FINAL" | "SAFE_WITH_ANOMALY" | "REVIEW_NECESSAIRE" | "CONFLICT_A_VERIFIER";

type V3Card = {
  setDir: string;
  language: Language;
  file: string;
  number: string;
  name: string;
  category: string;
  pokedexNumber: number | null;
  author: string[];
  printKey: string | null;
  verifiedLanguages: Language[];
  structuralLanguages: Language[];
  reviewLanguages: Language[];
  conflictLanguages: Language[];
  evidenceCount: number;
  uniquePositiveLanguages: number;
  ambiguousLanguages: Language[];
  readiness: V3Readiness;
  reasons: string[];
};

type V3Set = {
  setDir: string;
  languages: Language[];
  cardsTotal: number;
  cardsWithEvidence: number;
  safe: number;
  safeWithAnomaly: number;
  review: number;
  conflict: number;
  noMatch: number;
  missingPrintKey: number;
  duplicatePrintKeyGroups: number;
  duplicatePrintKeyCards: number;
};

type V3Report = {
  generatedAt: string;
  mode: string;
  languages: Language[];
  source: string;
  rules: Record<string, unknown>;
  summary: Record<string, unknown>;
  sets: V3Set[];
  cards: V3Card[];
};

type RepoCard = {
  setDir: string;
  language: Language;
  file: string;
  number: string | null;
  name: string | null;
  category: string | null;
  pokedexNumber: number | null;
  author: string[];
  printKey: string | null;
};

type EvidenceCard = {
  language: Language;
  file: string;
  number: string | null;
  name: string | null;
  category: string | null;
  pokedexNumber: number | null;
  author: string[];
  printKey: string | null;
};

type V4Card = V3Card & {
  v4Status: V4Status;
  finalDecision: "AUTO_ENTITY" | "ENTITY_WITH_ANOMALY" | "MANUAL_REVIEW" | "DO_NOT_MERGE";
  evidence: {
    verified: EvidenceCard[];
    structural: EvidenceCard[];
    review: EvidenceCard[];
    conflict: EvidenceCard[];
  };
  validation: {
    hasVerifiedEvidence: boolean;
    hasStructuralEvidence: boolean;
    hasReviewEvidence: boolean;
    hasConflictEvidence: boolean;
    hasAmbiguity: boolean;
    positiveLanguages: Language[];
    negativeLanguages: Language[];
  };
};

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result || null;
}

function normalizeNumber(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function normalizeAuthor(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (["pokemon", "pokémon", "ポケモン"].includes(v)) return "pokemon";
  if (["trainer", "dresseur", "trainer card", "trainercard", "グッズ", "サポート", "スタジアム", "ポケモンのどうぐ", "supporter", "item", "tool", "stadium"].includes(v)) return "trainer";
  if (["energy", "énergie", "energie", "特殊エネルギー", "basic energy", "special energy"].includes(v)) return "energy";
  return v;
}

function extractRepoCard(raw: Record<string, unknown>, setDir: string, language: Language, file: string): RepoCard {
  const rawType = raw.card_type ?? raw.category ?? raw.sub_type ?? null;
  const number = normalizeString(raw.number) ?? normalizeString(raw.local_id) ?? normalizeString(raw.localId);
  const author = normalizeAuthor(raw.author ?? raw.authors ?? raw.illustrator);
  const pokedexNumber =
    typeof raw.pokedex_number === "number"
      ? raw.pokedex_number
      : typeof raw.pokedexNumber === "number"
        ? raw.pokedexNumber
        : null;

  return {
    setDir,
    language,
    file,
    number,
    name: normalizeString(raw.name),
    category: normalizeCategory(rawType),
    pokedexNumber,
    author,
    printKey: normalizeString(raw.print_key ?? raw.printKey),
  };
}

function collectJsonFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collectJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) result.push(full);
  }
  return result;
}

function keyFor(setDir: string, language: Language, printKey: string | null, number: string | null): string | null {
  if (!printKey || !number) return null;
  return `${setDir}|||${language}|||${printKey}|||${number}`;
}

function evidenceKey(card: V3Card): string {
  return keyFor(card.setDir, card.language, card.printKey, card.number) ?? `${card.setDir}|||${card.language}|||${card.file}`;
}

function toEvidenceCard(card: RepoCard): EvidenceCard {
  return {
    language: card.language,
    file: card.file,
    number: card.number,
    name: card.name,
    category: card.category,
    pokedexNumber: card.pokedexNumber,
    author: card.author,
    printKey: card.printKey,
  };
}

function main() {
  const repoDir = path.resolve(argValue("repo", DEFAULT_REPO));
  const v3Path = path.resolve(argValue("v3", DEFAULT_V3));
  const outputPath = path.resolve(argValue("output", DEFAULT_OUTPUT));

  if (!fs.existsSync(v3Path)) {
    throw new Error(`Rapport V3 introuvable : ${v3Path}`);
  }
  if (!fs.existsSync(repoDir)) {
    throw new Error(`PTCG-database introuvable : ${repoDir}`);
  }

  console.log("=== AUDIT CARD ENTITY READINESS V4 ===");
  console.log(`V3 : ${v3Path}`);
  console.log(`Repo : ${repoDir}`);
  console.log(`Output : ${outputPath}`);
  console.log("Mode : lecture seule, aucune écriture Supabase");
  console.log("");

  const report = readJson<V3Report>(v3Path);

  // Index du dépôt : uniquement les cartes présentes dans les 148 sets éligibles V3.
  const eligibleSetDirs = new Set(report.sets.map((set) => set.setDir));
  const repoIndex = new Map<string, RepoCard[]>();
  const repoFiles = collectJsonFiles(repoDir);
  let parsedRepoCards = 0;
  let invalidRepoFiles = 0;

  for (const filePath of repoFiles) {
    const relative = path.relative(repoDir, filePath);
    const parts = relative.split(path.sep);
    if (parts.length < 3) continue;

    const language = parts[0] as Language;
    if (!LANGUAGES.includes(language)) continue;

    const setDir = parts[1];
    if (!eligibleSetDirs.has(setDir)) continue;

    let raw: Record<string, unknown>;
    try {
      raw = readJson<Record<string, unknown>>(filePath);
    } catch {
      invalidRepoFiles++;
      continue;
    }

    const card = extractRepoCard(raw, setDir, language, path.basename(filePath));
    const key = keyFor(setDir, language, card.printKey, card.number);
    if (!key) continue;

    const bucket = repoIndex.get(key) ?? [];
    bucket.push(card);
    repoIndex.set(key, bucket);
    parsedRepoCards++;
  }

  console.log(`Fichiers JSON parcourus : ${repoFiles.length}`);
  console.log(`Cartes indexées : ${parsedRepoCards}`);
  console.log(`Fichiers JSON invalides : ${invalidRepoFiles}`);
  console.log(`Clés d'évidence indexées : ${repoIndex.size}`);
  console.log("");

  const v4Cards: V4Card[] = [];

  const counters = {
    SAFE_FINAL: 0,
    SAFE_WITH_ANOMALY: 0,
    REVIEW_NECESSAIRE: 0,
    CONFLICT_A_VERIFIER: 0,
  } satisfies Record<V4Status, number>;

  for (const card of report.cards) {
    if (card.readiness === "NO_MATCH") continue;

    const positiveLanguages = Array.from(new Set([
      ...card.verifiedLanguages,
      ...card.structuralLanguages,
    ]));
    const negativeLanguages = Array.from(new Set([
      ...card.reviewLanguages,
      ...card.conflictLanguages,
    ]));

    const evidence = {
      verified: [] as EvidenceCard[],
      structural: [] as EvidenceCard[],
      review: [] as EvidenceCard[],
      conflict: [] as EvidenceCard[],
    };

    const addEvidence = (target: EvidenceCard[], language: Language) => {
      const key = keyFor(card.setDir, language, card.printKey, card.number);
      if (!key) return;
      const candidates = repoIndex.get(key) ?? [];
      for (const candidate of candidates) target.push(toEvidenceCard(candidate));
    };

    for (const language of card.verifiedLanguages) addEvidence(evidence.verified, language);
    for (const language of card.structuralLanguages) addEvidence(evidence.structural, language);
    for (const language of card.reviewLanguages) addEvidence(evidence.review, language);
    for (const language of card.conflictLanguages) addEvidence(evidence.conflict, language);

    const dedupeEvidence = (items: EvidenceCard[]) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = `${item.language}|${item.file}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    evidence.verified = dedupeEvidence(evidence.verified);
    evidence.structural = dedupeEvidence(evidence.structural);
    evidence.review = dedupeEvidence(evidence.review);
    evidence.conflict = dedupeEvidence(evidence.conflict);

    const hasVerifiedEvidence = card.verifiedLanguages.length > 0;
    const hasStructuralEvidence = card.structuralLanguages.length > 0;
    const hasReviewEvidence = card.reviewLanguages.length > 0;
    const hasConflictEvidence = card.conflictLanguages.length > 0;
    const hasAmbiguity = card.ambiguousLanguages.length > 0 || card.readiness === "SAFE_WITH_ANOMALY";

    let v4Status: V4Status;
    let finalDecision: V4Card["finalDecision"];

    // V4 volontairement plus conservatrice que V3 :
    // SAFE_FINAL exige une preuve VERIFIED et aucun signal négatif/ambiguïté.
    if (
      hasVerifiedEvidence &&
      !hasStructuralEvidence &&
      !hasReviewEvidence &&
      !hasConflictEvidence &&
      !hasAmbiguity &&
      card.uniquePositiveLanguages > 0
    ) {
      v4Status = "SAFE_FINAL";
      finalDecision = "AUTO_ENTITY";
    } else if (
      !hasReviewEvidence &&
      !hasConflictEvidence &&
      hasStructuralEvidence &&
      !hasVerifiedEvidence
    ) {
      v4Status = "SAFE_WITH_ANOMALY";
      finalDecision = "ENTITY_WITH_ANOMALY";
    } else if (hasConflictEvidence) {
      v4Status = "CONFLICT_A_VERIFIER";
      finalDecision = "DO_NOT_MERGE";
    } else {
      v4Status = "REVIEW_NECESSAIRE";
      finalDecision = "MANUAL_REVIEW";
    }

    counters[v4Status]++;

    v4Cards.push({
      ...card,
      v4Status,
      finalDecision,
      evidence,
      validation: {
        hasVerifiedEvidence,
        hasStructuralEvidence,
        hasReviewEvidence,
        hasConflictEvidence,
        hasAmbiguity,
        positiveLanguages,
        negativeLanguages,
      },
    });
  }

  // Résumé par set.
  const setMap = new Map<string, {
    setDir: string;
    languages: Language[];
    cardsTotalV3: number;
    safeFinal: number;
    safeWithAnomaly: number;
    reviewNecessaire: number;
    conflictAVerifier: number;
  }>();

  for (const set of report.sets) {
    setMap.set(set.setDir, {
      setDir: set.setDir,
      languages: set.languages,
      cardsTotalV3: set.cardsTotal,
      safeFinal: 0,
      safeWithAnomaly: 0,
      reviewNecessaire: 0,
      conflictAVerifier: 0,
    });
  }

  for (const card of v4Cards) {
    const set = setMap.get(card.setDir);
    if (!set) continue;
    if (card.v4Status === "SAFE_FINAL") set.safeFinal++;
    else if (card.v4Status === "SAFE_WITH_ANOMALY") set.safeWithAnomaly++;
    else if (card.v4Status === "REVIEW_NECESSAIRE") set.reviewNecessaire++;
    else set.conflictAVerifier++;
  }

  const sets = Array.from(setMap.values())
    .filter((set) => set.safeFinal || set.safeWithAnomaly || set.reviewNecessaire || set.conflictAVerifier)
    .sort((a, b) => b.safeFinal - a.safeFinal || b.safeWithAnomaly - a.safeWithAnomaly || a.setDir.localeCompare(b.setDir));

  const output = {
    generatedAt: new Date().toISOString(),
    mode: "card-entity-readiness-v4-from-v3",
    languages: report.languages,
    source: report.source,
    inputV3: path.basename(v3Path),
    rules: {
      SAFE_FINAL: "V3 SAFE uniquement : VERIFIED >= 1, aucune REVIEW, aucun CONFLICT, aucune ambiguïté.",
      SAFE_WITH_ANOMALY: "V3 SAFE_WITH_ANOMALY structural uniquement, sans REVIEW ni CONFLICT et sans VERIFIED.",
      REVIEW_NECESSAIRE: "Toute carte nécessitant une vérification manuelle mais sans conflit explicite.",
      CONFLICT_A_VERIFIER: "Toute carte avec au moins un conflit inter-langues ; aucune fusion automatique.",
      NO_MATCH: "Exclu de la liste V4 : aucune preuve inter-langues exploitable.",
      evidence: "Les cartes correspondantes sont résolues depuis le dépôt PTCG-database avec setDir + language + print_key + number.",
      supabaseWrites: false,
    },
    summary: {
      cardsV3Total: report.cards.length,
      cardsIncludedInV4: v4Cards.length,
      noMatchExcluded: report.cards.filter((card) => card.readiness === "NO_MATCH").length,
      SAFE_FINAL: counters.SAFE_FINAL,
      SAFE_WITH_ANOMALY: counters.SAFE_WITH_ANOMALY,
      REVIEW_NECESSAIRE: counters.REVIEW_NECESSAIRE,
      CONFLICT_A_VERIFIER: counters.CONFLICT_A_VERIFIER,
      repoCardsIndexed: parsedRepoCards,
      invalidRepoFiles: invalidRepoFiles,
      eligibleSets: report.sets.length,
    },
    sets,
    cards: v4Cards,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== RÉSULTAT V4 ===");
  console.log(`SAFE_FINAL          : ${counters.SAFE_FINAL}`);
  console.log(`SAFE_WITH_ANOMALY   : ${counters.SAFE_WITH_ANOMALY}`);
  console.log(`REVIEW_NECESSAIRE   : ${counters.REVIEW_NECESSAIRE}`);
  console.log(`CONFLICT_A_VERIFIER : ${counters.CONFLICT_A_VERIFIER}`);
  console.log(`NO_MATCH exclues    : ${output.summary.noMatchExcluded}`);
  console.log(`Cartes V4           : ${v4Cards.length}`);
  console.log("");
  console.log(`Rapport écrit : ${outputPath}`);
}

main();
