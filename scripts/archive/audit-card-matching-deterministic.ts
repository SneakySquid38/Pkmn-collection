import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

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
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string;
  category: string | null;
  artist: string | null;
  dex_ids: unknown;
};

type PtcgCard = {
  language: string;
  setDir: string;
  file: string;
  number: string | null;
  name: string | null;
  printKey: string | null;
  cardKey: string | null;
  author: string[];
  cardType: string | null;
  category: "pokemon" | "trainer" | "energy" | "unknown";
  pokedexNumber: number | null;
};

type PairVerdict =
  | "VERIFIED"
  | "STRUCTURAL_VERIFIED"
  | "REVIEW"
  | "CONFLICT"
  | "UNMATCHED";

async function getAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Erreur lecture ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
  }

  return rows;
}

function normalize(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function normalizeNumber(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(Number(s));
  return s;
}

function normalizeAuthor(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function authorsEqual(a: string[], b: string[]): boolean {
  const aa = a.map(normalizeAuthor).filter(Boolean).sort();
  const bb = b.map(normalizeAuthor).filter(Boolean).sort();
  if (!aa.length || !bb.length) return false;
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function getCategory(cardType: string | null): PtcgCard["category"] {
  const t = normalize(cardType);
  if (t === "pokémon" || t === "pokemon") return "pokemon";
  if (
    t === "グッズ" ||
    t === "ポケモンのどうぐ" ||
    t === "サポート" ||
    t === "スタジアム" ||
    t.includes("trainer")
  ) {
    return "trainer";
  }
  if (t === "特殊エネルギー" || t.includes("energy")) return "energy";
  return "unknown";
}

function getPokedex(card: any): number | null {
  const n = Number(card?.pokedex_number);
  return Number.isFinite(n) ? n : null;
}

function getAuthors(card: any): string[] {
  const raw = Array.isArray(card?.author) ? card.author : [];
  return raw.map((x: unknown) => String(x ?? "")).filter(Boolean);
}

function getPrintKey(card: any): string | null {
  const v = card?.print_key ?? null;
  return v ? String(v).trim() : null;
}

function getCardKey(card: any): string | null {
  const v = card?.card_key ?? null;
  return v ? String(v).trim() : null;
}

function toPtcgCard(language: string, setDir: string, file: string, raw: any): PtcgCard {
  const cardType = raw?.card_type ? String(raw.card_type) : null;
  return {
    language,
    setDir,
    file,
    number: normalizeNumber(raw?.number),
    name: raw?.name ? String(raw.name) : null,
    printKey: getPrintKey(raw),
    cardKey: getCardKey(raw),
    author: getAuthors(raw),
    cardType,
    category: getCategory(cardType),
    pokedexNumber: getPokedex(raw),
  };
}

async function loadRepoCards(): Promise<PtcgCard[]> {
  const root = path.resolve("PTCG-database");
  const languages = ["fr", "jp", "ko", "sc", "tc"];
  const result: PtcgCard[] = [];

  for (const language of languages) {
    const langDir = path.join(root, `data_${language}`);
    let sets: string[] = [];
    try {
      sets = await fs.readdir(langDir);
    } catch {
      continue;
    }

    for (const setDir of sets) {
      const fullSetDir = path.join(langDir, setDir);
      const stat = await fs.stat(fullSetDir).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const files = (await fs.readdir(fullSetDir))
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .sort();

      for (const file of files) {
        try {
          const raw = JSON.parse(await fs.readFile(path.join(fullSetDir, file), "utf8"));
          result.push(toPtcgCard(language, setDir, file, raw));
        } catch {
          // L'audit final ignore silencieusement les JSON invalides.
        }
      }
    }
  }

  return result;
}

function pairVerdict(a: PtcgCard, b: PtcgCard): PairVerdict {
  const samePrint = !!a.printKey && !!b.printKey && a.printKey === b.printKey;
  const sameNumber = !!a.number && !!b.number && a.number === b.number;
  const sameAuthor = authorsEqual(a.author, b.author);

  // Pokémon : un conflit de Pokédex interdit toute fusion automatique.
  if (a.category === "pokemon" && b.category === "pokemon") {
    if (
      a.pokedexNumber !== null &&
      b.pokedexNumber !== null &&
      a.pokedexNumber !== b.pokedexNumber
    ) {
      return "CONFLICT";
    }

    if (samePrint && a.pokedexNumber !== null && a.pokedexNumber === b.pokedexNumber) {
      if (sameAuthor) return "VERIFIED";
      if (!a.author.length || !b.author.length) return "REVIEW";
      return "REVIEW";
    }

    if (sameNumber && a.pokedexNumber !== null && a.pokedexNumber === b.pokedexNumber) {
      return sameAuthor ? "STRUCTURAL_VERIFIED" : "REVIEW";
    }

    return "UNMATCHED";
  }

  // Pokémon vs non-Pokémon : conflit structurel.
  if (a.category !== b.category) {
    return "CONFLICT";
  }

  // Dresseur / énergie : pas de Pokédex disponible.
  if (samePrint && sameNumber && sameAuthor) {
    return "STRUCTURAL_VERIFIED";
  }

  if (samePrint && sameNumber) {
    return "REVIEW";
  }

  if (samePrint && sameAuthor) {
    return "REVIEW";
  }

  return "UNMATCHED";
}

function buildPrintIndex(cards: PtcgCard[]) {
  const map = new Map<string, PtcgCard[]>();
  for (const card of cards) {
    if (!card.printKey) continue;
    const list = map.get(card.printKey) ?? [];
    list.push(card);
    map.set(card.printKey, list);
  }
  return map;
}

function buildNumberIndex(cards: PtcgCard[]) {
  const map = new Map<string, PtcgCard[]>();
  for (const card of cards) {
    if (!card.number) continue;
    const list = map.get(card.number) ?? [];
    list.push(card);
    map.set(card.number, list);
  }
  return map;
}

async function main() {
  console.log("========================================");
  console.log("AUDIT CARD MATCHING — DÉTERMINISTE");
  console.log("LECTURE SEULE — AUCUNE ÉCRITURE");
  console.log("========================================");

  const repoCards = await loadRepoCards();
  const sets = await getAll<SetRow>("sets", "id,source_id,name,language");
  const dbCards = await getAll<CardRow>(
    "cards",
    "id,set_id,source_id,local_id,number,name,language,category,artist,dex_ids"
  );

  console.log(`Cartes PTCG-database chargées : ${repoCards.length}`);
  console.log(`Cartes Supabase chargées      : ${dbCards.length}`);

  const bySetLang = new Map<string, PtcgCard[]>();
  for (const card of repoCards) {
    const key = `${card.setDir}::${card.language}`;
    const list = bySetLang.get(key) ?? [];
    list.push(card);
    bySetLang.set(key, list);
  }

  const setLanguages = new Map<string, Set<string>>();
  for (const card of repoCards) {
    const langs = setLanguages.get(card.setDir) ?? new Set<string>();
    langs.add(card.language);
    setLanguages.set(card.setDir, langs);
  }

  const eligibleSets = [...setLanguages.entries()]
    .filter(([, langs]) => langs.size >= 2)
    .map(([setDir]) => setDir)
    .sort();

  const summary = {
    setsEligible: eligibleSets.length,
    verified: 0,
    structuralVerified: 0,
    review: 0,
    conflict: 0,
    unmatched: 0,
    missingPrintKey: 0,
    duplicatePrintKey: 0,
    examples: {
      verified: [] as unknown[],
      structuralVerified: [] as unknown[],
      review: [] as unknown[],
      conflict: [] as unknown[],
      unmatched: [] as unknown[],
    },
  };

  const setResults: any[] = [];

  for (const setDir of eligibleSets) {
    const langs = [...(setLanguages.get(setDir) ?? new Set<string>())].sort();
    const cardsByLang = new Map<string, PtcgCard[]>();

    for (const lang of langs) {
      cardsByLang.set(lang, bySetLang.get(`${setDir}::${lang}`) ?? []);
    }

    const langStats: any[] = [];
    const pairResults: any[] = [];

    for (const lang of langs) {
      const cards = cardsByLang.get(lang) ?? [];
      const printIndex = buildPrintIndex(cards);

      let missingPrintKey = 0;
      let duplicatePrintKey = 0;
      for (const card of cards) {
        if (!card.printKey) missingPrintKey++;
      }
      for (const [, group] of printIndex) {
        if (group.length > 1) duplicatePrintKey++;
      }

      summary.missingPrintKey += missingPrintKey;
      summary.duplicatePrintKey += duplicatePrintKey;

      langStats.push({
        language: lang,
        cards: cards.length,
        missingPrintKey,
        duplicatePrintKey,
      });
    }

    for (let i = 0; i < langs.length; i++) {
      for (let j = i + 1; j < langs.length; j++) {
        const la = langs[i];
        const lb = langs[j];
        const aCards = cardsByLang.get(la) ?? [];
        const bCards = cardsByLang.get(lb) ?? [];

        const bPrint = buildPrintIndex(bCards);
        const pair = {
          a: la,
          b: lb,
          verified: 0,
          structuralVerified: 0,
          review: 0,
          conflict: 0,
          unmatched: 0,
          examples: [] as unknown[],
        };

        for (const a of aCards) {
          if (!a.printKey) continue;
          const candidates = bPrint.get(a.printKey) ?? [];

          if (!candidates.length) continue;

          for (const b of candidates) {
            const verdict = pairVerdict(a, b);

            if (verdict === "VERIFIED") {
              pair.verified++;
              summary.verified++;
            } else if (verdict === "STRUCTURAL_VERIFIED") {
              pair.structuralVerified++;
              summary.structuralVerified++;
            } else if (verdict === "REVIEW") {
              pair.review++;
              summary.review++;
            } else if (verdict === "CONFLICT") {
              pair.conflict++;
              summary.conflict++;
            } else {
              pair.unmatched++;
              summary.unmatched++;
            }

            if (pair.examples.length < 20 && verdict !== "UNMATCHED") {
              pair.examples.push({
                verdict,
                printKey: a.printKey,
                a: {
                  language: a.language,
                  number: a.number,
                  name: a.name,
                  category: a.category,
                  pokedexNumber: a.pokedexNumber,
                  author: a.author,
                },
                b: {
                  language: b.language,
                  number: b.number,
                  name: b.name,
                  category: b.category,
                  pokedexNumber: b.pokedexNumber,
                  author: b.author,
                },
              });
            }

            const bucket = summary.examples[verdict === "STRUCTURAL_VERIFIED" ? "structuralVerified" : verdict.toLowerCase() as keyof typeof summary.examples];
            if (bucket && bucket.length < 30 && verdict !== "UNMATCHED") {
              bucket.push({
                setDir,
                printKey: a.printKey,
                a: { language: a.language, number: a.number, name: a.name, category: a.category, pokedexNumber: a.pokedexNumber, author: a.author },
                b: { language: b.language, number: b.number, name: b.name, category: b.category, pokedexNumber: b.pokedexNumber, author: b.author },
              });
            }
          }
        }

        pairResults.push(pair);
      }
    }

    setResults.push({
      setDir,
      languages: langs,
      languageStats: langStats,
      pairs: pairResults,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: "deterministic-read-only",
    languages: ["fr", "jp", "ko", "sc", "tc"],
    rules: {
      pokemonVerified: "same print_key + same pokedex_number + same author",
      pokemonConflict: "different pokedex_number OR pokemon/non-pokemon category mismatch",
      trainerEnergyVerified: "same print_key + same number + same author",
      authorRole: "validation signal; never overrides a Pokémon identity conflict",
      noSupabaseWrites: true,
    },
    summary,
    sets: setResults,
  };

  const outputPath = path.resolve("audit-card-matching-deterministic.json");
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log("========================================");
  console.log(`Sets éligibles       : ${summary.setsEligible}`);
  console.log(`VERIFIED             : ${summary.verified}`);
  console.log(`STRUCTURAL VERIFIED  : ${summary.structuralVerified}`);
  console.log(`REVIEW               : ${summary.review}`);
  console.log(`CONFLICT             : ${summary.conflict}`);
  console.log(`UNMATCHED            : ${summary.unmatched}`);
  console.log(`Missing print_key    : ${summary.missingPrintKey}`);
  console.log(`Duplicate print_key  : ${summary.duplicatePrintKey}`);
  console.log(`Fichier              : ${outputPath}`);
  console.log("");
  console.log("AUCUNE écriture Supabase.");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
