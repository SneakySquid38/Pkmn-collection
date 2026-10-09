import fs from "fs/promises";
import path from "path";

type Card = {
  language: string;
  number: string | null;
  name: string | null;
  category: string;
  pokedexNumber: number | null;
  author: string[];
};

type PairExample = {
  verdict: "VERIFIED" | "STRUCTURAL_VERIFIED" | "REVIEW" | "CONFLICT" | "UNMATCHED";
  printKey: string;
  a: Card;
  b: Card;
};

type PairResult = {
  a: string;
  b: string;
  examples: PairExample[];
};

type SetResult = {
  setDir: string;
  languages: string[];
  pairs: PairResult[];
};

type AuditFile = {
  generatedAt: string;
  summary: {
    setsEligible: number;
    verified: number;
    structuralVerified: number;
    review: number;
    conflict: number;
    unmatched: number;
    missingPrintKey: number;
    duplicatePrintKey: number;
  };
  sets: SetResult[];
};

type CardKey = string;

type CardStatus = {
  setDir: string;
  language: string;
  number: string | null;
  name: string | null;
  category: string;
  pokedexNumber: number | null;
  author: string[];
  verifiedLanguages: string[];
  structuralLanguages: string[];
  reviewLanguages: string[];
  conflictLanguages: string[];
  evidenceCount: number;
  readiness:
    | "SAFE"
    | "SAFE_WITH_ANOMALY"
    | "REVIEW"
    | "CONFLICT"
    | "NO_MATCH";
  reasons: string[];
};

function cardKey(setDir: string, card: Card): CardKey {
  return [
    setDir,
    card.language,
    card.number ?? "",
    card.name ?? "",
  ].join("::");
}

function sameIdentity(a: Card, b: Card): boolean {
  if (a.category === "pokemon" && b.category === "pokemon") {
    return (
      a.pokedexNumber !== null &&
      b.pokedexNumber !== null &&
      a.pokedexNumber === b.pokedexNumber
    );
  }

  if (a.category !== b.category) return false;

  return !!a.number && !!b.number && a.number === b.number;
}

function mergeStatus(current: CardStatus | undefined, card: Card): CardStatus {
  if (current) return current;

  return {
    setDir: "",
    language: card.language,
    number: card.number,
    name: card.name,
    category: card.category,
    pokedexNumber: card.pokedexNumber,
    author: card.author,
    verifiedLanguages: [],
    structuralLanguages: [],
    reviewLanguages: [],
    conflictLanguages: [],
    evidenceCount: 0,
    readiness: "NO_MATCH",
    reasons: [],
  };
}

async function main() {
  const inputPath = path.resolve("audit-card-matching-deterministic.json");
  const outputPath = path.resolve("audit-card-entity-readiness.json");

  const raw = await fs.readFile(inputPath, "utf8");
  const audit = JSON.parse(raw) as AuditFile;

  const statuses = new Map<CardKey, CardStatus>();

  for (const set of audit.sets) {
    for (const pair of set.pairs) {
      for (const example of pair.examples) {
        for (const side of [example.a, example.b]) {
          const key = cardKey(set.setDir, side);
          const existing = statuses.get(key);

          const status = mergeStatus(existing, side);
          status.setDir = set.setDir;
          status.evidenceCount++;

          if (example.verdict === "VERIFIED") {
            const other = side.language === pair.a ? pair.b : pair.a;
            if (!status.verifiedLanguages.includes(other)) {
              status.verifiedLanguages.push(other);
            }
          }

          if (example.verdict === "STRUCTURAL_VERIFIED") {
            const other = side.language === pair.a ? pair.b : pair.a;
            if (!status.structuralLanguages.includes(other)) {
              status.structuralLanguages.push(other);
            }
          }

          if (example.verdict === "REVIEW") {
            const other = side.language === pair.a ? pair.b : pair.a;
            if (!status.reviewLanguages.includes(other)) {
              status.reviewLanguages.push(other);
            }
          }

          if (example.verdict === "CONFLICT") {
            const other = side.language === pair.a ? pair.b : pair.a;
            if (!status.conflictLanguages.includes(other)) {
              status.conflictLanguages.push(other);
            }
          }

          statuses.set(key, status);
        }
      }
    }
  }

  /*
   * IMPORTANT:
   * This file only contains examples from the previous audit, not every
   * individual candidate. Therefore this readiness audit is conservative:
   * a card is SAFE only when every recorded evidence concerning it is
   * VERIFIED and it has at least one verified counterpart.
   *
   * We deliberately do not infer missing evidence as positive evidence.
   */

  for (const status of statuses.values()) {
    const hasVerified = status.verifiedLanguages.length > 0;
    const hasStructural = status.structuralLanguages.length > 0;
    const hasReview = status.reviewLanguages.length > 0;
    const hasConflict = status.conflictLanguages.length > 0;

    if (hasConflict) {
      status.readiness = "CONFLICT";
      status.reasons.push("au moins un conflit enregistré");
      continue;
    }

    if (hasReview) {
      status.readiness = "REVIEW";
      status.reasons.push("au moins une correspondance à revoir");
      continue;
    }

    if (hasVerified && !hasStructural) {
      status.readiness = "SAFE";
      status.reasons.push("au moins une correspondance VERIFIED et aucun signal négatif");
      continue;
    }

    if (hasVerified && hasStructural) {
      status.readiness = "SAFE_WITH_ANOMALY";
      status.reasons.push("VERIFIED accompagné d'une correspondance STRUCTURAL_VERIFIED");
      continue;
    }

    if (hasStructural) {
      status.readiness = "SAFE_WITH_ANOMALY";
      status.reasons.push("uniquement STRUCTURAL_VERIFIED dans les preuves disponibles");
      continue;
    }

    status.readiness = "NO_MATCH";
    status.reasons.push("aucune preuve positive dans les exemples disponibles");
  }

  const bySet = new Map<string, CardStatus[]>();
  for (const status of statuses.values()) {
    const list = bySet.get(status.setDir) ?? [];
    list.push(status);
    bySet.set(status.setDir, list);
  }

  const setSummary = [...bySet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([setDir, cards]) => ({
      setDir,
      cardsEvaluated: cards.length,
      safe: cards.filter((c) => c.readiness === "SAFE").length,
      safeWithAnomaly: cards.filter((c) => c.readiness === "SAFE_WITH_ANOMALY").length,
      review: cards.filter((c) => c.readiness === "REVIEW").length,
      conflict: cards.filter((c) => c.readiness === "CONFLICT").length,
      noMatch: cards.filter((c) => c.readiness === "NO_MATCH").length,
    }));

  const output = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    mode: "conservative-readiness-from-existing-evidence",
    warning:
      "Le précédent audit ne stocke que des exemples par paire. Ce rapport ne prétend donc pas classer toutes les cartes du dépôt. Il sert à identifier les cartes dont les preuves enregistrées permettent déjà une décision sûre.",
    summary: {
      cardsEvaluated: statuses.size,
      safe: [...statuses.values()].filter((c) => c.readiness === "SAFE").length,
      safeWithAnomaly: [...statuses.values()].filter((c) => c.readiness === "SAFE_WITH_ANOMALY").length,
      review: [...statuses.values()].filter((c) => c.readiness === "REVIEW").length,
      conflict: [...statuses.values()].filter((c) => c.readiness === "CONFLICT").length,
      noMatch: [...statuses.values()].filter((c) => c.readiness === "NO_MATCH").length,
      sourceSummary: audit.summary,
    },
    sets: setSummary,
    cards: [...statuses.values()].sort(
      (a, b) =>
        a.setDir.localeCompare(b.setDir) ||
        a.language.localeCompare(b.language) ||
        String(a.number).localeCompare(String(b.number))
    ),
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("========================================");
  console.log("AUDIT CARD ENTITY READINESS");
  console.log("========================================");
  console.log(`Cartes évaluées      : ${output.summary.cardsEvaluated}`);
  console.log(`SAFE                 : ${output.summary.safe}`);
  console.log(`SAFE_WITH_ANOMALY    : ${output.summary.safeWithAnomaly}`);
  console.log(`REVIEW               : ${output.summary.review}`);
  console.log(`CONFLICT             : ${output.summary.conflict}`);
  console.log(`NO_MATCH             : ${output.summary.noMatch}`);
  console.log(`Sets analysés        : ${setSummary.length}`);
  console.log(`Fichier              : ${outputPath}`);
  console.log("");
  console.log("AUCUNE écriture Supabase.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
