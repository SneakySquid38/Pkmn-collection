import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "PTCG-database");

function isJsonFile(name: string) {
  return name.toLowerCase().endsWith(".json");
}

function isCardLike(obj: any) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return (
    obj.jp_id !== undefined ||
    obj.card_key !== undefined ||
    obj.print_key !== undefined ||
    obj.pokedex_number !== undefined ||
    obj.card_type !== undefined
  );
}

function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

if (!fs.existsSync(ROOT)) {
  console.error(`❌ Dépôt introuvable : ${ROOT}`);
  process.exit(1);
}

console.log("============================================================");
console.log(" INVENTAIRE PTCG-DATABASE");
console.log(" Lecture seule — aucune modification");
console.log("============================================================");
console.log(`Dépôt : ${ROOT}\n`);

const topDirs = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .sort();

console.log(`Répertoires principaux (${topDirs.length}) :`);
for (const d of topDirs) console.log(`  - ${d}`);

console.log("\n============================================================");
console.log(" ANALYSE DES DOSSIERS DE DONNÉES");
console.log("============================================================");

const candidates = topDirs.filter(d =>
  /^data([_-]|$)/i.test(d) ||
  /^(jp|fr|en|kr|cn|zh|ko|de|es|it|pt|asia)/i.test(d)
);

if (!candidates.length) {
  console.log("⚠️ Aucun dossier de données évident détecté automatiquement.");
}

type Summary = {
  folder: string;
  sets: number;
  jsonFiles: number;
  validJson: number;
  cardLike: number;
  sampleSetIds: string[];
  sampleKeys: string[];
  languages: string[];
};

const summaries: Summary[] = [];

for (const folder of candidates) {
  const root = path.join(ROOT, folder);
  const entries = fs.readdirSync(root, { withFileTypes: true });

  const setDirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  let jsonFiles = 0;
  let validJson = 0;
  let cardLike = 0;
  const keys = new Set<string>();
  const langs = new Set<string>();

  for (const setDir of setDirs) {
    const dir = path.join(root, setDir);
    const files = fs.readdirSync(dir).filter(isJsonFile);

    for (const f of files) {
      jsonFiles++;
      const obj = readJson(path.join(dir, f));
      if (!obj) continue;
      validJson++;

      if (isCardLike(obj)) cardLike++;

      for (const k of Object.keys(obj)) keys.add(k);

      for (const k of ["language", "lang", "locale"]) {
        if (obj[k] !== undefined && obj[k] !== null) langs.add(String(obj[k]));
      }
    }
  }

  summaries.push({
    folder,
    sets: setDirs.length,
    jsonFiles,
    validJson,
    cardLike,
    sampleSetIds: setDirs.slice(0, 12),
    sampleKeys: [...keys].sort(),
    languages: [...langs].sort()
  });
}

for (const s of summaries) {
  console.log(`\n${s.folder}`);
  console.log(`  Sets/dossiers      : ${s.sets}`);
  console.log(`  Fichiers JSON      : ${s.jsonFiles}`);
  console.log(`  JSON valides       : ${s.validJson}`);
  console.log(`  JSON type carte    : ${s.cardLike}`);
  console.log(`  Langues explicites : ${s.languages.length ? s.languages.join(", ") : "(aucun champ langue)"}`);
  console.log(`  Exemples de sets   : ${s.sampleSetIds.join(", ") || "(aucun)"}`);
  console.log(`  Clés JSON          : ${s.sampleKeys.join(", ") || "(aucune)"}`);
}

console.log("\n============================================================");
console.log(" COMPARAISON DES DOSSIERS DE LANGUES");
console.log("============================================================");

const byNormalized = new Map<string, string[]>();
for (const s of summaries) {
  const key = s.folder.toLowerCase().replace(/^data[_-]?/, "");
  const arr = byNormalized.get(key) ?? [];
  arr.push(s.folder);
  byNormalized.set(key, arr);
}

console.log("Dossiers détectés :");
for (const s of summaries) {
  console.log(`  ${s.folder.padEnd(15)} → ${s.sets} sets / ${s.jsonFiles} JSON`);
}

console.log("\n============================================================");
console.log(" FIN INVENTAIRE");
console.log("============================================================");
