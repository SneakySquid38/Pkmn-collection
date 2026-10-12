import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "PTCG-database", "data_jp");

const SETS = [
  "LL", "XY2", "XY3", "XY4", "XY6", "XY7", "CP3", "CP5", "CP6", "SM0",
  "SMP2", "S1W", "S1H", "S1a", "S2", "S3", "S3a", "S7R", "S10D",
  "S5R", "S5a", "S6a", "S2a", "S4a"
];

type AnyObj = Record<string, any>;

function readJson(file: string): AnyObj {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function filesFor(setId: string): string[] {
  const dir = path.join(ROOT, setId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function num(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/^\d+$/);
    if (m) return Number(v);
  }
  return null;
}

function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function first(obj: AnyObj, keys: string[]) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}

function hasValue(v: any): boolean {
  return v !== undefined && v !== null && v !== "";
}

function classifyType(v: any): string {
  const s = String(v ?? "").trim();
  if (s === "Pokémon") return "pokemon";
  if (["グッズ", "ポケモンのどうぐ", "サポート", "スタジアム", "トレーナーズ"].includes(s)) return "trainer";
  if (["基本エネルギー", "特殊エネルギー", "エネルギー"].includes(s)) return "energy";
  return "unknown";
}

function rarity(v: any): string | null {
  return hasValue(v) ? String(v) : null;
}

function imageField(obj: AnyObj): { key: string | null, value: any } {
  const keys = ["image", "image_url", "imageUrl", "imageURL", "images", "image_urls", "imageUrls"];
  for (const k of keys) {
    if (hasValue(obj[k])) return { key: k, value: obj[k] };
  }
  return { key: null, value: null };
}

function printKey(obj: AnyObj): string | null {
  const v = first(obj, ["print_key", "printKey"]);
  return hasValue(v) ? String(v) : null;
}

function numberValue(obj: AnyObj): string | null {
  const v = first(obj, ["number", "card_number", "cardNumber"]);
  return hasValue(v) ? String(v).trim() : null;
}

function dexValue(obj: AnyObj): number | null {
  const v = first(obj, ["pokedex_number", "pokedexNumber", "dex_id", "dexId"]);
  return num(v);
}

function totalValue(obj: AnyObj): number | null {
  return num(first(obj, ["set_total", "setTotal", "total", "total_cards"]));
}

function cardType(obj: AnyObj): string | null {
  const v = first(obj, ["card_type", "cardType", "category", "type"]);
  return hasValue(v) ? String(v).trim() : null;
}

console.log("============================================================");
console.log(" AUDIT DÉTAILLÉ PTCG-DATABASE — SETS JP");
console.log(" Lecture seule — aucune modification Supabase");
console.log("============================================================");
console.log(`Répertoire : ${ROOT}`);
console.log("");

if (!fs.existsSync(ROOT)) {
  console.error("❌ Répertoire PTCG-database introuvable.");
  process.exit(1);
}

const globalKeys = new Set<string>();

for (const setId of SETS) {
  const files = filesFor(setId);
  console.log("\n============================================================");
  console.log(`SET ${setId} — ${files.length} fichiers`);
  console.log("============================================================");

  if (!files.length) {
    console.log("❌ Aucun fichier.");
    continue;
  }

  const rows = files.map(file => {
    const obj = readJson(path.join(ROOT, setId, file));
    Object.keys(obj).forEach(k => globalKeys.add(k));
    const n = numberValue(obj);
    const nv = n !== null ? num(n) : null;
    const img = imageField(obj);
    const type = cardType(obj);
    const cls = classifyType(type);
    return {
      file, obj, n, nv, img, type, cls,
      total: totalValue(obj),
      dex: dexValue(obj),
      rarity: rarity(first(obj, ["rarity", "rarity_code", "rarityCode"])),
      name: first(obj, ["name", "name_ja", "card_name", "cardName"]),
      author: first(obj, ["author", "artist", "illustrator"]),
      printKey: printKey(obj),
      jpId: first(obj, ["jp_id", "id", "card_id", "cardId"]),
      setName: first(obj, ["set_name", "setName"])
    };
  });

  const nums = rows.map(r => r.nv).filter((x): x is number => x !== null);
  const uniqueNums = new Set(nums);
  const duplicateNums = [...uniqueNums].filter(n => nums.filter(x => x === n).length > 1);
  const missingInternal: number[] = [];
  if (nums.length) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    for (let n = min; n <= max; n++) if (!uniqueNums.has(n)) missingInternal.push(n);
  }

  const totals = [...new Set(rows.map(r => r.total).filter((x): x is number => x !== null))];
  const types = new Map<string, number>();
  for (const r of rows) types.set(r.type ?? "(absent)", (types.get(r.type ?? "(absent)") ?? 0) + 1);

  const images = new Map<string, number>();
  for (const r of rows) images.set(r.img.key ?? "(absent)", (images.get(r.img.key ?? "(absent)") ?? 0) + 1);

  const printMissing = rows.filter(r => !r.printKey);
  const rarityMissing = rows.filter(r => !r.rarity);
  const dexMissing = rows.filter(r => r.cls === "pokemon" && r.dex === null);
  const authorMissing = rows.filter(r => !hasValue(r.author));
  const nameMissing = rows.filter(r => !hasValue(r.name));
  const jpIdMissing = rows.filter(r => !hasValue(r.jpId));
  const setNameMismatch = rows.filter(r => hasValue(r.setName) && String(r.setName) !== setId);

  const pokemon = rows.filter(r => r.cls === "pokemon").length;
  const trainer = rows.filter(r => r.cls === "trainer").length;
  const energy = rows.filter(r => r.cls === "energy").length;
  const unknown = rows.filter(r => r.cls === "unknown").length;

  console.log(`Fichiers / numéros uniques : ${files.length} / ${uniqueNums.size}`);
  console.log(`Numéros : ${nums.length ? `min=${Math.min(...nums)} max=${Math.max(...nums)}` : "aucun"}`);
  console.log(`set_total rencontrés : ${totals.join(", ") || "(absent)"}`);
  console.log(`Doublons de numéro : ${duplicateNums.length ? duplicateNums.join(", ") : "aucun"}`);
  console.log(`Trous internes min→max : ${missingInternal.length ? missingInternal.join(", ") : "aucun"}`);

  console.log(`Types : Pokémon=${pokemon} | Dresseur=${trainer} | Énergie=${energy} | Inconnus=${unknown}`);
  if (types.size) console.log(`  Valeurs brutes : ${[...types.entries()].map(([k,v]) => `${k}=${v}`).join(" | ")}`);

  console.log(`Rareté absente : ${rarityMissing.length}`);
  console.log(`Dex absent chez Pokémon : ${dexMissing.length}`);
  console.log(`Nom absent : ${nameMissing.length}`);
  console.log(`Auteur absent : ${authorMissing.length}`);
  console.log(`print_key absent : ${printMissing.length}`);
  console.log(`ID source absent : ${jpIdMissing.length}`);
  console.log(`set_name différent de ${setId} : ${setNameMismatch.length}`);

  console.log(`Images : ${[...images.entries()].map(([k,v]) => `${k}=${v}`).join(" | ") || "(aucun)"}`);

  if (duplicateNums.length) {
    console.log("\n⚠️ DÉTAIL DOUBLONS NUMÉROS");
    for (const n of duplicateNums) {
      console.log(`  ${n}: ${rows.filter(r => r.nv === n).map(r => r.file).join(", ")}`);
    }
  }

  if (missingInternal.length && missingInternal.length <= 30) {
    console.log(`⚠️ TROUS INTERNES : ${missingInternal.join(", ")}`);
  }

  if (unknown) {
    console.log("\n⚠️ TYPES INCONNUS");
    for (const r of rows.filter(r => r.cls === "unknown")) {
      console.log(`  ${r.file}: card_type=${r.type ?? "(absent)"} name=${r.name ?? "(sans nom)"}`);
    }
  }

  // Détecte surtout les cas où le fichier contient une extension/secret card
  // au-delà du set_total annoncé, sans considérer cela comme une erreur.
  const maxNum = nums.length ? Math.max(...nums) : null;
  if (maxNum !== null && totals.length === 1 && maxNum > totals[0]) {
    const extra = rows.filter(r => r.nv !== null && r.nv > totals[0]);
    console.log(`\nℹ️ Numéros > set_total (${totals[0]}) : ${extra.length}`);
    console.log(`  ${extra.map(r => `${r.n}=${r.name ?? "?"}`).join(" | ")}`);
  }

  // Affiche les cartes non-Pokémon, utiles pour valider la future conversion de catégorie.
  if (trainer || energy) {
    console.log("\n📋 CARTES NON-POKÉMON");
    for (const r of rows.filter(r => r.cls !== "pokemon")) {
      console.log(`  ${r.n ?? "?"} | ${r.type ?? "(absent)"} | ${r.name ?? "(sans nom)"}`);
    }
  }

  // Pour les cartes sans dex, affiche uniquement un échantillon.
  if (dexMissing.length) {
    console.log(`\n📋 Pokémon sans pokedex_number (échantillon ${Math.min(15, dexMissing.length)})`);
    for (const r of dexMissing.slice(0, 15)) {
      console.log(`  ${r.n ?? "?"} | ${r.name ?? "(sans nom)"} | ${r.type ?? "(absent)"}`);
    }
  }
}

console.log("\n============================================================");
console.log(" CLÉS JSON RENCONTRÉES SUR L'ENSEMBLE DES SETS");
console.log("============================================================");
console.log([...globalKeys].sort().join(", "));

console.log("\n============================================================");
console.log(" FIN AUDIT");
console.log("============================================================");
