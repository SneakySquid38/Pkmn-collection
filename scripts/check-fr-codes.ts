import fs from "fs";
import path from "path";

const filePath = path.join(
  process.cwd(),
  "fr-sets.json"
);

const codes = [
  "base6",
  "base7",
  "neo1",
  "neo2",
  "neo3",
  "neo4",
  "ecard3",
  "ex7",
  "sm11.5",
  "me06",
];

if (!fs.existsSync(filePath)) {
  throw new Error(
    `Fichier introuvable : ${filePath}`
  );
}

const raw = fs.readFileSync(filePath, "utf-8");
const sets = JSON.parse(raw);

console.log("");
console.log("==============================================");
console.log(" VÉRIFICATION DIRECTE DANS fr-sets.json");
console.log("==============================================");
console.log("");

console.log(`Sets dans le fichier : ${sets.length}`);
console.log("");

for (const wantedCode of codes) {
  const matches = sets.filter(
    (set: any) =>
      String(set.code ?? "").toLowerCase() ===
      wantedCode.toLowerCase()
  );

  if (matches.length === 0) {
    console.log(`❌ ${wantedCode} -> ABSENT DU JSON`);
  } else {
    for (const set of matches) {
      console.log(
        `✅ ${set.code} -> ${set.name ?? "(sans nom)"}`
      );
    }
  }
}

console.log("");
console.log("==============================================");
console.log(" FIN");
console.log("==============================================");