/**
 * PROTOTYPE — rapprochement d'un set FR avec les cartes japonaises (lecture seule)
 *
 * Ne lit que PTCG-database (cloné à la racine du projet). N'écrit rien en base.
 *
 * Usage :
 *   npx tsx scripts/prototype-mapping-fr-jp.ts me02.5
 *   options :
 *     --jp=M          préfixe des sets JP candidats (défaut : déduit du code FR)
 *     --officiel=217  nombre de cartes de la série principale FR (défaut : déduit des raretés)
 *
 * Rapport : output/mapping-<set>.json et output/mapping-<set>.csv (séparateur ;)
 *
 * Méthode (voir claude/plan-mapping-fr-jp.md dans le projet) :
 *   A. découverte des sets JP sources : Pokémon à empreinte exacte, votes par set
 *   B. rapprochement dans les sets sources (un pour un dans chaque set JP ;
 *      même score dans un autre set JP = réimpression japonaise de la même carte)
 *   B2. Pokémon restés seuls : empreinte exacte sur toute l'ère (decks, promos)
 *   C. voisinage : dans la série principale, l'ordre des Pokémon suit l'ordre JP
 *   Dresseurs et Énergies : jamais AUTO sans dictionnaire de noms (étape suivante)
 */

import fs from "node:fs";
import path from "node:path";

// -----------------------------------------------------------------------------
// Arguments
// -----------------------------------------------------------------------------

const FR_SET = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!FR_SET) throw new Error("Code du set FR manquant, ex. : npx tsx scripts/prototype-mapping-fr-jp.ts me02.5");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const ROOT = path.resolve(process.cwd(), "PTCG-database");
const FR_DIR = path.join(ROOT, "data_fr", FR_SET);
const JP_ROOT = path.join(ROOT, "data_jp");
if (!fs.existsSync(FR_DIR)) throw new Error(`Set FR introuvable : ${FR_DIR}`);

const ERA_PREFIX: Record<string, string> = { me: "M", sv: "SV", swsh: "S", sm: "SM", xy: "XY", bw: "BW" };
const JP_PREFIX = arg("jp") ?? ERA_PREFIX[FR_SET.replace(/[\d.].*$/, "")] ?? "";

// -----------------------------------------------------------------------------
// Normalisation : un seul vocabulaire pour les deux langues
// -----------------------------------------------------------------------------

type Kind = "pokemon" | "item" | "tool" | "supporter" | "stadium" | "energy" | "trainer";

type Card = {
  lang: "FR" | "JP";
  set: string;
  number: string;
  name: string;
  kind: Kind;
  rarity: string | null;
  secret: boolean;
  dex: string;
  artist: string;
  artistRaw: string | null;
  game: string | null;
  ex: boolean;
  mega: boolean;
  owner: boolean;
  nums: string;
};

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFKC").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

const TYPE: Record<string, string> = {
  // JP (PTCG-database)
  electric: "lightning", dark: "darkness", steel: "metal", void: "", plus: "",
  // FR (PTCG-database / TCGdex)
  incolore: "colorless", combat: "fighting", electrique: "lightning", feu: "fire", plante: "grass",
  obscurite: "darkness", eau: "water", psy: "psychic", metal: "metal", fee: "fairy",
};
const type = (x: string) => { const k = norm(x); return k in TYPE ? TYPE[k] : k; };
const costSig = (c?: string[]) => (c ?? []).map(type).filter(Boolean).sort().join("");
const dmg = (d: any) => {
  if (d == null || d === "") return "";
  if (typeof d === "object") d = `${d.amount ?? ""}${d.suffix ?? ""}`;
  return String(d).normalize("NFKC").replace(/[×x]/g, "x").replace(/[＋+]/g, "+")
    .replace(/[－\-−]/g, "-").replace(/\s/g, "");
};
const digits = (s?: string) =>
  ((s ?? "").normalize("NFKC").match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b).join(",");
const STAGE: Record<string, string> = {
  base: "basic", niveau1: "stage1", niveau2: "stage2", "たね": "basic", "1進化": "stage1", "2進化": "stage2",
};
const stage = (s?: string) => { const k = String(s ?? "").normalize("NFKC").toLowerCase().replace(/\s/g, ""); return STAGE[k] ?? k; };

const JP_KIND: Record<string, Kind> = {
  "Pokémon": "pokemon", "グッズ": "item", "サポート": "supporter", "ポケモンのどうぐ": "tool",
  "スタジアム": "stadium", "基本エネルギー": "energy", "特殊エネルギー": "energy",
};
const FR_KIND = (c: any): Kind => {
  if (c.card_type === "Pokémon") return "pokemon";
  if (c.card_type === "Énergie") return "energy";
  return ({ supporter: "supporter", objet: "item", outil: "tool", stade: "stadium" } as Record<string, Kind>)[norm(c.sub_type)] ?? "trainer";
};

// Raretés FR (PTCG-database) -> vocabulaire commun
const FR_RARITY: Record<string, string> = {
  commune: "common", peucommune: "uncommon", rare: "rare", doublerare: "double rare",
  illustrationrare: "illustration rare", illustrationspecialerare: "special illustration rare",
  ultrarare: "ultra rare", megahyperrare: "mega hyper rare", megaattaquerare: "ultra rare",
};
// Raretés JP -> vocabulaire commun. Les Méga Attaque Rare sont rangées en Ultra Rare côté FR.
// Les cartes "normales" des high class packs JP n'ont pas de symbole : pas de pénalité.
const JP_RARITY: Record<string, string> = {
  rare_c_c: "common", rare_u_c: "uncommon", rare_r_c: "rare", rare_rr: "double rare",
  rare_ar: "illustration rare", rare_sar: "special illustration rare", rare_sr_c: "ultra rare",
  rare_ma: "ultra rare", rare_MUR: "mega hyper rare", rare_ur: "hyper rare",
};

function gameKey(hp: any, st: any, retreat: any, weak: string[], abilities: number, attacks: any[]) {
  return [hp, stage(st), retreat ?? 0, weak.map(type).join(""), abilities,
    attacks.map((a) => `${costSig(a.cost)}:${dmg(a.damage)}`).join("|")].join("#");
}

function fromFR(c: any, official: number): Card {
  const kind = FR_KIND(c);
  const name: string = c.name ?? "";
  return {
    lang: "FR", set: FR_SET!, number: String(Number(c.number)), name, kind,
    rarity: FR_RARITY[norm(c.rarity)] ?? (c.rarity ?? null), secret: Number(c.number) > official,
    dex: c.pokedex_number != null ? String(c.pokedex_number) : "",
    artist: norm((c.author ?? []).join("")), artistRaw: (c.author ?? []).join(", ") || null,
    game: kind !== "pokemon" ? null
      : gameKey(c.hp, c.stage, c.retreat, c.weakness?.type ?? [], (c.abilities ?? []).length, c.attacks ?? []),
    ex: kind === "pokemon" && /[\s-]ex$/i.test(name), mega: /^m[ée]ga[\s-]/i.test(name),
    owner: kind === "pokemon" && /\s(de|d')\s?|\sd'/i.test(name),
    nums: kind === "pokemon" ? "" : digits(c.effect),
  };
}

function fromJP(c: any, setCode: string): Card {
  const kind = JP_KIND[c.card_type] ?? "trainer";
  return {
    lang: "JP", set: setCode, number: String(Number(c.number)), name: c.name, kind,
    rarity: JP_RARITY[c.rarity] ?? null, secret: Number(c.number) > (Number(c.set_total) || 9999),
    dex: c.pokedex_number != null ? String(c.pokedex_number) : "",
    artist: norm((c.author ?? []).join("")), artistRaw: (c.author ?? []).join(", ") || null,
    game: kind !== "pokemon" ? null
      : gameKey(c.hp, c.stage, c.retreat, c.weakness?.type ?? [], (c.abilities ?? []).length, c.attacks ?? []),
    ex: kind === "pokemon" && /ex$/.test(c.name), mega: /^メガ/.test(c.name),
    owner: kind === "pokemon" && /の/.test(c.name),
    nums: kind === "pokemon" ? "" : digits(c.effect),
  };
}

// -----------------------------------------------------------------------------
// Chargement
// -----------------------------------------------------------------------------

const readDir = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

const frRaw = readDir(FR_DIR);
// Série principale : dernier numéro d'une carte de rareté "de base" (sauf si --officiel est donné)
const BASE_RARITIES = new Set(["commune", "peucommune", "rare", "doublerare"]);
const OFFICIAL = Number(arg("officiel")) ||
  Math.max(...frRaw.filter((c) => BASE_RARITIES.has(norm(c.rarity))).map((c) => Number(c.number)));
const fr = frRaw.map((c) => fromFR(c, OFFICIAL)).sort((a, b) => Number(a.number) - Number(b.number));

const jp: Card[] = [];
for (const setCode of fs.readdirSync(JP_ROOT).filter((d) => d.startsWith(JP_PREFIX))) {
  // Secondes impressions (même numéro + même nom) : on garde la première, comme l'import v7
  const first = new Map<string, any>();
  for (const c of readDir(path.join(JP_ROOT, setCode)).sort((a, b) => a.jp_id - b.jp_id)) {
    const k = `${Number(c.number)}|${c.name}`;
    if (!first.has(k)) first.set(k, c);
  }
  for (const c of first.values()) jp.push(fromJP(c, setCode));
}

// -----------------------------------------------------------------------------
// Score
// -----------------------------------------------------------------------------

type Score = { s: number; why: string[] };

function score(f: Card, j: Card): Score | null {
  if (f.kind !== j.kind) return null;                        // bloquant : même type de carte
  if (f.kind === "pokemon" && f.dex !== j.dex) return null;  // bloquant : même Pokémon
  const why: string[] = [];
  let s = 0;
  if (f.artist && f.artist === j.artist) { s += 50; why.push("illustrateur"); }
  if (f.kind === "pokemon") {
    if (f.game === j.game) { s += 30; why.push("jeu identique"); }
    else {
      const [fh, fst, fre] = f.game!.split("#"), [jh, jst, jre] = j.game!.split("#");
      if (fh === jh) { s += 8; why.push("PV"); }
      if (fst === jst && fre === jre) { s += 4; why.push("stade+retraite"); }
    }
    if (f.ex === j.ex && f.mega === j.mega) { s += 5; why.push("suffixe ex/Méga"); }
    if (f.owner === j.owner) s += 3;
  } else if (f.nums === j.nums) { s += 30; why.push("nombres de l'effet"); }
  if (f.secret === j.secret) { s += 12; why.push(f.secret ? "toutes deux hors série" : "toutes deux série principale"); }
  if (j.rarity && f.rarity) {
    if (j.rarity === f.rarity) { s += 10; why.push("rareté"); } else { s -= 30; why.push("rareté différente"); }
  }
  return { s, why };
}
const exact = (why: string[]) =>
  why.includes("illustrateur") && (why.includes("jeu identique") || why.includes("nombres de l'effet"));

// -----------------------------------------------------------------------------
// Passe A — sets JP sources
// -----------------------------------------------------------------------------

const votes = new Map<string, number>();
for (const f of fr.filter((x) => x.kind === "pokemon")) {
  const sets = [...new Set(jp.filter((j) => { const r = score(f, j); return r && exact(r.why); }).map((j) => j.set))];
  for (const st of sets) votes.set(st, (votes.get(st) ?? 0) + 1 / sets.length);
}
const setRank = [...votes.entries()].sort((a, b) => b[1] - a[1]);
const SEUIL = Math.max(3, Math.round(fr.length * 0.02));
const sources = new Set(setRank.filter(([, v]) => v >= SEUIL).map(([st]) => st));
const rankOf = new Map(setRank.map(([st], i) => [st, i]));
const rank = (st: string) => rankOf.get(st) ?? 999;

// -----------------------------------------------------------------------------
// Passe B — rapprochement dans les sets sources
// -----------------------------------------------------------------------------

type Cand = { j: Card } & Score;
type Result = Cand & { status: "AUTO" | "PROBABLE" | "REVUE"; reprints: string[] };

const pool = jp.filter((j) => sources.has(j.set));
const cands = new Map<Card, Cand[]>();
for (const f of fr) {
  const list: Cand[] = [];
  for (const j of pool) { const r = score(f, j); if (r && r.s >= 50) list.push({ j, ...r }); }
  list.sort((a, b) => b.s - a.s || rank(a.j.set) - rank(b.j.set));
  cands.set(f, list);
}

const pairs = [...cands].flatMap(([f, list]) => list.map((c) => ({ f, ...c })))
  .sort((a, b) => b.s - a.s || rank(a.j.set) - rank(b.j.set));
const usedF = new Set<Card>(), usedJ = new Set<Card>();
const result = new Map<Card, Result>();
for (const p of pairs) {
  if (usedF.has(p.f) || usedJ.has(p.j)) continue;
  usedF.add(p.f); usedJ.add(p.j);
  // Même score DANS LE MÊME SET JP = vraie ambiguïté.
  // Même score dans un AUTRE set JP = réimpression japonaise de la même carte (même entité).
  const same = cands.get(p.f)!.filter((c) => c.s === p.s && c.j !== p.j);
  const rivals = same.filter((c) => c.j.set === p.j.set && !usedJ.has(c.j));
  let status: Result["status"] = exact(p.why) && !rivals.length && p.s >= 92 ? "AUTO" : "REVUE";
  // Dresseurs / Énergies : l'illustrateur seul ne suffit pas (un même artiste dessine des
  // dizaines d'objets). Jamais AUTO sans le nom -> dictionnaire de noms.
  if (status === "AUTO" && p.f.kind !== "pokemon") status = "PROBABLE";
  result.set(p.f, { j: p.j, s: p.s, why: p.why, status,
    reprints: same.filter((c) => c.j.set !== p.j.set).map((c) => `${c.j.set} ${c.j.number}`) });
}

// Passe B2 — Pokémon sans candidate : empreinte exacte sur toute l'ère (decks, promos)
for (const f of fr) {
  if (result.has(f) || f.kind !== "pokemon") continue;
  const hits = jp.filter((j) => !sources.has(j.set))
    .map((j) => ({ j, r: score(f, j) }))
    .filter((x): x is { j: Card; r: Score } => !!x.r && exact(x.r.why))
    .sort((a, b) => b.r.s - a.r.s);
  if (hits.length) {
    result.set(f, { j: hits[0].j, s: hits[0].r.s, why: [...hits[0].r.why, "hors sets sources"],
      status: "PROBABLE", reprints: hits.slice(1).map((h) => `${h.j.set} ${h.j.number}`) });
    usedJ.add(hits[0].j);
  }
}

// Passe C — voisinage dans la série principale (Pokémon uniquement)
const jpIndex = new Map(pool.map((j) => [`${j.set}|${j.number}`, j]));
fr.forEach((f, i) => {
  if (f.kind !== "pokemon" || f.secret) return;
  const cur = result.get(f);
  if (cur?.status === "AUTO") return;
  const prev = result.get(fr[i - 1]), next = result.get(fr[i + 1]);
  if (prev?.status !== "AUTO" || next?.status !== "AUTO" || prev.j.set !== next.j.set) return;
  if (Number(next.j.number) - Number(prev.j.number) !== 2) return;
  const j = jpIndex.get(`${prev.j.set}|${Number(prev.j.number) + 1}`);
  if (!j || j.kind !== "pokemon" || j.dex !== f.dex) return;
  if (usedJ.has(j) && cur?.j !== j) return;
  const r = score(f, j)!;
  result.set(f, { j, s: r.s, why: [...r.why, "voisinage"], reprints: [],
    status: r.why.includes("jeu identique") ? "PROBABLE" : "REVUE" });
  usedJ.add(j);
});

// -----------------------------------------------------------------------------
// Rapport
// -----------------------------------------------------------------------------

const label = (k: Kind) => (k === "pokemon" ? "Pokémon" : k === "energy" ? "Énergie" : "Dresseur");
const rows = fr.map((f) => {
  const r = result.get(f);
  return {
    fr_num: f.number, fr_nom: f.name, categorie: label(f.kind), fr_rarete: f.rarity, fr_illustrateur: f.artistRaw,
    statut: r?.status ?? "AUCUNE", score: r?.s ?? 0,
    jp_set: r?.j.set ?? "", jp_num: r?.j.number ?? "", jp_nom: r?.j.name ?? "", jp_rarete: r?.j.rarity ?? "",
    jp_illustrateur: r?.j.artistRaw ?? "", preuves: r?.why.join(" + ") ?? "",
    jp_reimpressions: (r?.reprints ?? []).join(", "),
  };
});

const STATUTS = ["AUTO", "PROBABLE", "REVUE", "AUCUNE"] as const;
const parSet: Record<string, number> = {};
for (const r of rows) if (r.jp_set) parSet[r.jp_set] = (parSet[r.jp_set] ?? 0) + 1;
const summary = {
  set_fr: FR_SET, cartes_fr: fr.length, serie_principale: OFFICIAL,
  cartes_jp_examinees: jp.length, prefixe_jp: JP_PREFIX,
  sets_jp_sources: Object.fromEntries(setRank.filter(([st]) => sources.has(st)).map(([st, v]) => [st, Math.round(v)])),
  cartes_par_set_jp: parSet,
  statuts: Object.fromEntries(STATUTS.map((st) => [st, rows.filter((r) => r.statut === st).length])),
  par_categorie: Object.fromEntries(["Pokémon", "Dresseur", "Énergie"].map((k) =>
    [k, Object.fromEntries(STATUTS.map((st) => [st, rows.filter((r) => r.categorie === k && r.statut === st).length]))])),
  cartes_jp_des_sets_sources_sans_correspondance: Object.fromEntries([...sources].map((st) =>
    [st, pool.filter((j) => j.set === st && !usedJ.has(j)).length])),
};

const outDir = path.resolve(process.cwd(), "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `mapping-${FR_SET}.json`), JSON.stringify({ summary, rows }, null, 2));
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(outDir, `mapping-${FR_SET}.csv`),
  "﻿" + [Object.keys(rows[0]).join(";"), ...rows.map((r) => Object.values(r).map(csvCell).join(";"))].join("\n"));

console.log(JSON.stringify(summary, null, 2));
console.log(`\nRapport : output/mapping-${FR_SET}.json et .csv`);
