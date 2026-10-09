import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("PTCG-database");
const LANGUAGES = ["fr", "jp", "ko", "sc", "tc"] as const;
type Lang = (typeof LANGUAGES)[number];

type Card = {
  file: string;
  lang: Lang;
  setId: string;
  jp_id?: number | string;
  ko_id?: number | string;
  name?: string;
  number?: string | number;
  print_key?: string;
  card_key?: string;
  pokedex_number?: number | string;
  card_type?: string;
  rarity?: string;
  img?: string;
  set_name?: string;
  set_total?: number | string;
  author?: string | string[];
};

type Candidate = {
  confidence: "HIGH_VERIFIED" | "HIGH_STRUCTURAL" | "MEDIUM" | "CONFLICT" | "LOW" | "REVIEW";
  reason: string;
  setId: string;
  key: string;
  cards: Card[];
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function cardIdentity(card: Card): string {
  return `${card.lang}:${card.setId}:${card.file}`;
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function loadSet(lang: Lang, setId: string): Promise<Card[]> {
  const dir = path.join(ROOT, `data_${lang}`, setId);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".json")).sort();
  } catch {
    return [];
  }

  const cards: Card[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
      if (!raw || typeof raw !== "object") continue;
      cards.push({ ...raw, file, lang, setId });
    } catch {
      // Ignore malformed files here; the repository audit already checks validity.
    }
  }
  return cards;
}

function groupBy(cards: Card[], getter: (c: Card) => string): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of cards) {
    const key = getter(card);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(card);
    map.set(key, list);
  }
  return map;
}

function compareNumbers(a: Card, b: Card): boolean {
  return normalize(a.number).replace(/^0+/, "") === normalize(b.number).replace(/^0+/, "");
}

function compareDex(a: Card, b: Card): boolean {
  return normalize(a.pokedex_number) !== "" && normalize(a.pokedex_number) === normalize(b.pokedex_number);
}
function authorList(card: Card): string[] {
  const raw = Array.isArray(card.author) ? card.author : [card.author];
  return raw
    .map((v) => normalize(v).toLowerCase().replace(/\\s+/g, " "))
    .filter(Boolean);
}

function compareAuthor(a: Card, b: Card): "same" | "different" | "unknown" {
  const aa = authorList(a);
  const bb = authorList(b);
  if (!aa.length || !bb.length) return "unknown";
  const setB = new Set(bb);
  return aa.some((x) => setB.has(x)) ? "same" : "different";
}

function dexStatus(cards: Card[]): "same" | "different" | "unknown" {
  const values = cards.map((c) => normalize(c.pokedex_number)).filter(Boolean);
  if (!values.length) return "unknown";
  return new Set(values).size === 1 ? "same" : "different";
}

function authorStatus(cards: Card[]): "same" | "different" | "unknown" {
  const lists = cards.map(authorList);
  if (lists.some((x) => x.length === 0)) return "unknown";
  const base = new Set(lists[0]);
  return lists.slice(1).every((xs) => xs.some((x) => base.has(x))) ? "same" : "different";
}

function typeStatus(cards: Card[]): "same" | "different" | "unknown" {
  const values = cards.map((c) => normalize(c.card_type).toLowerCase()).filter(Boolean);
  if (!values.length) return "unknown";
  return new Set(values).size === 1 ? "same" : "different";
}

async function main() {
  const started = new Date().toISOString();
  const setsByLang = new Map<Lang, string[]>();
  for (const lang of LANGUAGES) {
    setsByLang.set(lang, await listDirs(path.join(ROOT, `data_${lang}`)));
  }

  const allSets = new Set<string>();
  for (const sets of setsByLang.values()) for (const set of sets) allSets.add(set);

  const eligibleSets = [...allSets].filter((setId) => {
    let count = 0;
    for (const lang of LANGUAGES) if (setsByLang.get(lang)?.includes(setId)) count++;
    return count >= 2;
  }).sort();

  const candidates: Candidate[] = [];
  const fallbackCandidates: Candidate[] = [];
  const perSet: any[] = [];

  for (const setId of eligibleSets) {
    const loaded = new Map<Lang, Card[]>();
    for (const lang of LANGUAGES) {
      if (setsByLang.get(lang)?.includes(setId)) loaded.set(lang, await loadSet(lang, setId));
    }

    const printGroups = new Map<string, Card[]>();
    for (const cards of loaded.values()) {
      for (const card of cards) {
        const key = normalize(card.print_key);
        if (!key) continue;
        const group = printGroups.get(key) ?? [];
        group.push(card);
        printGroups.set(key, group);
      }
    }

    let high = 0;
    let medium = 0;
    let review = 0;
    let fallback = 0;

    for (const [key, cards] of printGroups) {
      const langs = new Set(cards.map((c) => c.lang));
      if (langs.size < 2) continue;

      const counts = new Map<Lang, number>();
      for (const c of cards) counts.set(c.lang, (counts.get(c.lang) ?? 0) + 1);
      const duplicated = [...counts.values()].some((n) => n > 1);

      let confidence: Candidate["confidence"];
      let reason: string;
      const dex = dexStatus(cards);
      const authors = authorStatus(cards);
      const types = typeStatus(cards);

      // A different Pokédex identity is a hard contradiction for a Pokémon print_key.
      if (dex === "different") {
        confidence = "CONFLICT";
        reason = "print_key identique mais Pokédex différent entre les langues";
      } else if (dex === "same" && authors === "same" && !duplicated && cards.length === langs.size) {
        confidence = "HIGH_VERIFIED";
        reason = "print_key unique + même Pokédex + même auteur";
      } else if (dex === "same" && !duplicated && cards.length === langs.size) {
        confidence = "HIGH_VERIFIED";
        reason = "print_key unique + même Pokédex; auteur absent ou légèrement différent";
      } else if (dex === "unknown" && authors === "same" && !duplicated && cards.length === langs.size) {
        confidence = "HIGH_STRUCTURAL";
        reason = "print_key unique + même auteur + même type de carte, sans Pokédex disponible";
      } else if (dex === "same" && (authors === "same" || authors === "unknown")) {
        confidence = "MEDIUM";
        reason = "même Pokédex + print_key commun, mais groupe ambigu ou auteur incomplet";
      } else if (dex === "unknown" && authors === "different") {
        confidence = "MEDIUM";
        reason = "print_key commun mais auteurs différents sur une carte sans Pokédex";
      } else {
        confidence = "REVIEW";
        reason = `print_key ambigu/incomplet (dex=${dex}, author=${authors}, type=${types})`;
      }

      if (confidence === "HIGH_VERIFIED") high++;
      else if (confidence === "HIGH_STRUCTURAL") high++;
      else if (confidence === "MEDIUM") medium++;
      else if (confidence === "REVIEW") review++;

      candidates.push({ confidence, reason, setId, key, cards });
    }

    // Fallback: same set + number + Pokédex number, only when print_key did not
    // already create a candidate spanning those two languages.
    const numberGroups = new Map<string, Card[]>();
    for (const cards of loaded.values()) {
      for (const card of cards) {
        const number = normalize(card.number);
        const dex = normalize(card.pokedex_number);
        if (!number || !dex) continue;
        const key = `${number.replace(/^0+/, "")}::${dex}`;
        const group = numberGroups.get(key) ?? [];
        group.push(card);
        numberGroups.set(key, group);
      }
    }

    for (const [key, cards] of numberGroups) {
      const langs = new Set(cards.map((c) => c.lang));
      if (langs.size < 2) continue;
      const printKeys = new Set(cards.map((c) => normalize(c.print_key)).filter(Boolean));
      if (printKeys.size === 1) continue;
      // Only propose a fallback when each language contributes at most one card.
      const counts = new Map<Lang, number>();
      for (const c of cards) counts.set(c.lang, (counts.get(c.lang) ?? 0) + 1);
      if ([...counts.values()].some((n) => n > 1)) continue;
      fallbackCandidates.push({
        confidence: "LOW",
        reason: "même set + même numéro + même Pokédex, mais print_key absent/différent",
        setId,
        key,
        cards,
      });
      fallback++;
    }

    perSet.push({
      setId,
      languages: [...loaded.keys()],
      cardsByLanguage: Object.fromEntries([...loaded.entries()].map(([l, cards]) => [l, cards.length])),
      printKeyGroups: printGroups.size,
      candidatesHigh: high,
      candidatesMedium: medium,
      candidatesReview: review,
      fallbackLow: fallback,
    });
  }

  const result = {
    generatedAt: started,
    root: ROOT,
    languages: LANGUAGES,
    eligibleSets: eligibleSets.length,
    candidateSummary: {
      highVerified: candidates.filter((c) => c.confidence === "HIGH_VERIFIED").length,
      highStructural: candidates.filter((c) => c.confidence === "HIGH_STRUCTURAL").length,
      medium: candidates.filter((c) => c.confidence === "MEDIUM").length,
      conflict: candidates.filter((c) => c.confidence === "CONFLICT").length,
      review: candidates.filter((c) => c.confidence === "REVIEW").length,
      lowFallback: fallbackCandidates.length,
    },
    candidates: candidates.map((c) => ({
      confidence: c.confidence,
      reason: c.reason,
      setId: c.setId,
      key: c.key,
      cards: c.cards.map((card) => ({
        lang: card.lang,
        file: card.file,
        name: card.name,
        number: card.number,
        print_key: card.print_key,
        card_key: card.card_key,
        pokedex_number: card.pokedex_number,
        card_type: card.card_type,
        rarity: card.rarity,
        author: card.author,
      })),
    })),
    fallbackCandidates: fallbackCandidates.map((c) => ({
      confidence: c.confidence,
      reason: c.reason,
      setId: c.setId,
      key: c.key,
      cards: c.cards.map((card) => ({
        lang: card.lang,
        file: card.file,
        name: card.name,
        number: card.number,
        print_key: card.print_key,
        card_key: card.card_key,
        pokedex_number: card.pokedex_number,
        card_type: card.card_type,
        rarity: card.rarity,
        author: card.author,
      })),
    })),
    perSet,
  };

  const out = path.resolve("preview-card-entities-ptcg.json");
  await fs.writeFile(out, JSON.stringify(result, null, 2), "utf8");

  console.log("========================================");
  console.log("PREVIEW CARD ENTITIES — LECTURE SEULE");
  console.log("========================================");
  console.log(`Sets éligibles : ${eligibleSets.length}`);
  console.log(`HIGH VERIFIED    : ${result.candidateSummary.highVerified}`);
  console.log(`HIGH STRUCTURAL  : ${result.candidateSummary.highStructural}`);
  console.log(`MEDIUM           : ${result.candidateSummary.medium}`);
  console.log(`CONFLICT         : ${result.candidateSummary.conflict}`);
  console.log(`REVIEW           : ${result.candidateSummary.review}`);
  console.log(`Fallback LOW     : ${result.candidateSummary.lowFallback}`);
  console.log(`Fichier           : ${out}`);
  console.log("");
  console.log("AUCUNE écriture Supabase. Aucun card_entity créé.");
  console.log("");
  console.log("Exemples HIGH VERIFIED :");
  for (const c of candidates.filter((x) => x.confidence === "HIGH_VERIFIED").slice(0, 15)) {
    console.log(`  ${c.setId} | ${c.key} | ${c.cards.map((x) => `${x.lang}:${x.number}:${x.name ?? "?"}`).join(" || ")}`);
  }
  console.log("");
  console.log("Exemples MEDIUM/CONFLICT/REVIEW :");
  for (const c of candidates.filter((x) => x.confidence === "MEDIUM" || x.confidence === "CONFLICT" || x.confidence === "REVIEW").slice(0, 20)) {
    console.log(`  ${c.confidence} ${c.setId} | ${c.key} | ${c.cards.map((x) => `${x.lang}:${x.number}:${x.name ?? "?"}`).join(" || ")}`);
  }
  console.log("");
  console.log("Exemples fallback LOW :");
  for (const c of fallbackCandidates.slice(0, 15)) {
    console.log(`  ${c.setId} | ${c.key} | ${c.cards.map((x) => `${x.lang}:${x.number}:${x.name ?? "?"}`).join(" || ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
