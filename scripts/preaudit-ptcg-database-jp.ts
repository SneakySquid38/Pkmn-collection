import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const PTCG_ROOT = path.resolve("PTCG-database", "data_jp");
const PAGE_SIZE = 1000;

const CANDIDATE_SETS = [
  "LL", "XY2", "XY3", "XY4", "XY6", "XY7", "CP3", "CP5", "CP6",
  "SM0", "SMP2",
  "S1W", "S1H", "S1a", "S2", "S3", "S3a",
  "S7R", "S10D",
  "S5R", "S5a", "S6a", "S2a", "S4a",
];

type SetRow = {
  id: string;
  source_id: string;
  language: string;
  name: string | null;
  total_cards: number | null;
};

type CardRow = {
  id: string;
  set_id: string;
  source: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
};

type JsonCard = {
  jp_id?: number | string;
  number?: string | number;
  set_total?: string | number;
  name?: string;
  rarity?: string;
  pokedex_number?: number | string;
  card_type?: string;
  types?: string[];
  hp?: number | string;
  author?: string[];
  image?: string;
  print_key?: string;
  url?: string;
};

async function getAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Erreur lecture ${table}: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

function normalizeNumber(value: unknown): string {
  if (value === null || value === undefined) return "";
  const v = String(value).trim();
  if (/^\d+$/.test(v)) return String(Number(v));
  return v.toUpperCase();
}

function readJson(filePath: string): JsonCard | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonCard;
  } catch {
    return null;
  }
}

function sortNumbers(values: string[]): string[] {
  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

function list(values: string[], max = 20): string {
  if (!values.length) return "aucun";
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} ... (+${values.length - max})`;
}

async function main() {
  console.log("==============================================");
  console.log(" PRÉ-AUDIT PTCG-DATABASE — SETS JP");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  if (!fs.existsSync(PTCG_ROOT)) {
    throw new Error(`Dossier introuvable : ${PTCG_ROOT}`);
  }

  const sets = await getAll<SetRow>(
    "sets",
    "id,source_id,language,name,total_cards"
  );

  const jpSets = new Map(
    sets
      .filter((set) => set.language?.toUpperCase() === "JP")
      .map((set) => [set.source_id.toUpperCase(), set])
  );

  const cards = await getAll<CardRow>(
    "cards",
    "id,set_id,source,source_id,local_id,number,name"
  );

  const cardsBySet = new Map<string, CardRow[]>();

  for (const card of cards) {
    const rows = cardsBySet.get(card.set_id) ?? [];
    rows.push(card);
    cardsBySet.set(card.set_id, rows);
  }

  type Audit = {
    setId: string;
    folder: string | null;
    files: number;
    valid: number;
    invalid: number;
    uniqueNumbers: number;
    duplicateNumbers: string[];
    missingNumbers: string[];
    minNumber: string | null;
    maxNumber: string | null;
    setTotals: string[];
    missingRarity: number;
    missingDex: number;
    pokemon: number;
    trainer: number;
    energy: number;
    otherTypes: string[];
    missingName: number;
    missingImage: number;
    missingPrintKey: number;
    missingHp: number;
    missingAuthors: number;
    dbCards: number;
    dbPtcgCards: number;
    dbTotalCards: number | null;
    notes: string[];
  };

  const audits: Audit[] = [];

  for (const setId of CANDIDATE_SETS) {
    const folderEntries = fs.readdirSync(PTCG_ROOT, {
      withFileTypes: true,
    });

    const folderEntry = folderEntries.find(
      (entry) =>
        entry.isDirectory() &&
        entry.name.toUpperCase() === setId.toUpperCase()
    );

    const folder = folderEntry?.name ?? null;

    if (!folder) {
      audits.push({
        setId,
        folder: null,
        files: 0,
        valid: 0,
        invalid: 0,
        uniqueNumbers: 0,
        duplicateNumbers: [],
        missingNumbers: [],
        minNumber: null,
        maxNumber: null,
        setTotals: [],
        missingRarity: 0,
        missingDex: 0,
        pokemon: 0,
        trainer: 0,
        energy: 0,
        otherTypes: [],
        missingName: 0,
        missingImage: 0,
        missingPrintKey: 0,
        missingHp: 0,
        missingAuthors: 0,
        dbCards: 0,
        dbPtcgCards: 0,
        dbTotalCards: null,
        notes: ["Dossier PTCG-database absent"],
      });
      continue;
    }

    const files = fs
      .readdirSync(path.join(PTCG_ROOT, folder), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && entry.name.toLowerCase().endsWith(".json")
      );

    const jsonCards: JsonCard[] = [];
    let invalid = 0;

    for (const file of files) {
      const card = readJson(path.join(PTCG_ROOT, folder, file.name));

      if (!card) {
        invalid++;
      } else {
        jsonCards.push(card);
      }
    }

    const numbers = jsonCards
      .map((card) => normalizeNumber(card.number))
      .filter(Boolean);

    const uniqueNumbers = new Set(numbers);

    const duplicateNumbers = [
      ...new Set(
        numbers.filter(
          (number, index) => numbers.indexOf(number) !== index
        )
      ),
    ];

    const numericNumbers = numbers.filter((n) => /^\d+$/.test(n));
    const maxNumeric = numericNumbers.length
      ? Math.max(...numericNumbers.map(Number))
      : 0;

    const expected = Array.from({ length: maxNumeric }, (_, i) =>
      String(i + 1)
    );

    const missingNumbers =
      maxNumeric > 0
        ? expected.filter((number) => !uniqueNumbers.has(number))
        : [];

    const setTotals = [
      ...new Set(
        jsonCards
          .map((card) =>
            card.set_total === undefined || card.set_total === null
              ? ""
              : String(card.set_total)
          )
          .filter(Boolean)
      ),
    ];

    let missingRarity = 0;
    let missingDex = 0;
    let pokemon = 0;
    let trainer = 0;
    let energy = 0;
    let missingName = 0;
    let missingImage = 0;
    let missingPrintKey = 0;
    let missingHp = 0;
    let missingAuthors = 0;
    const otherTypes = new Set<string>();

    for (const card of jsonCards) {
      if (!card.rarity) missingRarity++;
      if (
        card.pokedex_number === undefined ||
        card.pokedex_number === null
      ) {
        missingDex++;
      }

      if (!card.name) missingName++;
      if (!card.image) missingImage++;
      if (!card.print_key) missingPrintKey++;
      if (card.hp === undefined || card.hp === null) missingHp++;
      if (!card.author || card.author.length === 0) missingAuthors++;

      const type = (card.card_type ?? "").trim();

      if (type === "Pokémon") pokemon++;
      else if (type === "Trainer") trainer++;
      else if (type === "Energy") energy++;
      else if (type) otherTypes.add(type);
    }

    const dbSet = jpSets.get(setId.toUpperCase());
    const dbRows = dbSet ? cardsBySet.get(dbSet.id) ?? [] : [];
    const dbPtcgCards = dbRows.filter(
      (card) => card.source === "ptcg-database"
    ).length;

    const notes: string[] = [];

    if (dbRows.length > 0) {
      notes.push(`SQL contient déjà ${dbRows.length} carte(s)`);
    }

    if (setTotals.length > 1) {
      notes.push(`set_total incohérent: ${setTotals.join(", ")}`);
    }

    if (setTotals.length === 1 && Number(setTotals[0]) !== files.length) {
      notes.push(
        `set_total=${setTotals[0]} mais ${files.length} fichiers`
      );
    }

    if (duplicateNumbers.length) {
      notes.push("doublons de numéros");
    }

    if (missingNumbers.length) {
      notes.push(
        `trous de numérotation jusqu'à ${maxNumeric}: ${list(missingNumbers)}`
      );
    }

    if (otherTypes.size) {
      notes.push(`types inconnus: ${[...otherTypes].join(", ")}`);
    }

    audits.push({
      setId,
      folder,
      files: files.length,
      valid: jsonCards.length,
      invalid,
      uniqueNumbers: uniqueNumbers.size,
      duplicateNumbers,
      missingNumbers,
      minNumber: numericNumbers.length
        ? String(Math.min(...numericNumbers.map(Number)))
        : null,
      maxNumber: numericNumbers.length ? String(maxNumeric) : null,
      setTotals,
      missingRarity,
      missingDex,
      pokemon,
      trainer,
      energy,
      otherTypes: [...otherTypes],
      missingName,
      missingImage,
      missingPrintKey,
      missingHp,
      missingAuthors,
      dbCards: dbRows.length,
      dbPtcgCards,
      dbTotalCards: dbSet?.total_cards ?? null,
      notes,
    });
  }

  // --------------------------------------------------
  // Résumé tableau
  // --------------------------------------------------

  console.log(
    "SET | FICHIERS | UNIQUES | TOTAL JSON | DEX | RARETÉ | POKÉ | DRES | ÉNERGIE | SQL"
  );
  console.log(
    "--------------------------------------------------------------------------------"
  );

  for (const a of audits) {
    console.log(
      `${a.setId.padEnd(5)} | ` +
      `${String(a.files).padStart(7)} | ` +
      `${String(a.uniqueNumbers).padStart(7)} | ` +
      `${(a.setTotals.join("/") || "-").padStart(10)} | ` +
      `${String(a.missingDex).padStart(3)} | ` +
      `${String(a.missingRarity).padStart(6)} | ` +
      `${String(a.pokemon).padStart(4)} | ` +
      `${String(a.trainer).padStart(4)} | ` +
      `${String(a.energy).padStart(7)} | ` +
      `${String(a.dbCards).padStart(3)}`
    );
  }

  // --------------------------------------------------
  // Détails des anomalies
  // --------------------------------------------------

  console.log("\n==============================================");
  console.log(" DÉTAIL DES CONTRÔLES");
  console.log("==============================================");

  for (const a of audits) {
    const hasProblem =
      a.invalid > 0 ||
      a.duplicateNumbers.length > 0 ||
      a.missingNumbers.length > 0 ||
      a.setTotals.length > 1 ||
      a.missingName > 0 ||
      a.missingImage > 0 ||
      a.missingPrintKey > 0 ||
      a.notes.length > 0;

    console.log(`\n${a.setId}`);

    console.log(
      `  Fichiers : ${a.files} | JSON valides : ${a.valid} | invalides : ${a.invalid}`
    );
    console.log(
      `  Numéros : ${a.uniqueNumbers} uniques | min=${a.minNumber ?? "-"} | max=${a.maxNumber ?? "-"}`
    );
    console.log(
      `  set_total : ${a.setTotals.join(", ") || "-"}`
    );
    console.log(
      `  Pokémon=${a.pokemon} | Dresseur=${a.trainer} | Énergie=${a.energy}`
    );
    console.log(
      `  Sans rareté=${a.missingRarity} | Sans dex=${a.missingDex}`
    );
    console.log(
      `  Sans nom=${a.missingName} | Sans image=${a.missingImage} | Sans print_key=${a.missingPrintKey}`
    );
    console.log(
      `  Sans HP=${a.missingHp} | Sans auteur=${a.missingAuthors}`
    );
    console.log(
      `  SQL cartes=${a.dbCards} | SQL PTCG-database=${a.dbPtcgCards} | SQL total_cards=${a.dbTotalCards ?? "-"}`
    );

    if (a.duplicateNumbers.length) {
      console.log(
        `  ⚠️ Doublons : ${list(a.duplicateNumbers)}`
      );
    }

    if (a.missingNumbers.length) {
      console.log(
        `  ⚠️ Trous : ${list(a.missingNumbers)}`
      );
    }

    if (a.notes.length) {
      for (const note of a.notes) {
        console.log(`  ⚠️ ${note}`);
      }
    }

    if (!hasProblem) {
      console.log("  ✅ Aucun problème détecté par ce pré-audit.");
    }
  }

  // --------------------------------------------------
  // Verdict
  // --------------------------------------------------

  const clean = audits.filter(
    (a) =>
      a.files > 0 &&
      a.invalid === 0 &&
      a.uniqueNumbers === a.files &&
      a.duplicateNumbers.length === 0 &&
      a.missingNumbers.length === 0 &&
      a.setTotals.length === 1 &&
      Number(a.setTotals[0]) === a.files &&
      a.dbPtcgCards === 0
  );

  console.log("\n==============================================");
  console.log(" RÉSUMÉ FINAL");
  console.log("==============================================");
  console.log(`Sets analysés       : ${audits.length}`);
  console.log(`Sets propres        : ${clean.length}`);
  console.log(
    `Sets nécessitant examen : ${audits.length - clean.length}`
  );

  console.log("\nSETS PROPRES POUR L'ÉTAPE D'IMPORT :");

  if (!clean.length) {
    console.log("  Aucun.");
  } else {
    for (const a of clean) {
      console.log(`  ${a.setId} → ${a.files} cartes`);
    }
  }

  console.log("\n🟢 PRÉ-AUDIT TERMINÉ — aucune donnée Supabase modifiée.");
}

main().catch((error) => {
  console.error(
    "\n🔴 ERREUR :",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
