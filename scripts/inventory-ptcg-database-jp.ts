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

// Sets JP dont TCGdex /ja/sets/{id} retourne actuellement 0 carte détaillée.
// S4 a déjà été récupéré depuis PTCG-database et est donc exclu de l'inventaire
// des candidats à importer.
const TCGDEX_ZERO_DETAIL_SETS = [
  "ADV1", "ADV2", "ADV3", "ADV4", "ADV5",
  "PCG10",
  "L1b", "L1a", "L2", "LL", "L3",
  "XY1b", "XY1a", "XY2", "XY3", "XY4", "XY5a", "XY5b",
  "XY6", "XY7", "XY8a", "XY8b", "XY9", "CP3", "XY10",
  "CP4", "XY11b", "XY11a", "CP5", "CP6",
  "SM0", "SM1+", "sm2+", "SM3+", "SM4+", "SM5+", "SMP2",
  "S1W", "S1H", "S1a", "S2", "S3", "S3a",
  "S7R", "S10D", "S8a", "S5R", "S5a", "S6a",
  "S4", "S2a", "S4a", "S10b",
];

type SetRow = {
  id: string;
  source_id: string;
  language: string;
  name: string | null;
};

type CardRow = {
  id: string;
  set_id: string;
  source: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
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

function normalizeNumber(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();

  if (/^\d+$/.test(v)) {
    return String(Number(v));
  }

  return v.toUpperCase();
}

function readJsonFile(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  console.log("==============================================");
  console.log(" INVENTAIRE PTCG-DATABASE — SETS JP TCGDEX 0");
  console.log(" Lecture seule — aucune modification");
  console.log("==============================================\n");

  if (!fs.existsSync(PTCG_ROOT)) {
    throw new Error(
      `Dossier introuvable : ${PTCG_ROOT}\n` +
      "Vérifie que PTCG-database est bien cloné à la racine du projet."
    );
  }

  // --------------------------------------------------
  // 1. Sets JP Supabase
  // --------------------------------------------------

  const sets = await getAll<SetRow>(
    "sets",
    "id,source_id,language,name"
  );

  const jpSets = sets.filter(
    (set) => set.language?.toUpperCase() === "JP"
  );

  const jpBySourceId = new Map(
    jpSets.map((set) => [set.source_id.toUpperCase(), set])
  );

  // --------------------------------------------------
  // 2. Cartes déjà présentes
  // --------------------------------------------------

  const cards = await getAll<CardRow>(
    "cards",
    "id,set_id,source,source_id,local_id,number"
  );

  const cardsBySetId = new Map<string, CardRow[]>();

  for (const card of cards) {
    const existing = cardsBySetId.get(card.set_id) ?? [];
    existing.push(card);
    cardsBySetId.set(card.set_id, existing);
  }

  // --------------------------------------------------
  // 3. Inventaire local PTCG-database
  // --------------------------------------------------

  const directories = fs
    .readdirSync(PTCG_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const directoriesByUpper = new Map(
    directories.map((name) => [name.toUpperCase(), name])
  );

  type Result = {
    setId: string;
    folder: string | null;
    dbSet: SetRow | null;
    files: number;
    validJson: number;
    invalidJson: number;
    uniqueNumbers: number;
    missingNumbers: number;
    firstNumber: string | null;
    lastNumber: string | null;
    dbCards: number;
    dbPtcgCards: number;
    status: string;
  };

  const results: Result[] = [];

  for (const setId of TCGDEX_ZERO_DETAIL_SETS) {
    const dbSet = jpBySourceId.get(setId.toUpperCase()) ?? null;
    const folder = directoriesByUpper.get(setId.toUpperCase()) ?? null;

    let files = 0;
    let validJson = 0;
    let invalidJson = 0;
    const numbers = new Set<string>();

    if (folder) {
      const folderPath = path.join(PTCG_ROOT, folder);

      const jsonFiles = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.toLowerCase().endsWith(".json")
        );

      files = jsonFiles.length;

      for (const file of jsonFiles) {
        const data = readJsonFile(
          path.join(folderPath, file.name)
        );

        if (!data) {
          invalidJson++;
          continue;
        }

        validJson++;

        const number = normalizeNumber(
          data.number ?? data.card_number ?? null
        );

        if (number) {
          numbers.add(number);
        }
      }
    }

    const dbCards = dbSet
      ? cardsBySetId.get(dbSet.id)?.length ?? 0
      : 0;

    const dbPtcgCards = dbSet
      ? (cardsBySetId.get(dbSet.id) ?? []).filter(
          (card) => card.source === "ptcg-database"
        ).length
      : 0;

    let status = "NON DISPONIBLE";

    if (!folder) {
      status = "PAS DE DOSSIER PTCG";
    } else if (files === 0) {
      status = "DOSSIER VIDE";
    } else if (invalidJson > 0) {
      status = "JSON INVALIDE";
    } else if (!dbSet) {
      status = "SET ABSENT SUPABASE";
    } else if (dbPtcgCards >= files) {
      status = "DÉJÀ IMPORTÉ";
    } else if (numbers.size === files) {
      status = "CANDIDAT À VALIDER";
    } else {
      status = "NUMÉROTATION INCOMPLÈTE";
    }

    results.push({
      setId,
      folder,
      dbSet,
      files,
      validJson,
      invalidJson,
      uniqueNumbers: numbers.size,
      missingNumbers: Math.max(files - numbers.size, 0),
      firstNumber:
        numbers.size > 0
          ? [...numbers].sort((a, b) =>
              a.localeCompare(b, undefined, { numeric: true })
            )[0]
          : null,
      lastNumber:
        numbers.size > 0
          ? [...numbers].sort((a, b) =>
              a.localeCompare(b, undefined, { numeric: true })
            )[numbers.size - 1]
          : null,
      dbCards,
      dbPtcgCards,
      status,
    });
  }

  // --------------------------------------------------
  // 4. Affichage
  // --------------------------------------------------

  console.log(`Sets TCGdex avec détail = 0 : ${results.length}`);
  console.log(`Dossiers PTCG-database disponibles : ${
    results.filter((r) => r.folder).length
  }\n`);

  console.log("SET | FICHIERS | NUMÉROS | DB | PTCG DB | STATUT");
  console.log("--------------------------------------------------------------");

  for (const result of results) {
    console.log(
      `${result.setId.padEnd(6)} | ` +
      `${String(result.files).padStart(7)} | ` +
      `${String(result.uniqueNumbers).padStart(7)} | ` +
      `${String(result.dbCards).padStart(2)} | ` +
      `${String(result.dbPtcgCards).padStart(7)} | ` +
      result.status
    );
  }

  const candidates = results.filter(
    (result) => result.status === "CANDIDAT À VALIDER"
  );

  const unavailable = results.filter(
    (result) =>
      result.status === "NON DISPONIBLE" ||
      result.status === "PAS DE DOSSIER PTCG" ||
      result.status === "DOSSIER VIDE"
  );

  console.log("\n==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================");
  console.log(`Candidats à valider      : ${candidates.length}`);
  console.log(`Non disponibles          : ${unavailable.length}`);
  console.log(
    `Déjà importés            : ${
      results.filter((r) => r.status === "DÉJÀ IMPORTÉ").length
    }`
  );
  console.log(
    `Avec problème JSON       : ${
      results.filter((r) => r.status === "JSON INVALIDE").length
    }`
  );
  console.log(
    `Numérotation à examiner  : ${
      results.filter((r) => r.status === "NUMÉROTATION INCOMPLÈTE").length
    }`
  );
  console.log(
    `Set absent de Supabase   : ${
      results.filter((r) => r.status === "SET ABSENT SUPABASE").length
    }`
  );

  console.log("\nCANDIDATS À VALIDER :");

  if (candidates.length === 0) {
    console.log("  Aucun.");
  } else {
    for (const result of candidates) {
      console.log(
        `  ${result.setId} → ${result.files} fichiers, ` +
        `${result.uniqueNumbers} numéros, ` +
        `DB actuelle=${result.dbCards}, ` +
        `PTCG-database déjà importé=${result.dbPtcgCards}`
      );
    }
  }

  console.log("\n🟢 INVENTAIRE TERMINÉ — aucune donnée Supabase modifiée.");
}

main().catch((error) => {
  console.error(
    "\n🔴 ERREUR :",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
