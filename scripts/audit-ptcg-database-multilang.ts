import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("PTCG-database");
const LANGS = [
  { code: "FR", dir: "data_fr" },
  { code: "JP", dir: "data_jp" },
  { code: "KR", dir: "data_ko" },
  { code: "SC", dir: "data_sc" },
  { code: "TC", dir: "data_tc" },
] as const;

type Card = Record<string, unknown> & {
  number?: string | number;
  card_key?: string;
  print_key?: string;
  set_code?: string;
  set_name?: string;
  name?: string;
  jp_id?: number | string;
  ko_id?: number | string;
  lang?: string;
};

type SetInfo = { lang: string; setId: string; cards: Card[] };

function readJson(file: string): Card | null {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as Card;
  } catch {
    return null;
  }
}

function loadSets(lang: typeof LANGS[number]): Map<string, SetInfo> {
  const root = path.join(ROOT, lang.dir);
  const result = new Map<string, SetInfo>();
  if (!fs.existsSync(root)) return result;

  for (const setId of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    const dir = path.join(root, setId);
    const cards: Card[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const card = readJson(path.join(dir, file));
      if (card) cards.push(card);
    }
    result.set(setId, { lang: lang.code, setId, cards });
  }
  return result;
}

function value(card: Card, key: string): string {
  const v = card[key];
  return v === undefined || v === null ? "" : String(v);
}

function norm(v: string): string {
  return v.trim().toUpperCase();
}

function mapBy(cards: Card[], key: string) {
  const m = new Map<string, Card[]>();
  for (const card of cards) {
    const v = norm(value(card, key));
    if (!v) continue;
    const arr = m.get(v) ?? [];
    arr.push(card);
    m.set(v, arr);
  }
  return m;
}

function comparePair(a: SetInfo, b: SetInfo) {
  const keys = ["number", "card_key", "print_key", "set_code"];
  const out: Record<string, { a: number; b: number; common: number; exactPairs: number; ambiguous: number; examples: string[] }> = {};

  for (const key of keys) {
    const ma = mapBy(a.cards, key);
    const mb = mapBy(b.cards, key);
    const common = [...ma.keys()].filter(k => mb.has(k));
    let exactPairs = 0;
    let ambiguous = 0;
    const examples: string[] = [];
    for (const k of common) {
      const aa = ma.get(k)!;
      const bb = mb.get(k)!;
      if (aa.length === 1 && bb.length === 1) {
        exactPairs++;
        if (examples.length < 5) {
          examples.push(`${k}: ${value(aa[0], "name")} ↔ ${value(bb[0], "name")}`);
        }
      } else {
        ambiguous++;
      }
    }
    out[key] = { a: ma.size, b: mb.size, common: common.length, exactPairs, ambiguous, examples };
  }
  return out;
}

function main() {
  console.log("============================================================");
  console.log(" AUDIT MULTILINGUE PTCG-DATABASE — FR / JP / KR / SC / TC");
  console.log(" Lecture seule — aucune modification");
  console.log("============================================================\n");
  console.log(`Répertoire : ${ROOT}\n`);

  const data = new Map<string, Map<string, SetInfo>>();
  for (const lang of LANGS) {
    const sets = loadSets(lang);
    data.set(lang.code, sets);
    console.log(`${lang.code} : ${sets.size} sets`);
  }

  const allSetIds = new Set<string>();
  for (const sets of data.values()) for (const id of sets.keys()) allSetIds.add(id);

  const multi = [...allSetIds]
    .map(setId => {
      const present = LANGS.filter(l => data.get(l.code)?.has(setId)).map(l => l.code);
      return { setId, present };
    })
    .filter(x => x.present.length >= 2)
    .sort((a, b) => b.present.length - a.present.length || a.setId.localeCompare(b.setId));

  console.log(`\nSets présents dans au moins 2 langues : ${multi.length}`);
  console.log("------------------------------------------------------------");
  for (const x of multi) console.log(`${x.setId.padEnd(12)} | ${x.present.join(" / ")}`);

  console.log("\n============================================================");
  console.log(" ÉCHANTILLON AUTOMATIQUE");
  console.log("============================================================\n");

  // Prioritize sets shared by many languages, then representative eras.
  const preferred = ["S4", "S4a", "S1W", "S1H", "S1a", "SV2a", "M2", "M2a", "M3", "M4", "M5", "base1", "base2", "CP1", "PMCG1"];
  const chosen: string[] = [];
  for (const id of preferred) if (multi.some(x => x.setId === id)) chosen.push(id);
  for (const x of multi) if (chosen.length < 12 && !chosen.includes(x.setId)) chosen.push(x.setId);

  for (const setId of chosen) {
    const present = multi.find(x => x.setId === setId)!.present;
    console.log(`\n### ${setId} — ${present.join(" / ")}`);
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = data.get(present[i])!.get(setId)!;
        const b = data.get(present[j])!.get(setId)!;
        const cmp = comparePair(a, b);
        console.log(`\n${present[i]} ↔ ${present[j]} | cartes ${a.cards.length} ↔ ${b.cards.length}`);
        for (const key of ["number", "card_key", "print_key", "set_code"]) {
          const r = cmp[key];
          console.log(`  ${key.padEnd(10)} unique ${r.a}/${r.b} | commun ${r.common} | paires non ambiguës ${r.exactPairs} | ambigus ${r.ambiguous}`);
          if (r.examples.length) console.log(`    ex: ${r.examples.join(" | ")}`);
        }
      }
    }
  }

  console.log("\n============================================================");
  console.log(" FIN — aucune donnée modifiée");
  console.log("============================================================");
}

main();
