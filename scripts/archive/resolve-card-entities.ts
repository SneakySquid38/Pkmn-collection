import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Variables Supabase manquantes dans .env.local");

const supabase = createClient(supabaseUrl, serviceRoleKey);

const LANGUAGES = ["FR", "JP", "KO", "SC", "TC"] as const;
type Language = (typeof LANGUAGES)[number];
type Category = "pokemon" | "trainer" | "energy" | "unknown";
type Decision = "AUTO_MERGE" | "AUTO_MERGE_WITH_WARNING" | "REVIEW" | "CONFLICT" | "UNMATCHED";

type RepoCard = {
  key: string;
  setDir: string;
  language: Language;
  file: string;
  number: string | null;
  name: string | null;
  category: Category;
  pokedexNumber: number | null;
  author: string[];
  printKey: string | null;
  cardKey: string | null;
  hp: string | null;
  types: string[];
  typesEn: string[];
  stage: string | null;
  evolveFrom: string | null;
  rarity: string | null;
};

type SupaCard = {
  id: string;
  set_id: string;
  source: string;
  source_id: string;
  local_id: string | null;
  number: string | null;
  name: string | null;
  language: string;
  category: string | null;
  hp: number | null;
  types: unknown;
  rarity: string | null;
  artist: string | null;
  dex_ids: unknown;
};

type SetRow = { id: string; source_id: string; code: string | null; name: string; language: string; region: string | null };
type MappingRow = { source_set_id: string; target_set_id: string; mapping_type: string; confidence: number | null; status: string };
type CardPokemonRow = { card_id: string; pokemon_entity_id: string };
type PokemonRow = { id: string; dex_id: number };

type Node = {
  id: string;
  source: "ptcg" | "tcgdex";
  language: Language;
  setDir: string;
  setId: string | null;
  setLabel: string;
  file: string | null;
  cardId: string | null;
  number: string | null;
  name: string | null;
  category: Category;
  pokedexNumbers: number[];
  author: string[];
  printKey: string | null;
  cardKey: string | null;
  hp: string | null;
  types: string[];
  stage: string | null;
  evolveFrom: string | null;
  rarity: string | null;
};

type Edge = {
  a: string;
  b: string;
  score: number;
  method: string;
  reasons: string[];
  hardConflict: boolean;
};

const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--")).map(x => {
  const i = x.indexOf("=");
  return [x.slice(2, i > 0 ? i : undefined), i > 0 ? x.slice(i + 1) : "true"];
}));
const repoDir = path.resolve(args.repo ?? path.resolve(process.cwd(), "PTCG-database"));
const outputPath = path.resolve(args.output ?? path.resolve(process.cwd(), "resolve-card-entities-dry-run.json"));
const minAuto = 90;

function s(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : null; }
function norm(v: unknown): string { return String(v ?? "").normalize("NFKC").trim().toLowerCase().replace(/[\s._'’`-]+/g, ""); }
function normNumber(v: unknown): string | null {
  const x = s(v); if (!x) return null;
  if (/^\d+$/.test(x)) return String(Number(x));
  return x.toUpperCase().replace(/\s+/g, "");
}
function authors(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => norm(x)).filter(Boolean).map(x => /^\d+$/.test(x) ? String(Number(x)) : x);
}
function category(raw: unknown): Category {
  const v = norm(raw);
  if (["pokemon", "pokémon", "ポケモン"].includes(v)) return "pokemon";
  if (["trainer", "dresseur", "trainercard", "trainercard", "グッズ", "サポート", "スタジアム", "ポケモンのどうぐ", "supporter", "item", "tool", "stadium", "trainerkarte", "cartaentrenador", "cartaentrenadora", "treinador"].includes(v)) return "trainer";
  if (["energy", "énergie", "energie", "特殊エネルギー", "basicenergy", "specialenergy", "energiebasique", "energía", "energia"].includes(v)) return "energy";
  return "unknown";
}
function arr(v: unknown): string[] { return Array.isArray(v) ? v.map(x => String(x ?? "").trim()).filter(Boolean) : []; }
function json(v: unknown): unknown { return v; }
function unique<T>(a: T[]): T[] { return [...new Set(a)]; }
function intersect<T>(a: T[], b: T[]): T[] { const bs = new Set(b); return a.filter(x => bs.has(x)); }
function categoryFromSupa(c: SupaCard): Category { return category(c.category); }
function parseDex(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => typeof x === "number" ? x : Number(String(x))).filter(Number.isFinite).map(x => Math.trunc(x));
}
function canonicalLanguage(v: string): Language | null {
  const x = norm(v);
  if (["fr", "fra", "french"].includes(x)) return "FR";
  if (["jp", "ja", "japanese"].includes(x)) return "JP";
  if (["ko", "kr", "korean"].includes(x)) return "KO";
  if (["sc", "zh-cn", "cnsc", "simplifiedchinese"].includes(x)) return "SC";
  if (["tc", "zh-tw", "cntc", "traditionalchinese"].includes(x)) return "TC";
  return null;
}
function readJson(p: string): Record<string, unknown> { return JSON.parse(fs.readFileSync(p, "utf8")); }
function filesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesRecursive(p));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}
async function all<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data as T[]);
    if (data.length < 1000) break;
  }
  return out;
}

function repoCard(filePath: string): RepoCard | null {
  const rel = path.relative(repoDir, filePath).split(path.sep);
  if (rel.length < 3) return null;
  const language = canonicalLanguage(rel[0]);
  if (!language) return null;
  const setDir = rel[1];
  let raw: Record<string, unknown>;
  try { raw = readJson(filePath); } catch { return null; }
  const number = normNumber(raw.number ?? raw.local_id ?? raw.localId);
  return {
    key: `ptcg:${language}:${setDir}:${rel.slice(2).join("/")}`,
    setDir, language, file: path.basename(filePath), number,
    name: s(raw.name), category: category(raw.card_type ?? raw.category ?? raw.sub_type),
    pokedexNumber: typeof raw.pokedex_number === "number" ? raw.pokedex_number : null,
    author: authors(raw.author ?? raw.authors ?? raw.illustrator),
    printKey: s(raw.print_key ?? raw.printKey), cardKey: s(raw.card_key ?? raw.cardKey),
    hp: s(raw.hp), types: arr(raw.types), typesEn: arr(raw.types_en),
    stage: s(raw.stage), evolveFrom: s(raw.evolve_from), rarity: s(raw.rarity),
  };
}

function nodeFromRepo(c: RepoCard): Node {
  return { id: c.key, source: "ptcg", language: c.language, setDir: c.setDir, setId: null, setLabel: c.setDir, file: c.file, cardId: null,
    number: c.number, name: c.name, category: c.category, pokedexNumbers: c.pokedexNumber == null ? [] : [c.pokedexNumber], author: c.author,
    printKey: c.printKey, cardKey: c.cardKey, hp: c.hp, types: unique([...c.types, ...c.typesEn].map(norm)), stage: c.stage, evolveFrom: c.evolveFrom, rarity: c.rarity };
}

function nodeFromSupa(c: SupaCard, set: SetRow, pokemons: Map<string, number[]>): Node | null {
  const language = canonicalLanguage(c.language); if (!language) return null;
  const categoryValue = categoryFromSupa(c);
  const dex = unique(parseDex(c.dex_ids));
  const relDex = pokemons.get(c.id) ?? [];
  return { id: `tcgdex:${c.id}`, source: "tcgdex", language, setDir: set.source_id, setId: set.id, setLabel: `${set.source_id} | ${set.name}`,
    file: null, cardId: c.id, number: normNumber(c.number ?? c.local_id), name: c.name, category: categoryValue, pokedexNumbers: unique([...dex, ...relDex]), author: c.artist ? [norm(c.artist)] : [],
    printKey: null, cardKey: null, hp: c.hp == null ? null : String(c.hp), types: arr(c.types).map(norm), stage: null, evolveFrom: null, rarity: c.rarity };
}

function sameAuthor(a: Node, b: Node): boolean { return a.author.length > 0 && b.author.length > 0 && intersect(a.author, b.author).length > 0; }
function sameDex(a: Node, b: Node): boolean { return a.pokedexNumbers.length > 0 && b.pokedexNumbers.length > 0 && intersect(a.pokedexNumbers, b.pokedexNumbers).length > 0; }
function sameCategory(a: Node, b: Node): boolean { return a.category !== "unknown" && b.category !== "unknown" && a.category === b.category; }
function sameNumber(a: Node, b: Node): boolean { return !!a.number && !!b.number && a.number === b.number; }
function samePrint(a: Node, b: Node): boolean { return !!a.printKey && !!b.printKey && norm(a.printKey) === norm(b.printKey); }
function sameCardKey(a: Node, b: Node): boolean { return !!a.cardKey && !!b.cardKey && norm(a.cardKey) === norm(b.cardKey); }
function sameHP(a: Node, b: Node): boolean { return !!a.hp && !!b.hp && norm(a.hp) === norm(b.hp); }
function sameTypes(a: Node, b: Node): boolean { return a.types.length > 0 && b.types.length > 0 && intersect(a.types, b.types).length === Math.min(a.types.length, b.types.length); }

function edgeFor(a: Node, b: Node): Edge | null {
  if (a.language === b.language) return null;
  const ptcgPair = a.source === "ptcg" && b.source === "ptcg";
  const hasSamePrint = samePrint(a, b);
  // PTCG↔PTCG: print_key + number is the preferred candidate key, regardless of
  // the directory name. This is important because FR set directories can differ
  // from JP/KR/SC/TC even when print_key is identical.
  // Without print_key, fallback is restricted to the same logical set directory.
  if (ptcgPair && !hasSamePrint && a.setDir !== b.setDir) return null;
  // TCGdex FR has no print_key: it must stay inside the verified FR↔JP set bridge.
  if (!ptcgPair && a.setDir !== b.setDir) return null;
  if (!sameNumber(a, b)) return null;
  if (a.category !== "unknown" && b.category !== "unknown" && a.category !== b.category) {
    return { a: a.id, b: b.id, score: -100, method: "number+category", reasons: ["catégories incompatibles"], hardConflict: true };
  }

  let score = 30;
  const reasons: string[] = ["même set logique", "même numéro"];
  let strong = false;

  if (hasSamePrint) { score += 20; reasons.push("même print_key"); }
  if (sameCardKey(a, b)) { score += 15; reasons.push("même card_key"); }

  if (a.category === "pokemon" && b.category === "pokemon") {
    if (sameDex(a, b)) { score += 35; reasons.push("même Pokédex"); strong = true; }
    else if (a.pokedexNumbers.length && b.pokedexNumbers.length) {
      return { a: a.id, b: b.id, score: -100, method: "pokemon_identity", reasons: ["numéro identique mais Pokédex différent"], hardConflict: true };
    }
    if (sameAuthor(a, b)) { score += 15; reasons.push("même auteur"); }
    if (sameHP(a, b)) { score += 5; reasons.push("même HP"); }
    if (sameTypes(a, b)) { score += 5; reasons.push("types compatibles"); }
  } else if (a.category !== "pokemon" && b.category !== "pokemon") {
    if (sameAuthor(a, b)) { score += 20; reasons.push("même auteur"); strong = true; }
    if (sameHP(a, b)) { score += 3; reasons.push("même HP"); }
    if (sameTypes(a, b)) { score += 3; reasons.push("types compatibles"); }
  } else {
    return { a: a.id, b: b.id, score: -100, method: "category", reasons: ["Pokémon vs non-Pokémon"], hardConflict: true };
  }

  // PTCG↔TCGdex FR has no print_key/card_key, so require stronger structural evidence.
  if (a.source !== b.source) {
    if (a.language !== "FR" && b.language !== "FR") return null;
    if (a.category === "pokemon" && b.category === "pokemon" && !sameDex(a, b)) return null;
    if (a.category !== "pokemon" && b.category !== "pokemon" && !sameCategory(a, b)) return null;
    score += 5;
    reasons.push("pont TCGdex FR");
  }

  if (score < 55 && !strong) return null;
  const method = [samePrint(a,b)?"print_key":null, sameCardKey(a,b)?"card_key":null, sameDex(a,b)?"dex":null, sameAuthor(a,b)?"author":null, sameNumber(a,b)?"number":null].filter(Boolean).join("+");
  return { a: a.id, b: b.id, score: Math.min(score, 100), method, reasons, hardConflict: false };
}

function groupBy<T>(items: T[], keyFn: (x:T)=>string): Map<string,T[]> { const m = new Map<string,T[]>(); for (const x of items) { const k=keyFn(x); const a=m.get(k)??[]; a.push(x); m.set(k,a); } return m; }

async function main() {
  console.log("==============================================");
  console.log(" RESOLVE CARD ENTITIES — DRY RUN");
  console.log("==============================================");
  console.log("Aucune écriture Supabase. Aucune card_entity créée.");
  console.log("");
  console.log(`Repo : ${repoDir}`);

  if (!fs.existsSync(repoDir)) throw new Error(`PTCG-database introuvable : ${repoDir}`);

  const setRows = await all<SetRow>("sets", "id,source_id,code,name,language,region");
  const mappings = (await all<MappingRow>("set_mappings", "source_set_id,target_set_id,mapping_type,confidence,status")).filter(x => x.status === "verified");
  const cards = await all<SupaCard>("cards", "id,set_id,source,source_id,local_id,number,name,language,category,hp,types,rarity,artist,dex_ids");
  const cp = await all<CardPokemonRow>("card_pokemon", "card_id,pokemon_entity_id");
  const pokemon = await all<PokemonRow>("pokemon_entities", "id,dex_id");
  const pokemonById = new Map(pokemon.map(x => [x.id, x.dex_id]));
  const dexByCard = new Map<string, number[]>();
  for (const r of cp) { const d=pokemonById.get(r.pokemon_entity_id); if (d==null) continue; const a=dexByCard.get(r.card_id)??[]; a.push(d); dexByCard.set(r.card_id, unique(a)); }

  const setById = new Map(setRows.map(x => [x.id,x]));
  const frToJp = new Map<string,string>();
  const jpToFr = new Map<string,string[]>();
  for (const m of mappings) {
    const src=setById.get(m.source_set_id), dst=setById.get(m.target_set_id);
    if (!src || !dst) continue;
    if (canonicalLanguage(src.language)==="JP" && canonicalLanguage(dst.language)==="FR") {
      frToJp.set(dst.id, src.source_id);
      const a=jpToFr.get(src.source_id)??[]; a.push(dst.source_id); jpToFr.set(src.source_id, unique(a));
    }
  }

  const nodes: Node[] = [];
  const nodeById = new Map<string,Node>();
  const repoFiles = filesRecursive(repoDir);
  for (const f of repoFiles) {
    const c=repoCard(f); if (!c) continue;
    const n=nodeFromRepo(c); nodeById.set(n.id,n); nodes.push(n);
  }

  // Add TCGdex cards only for FR physical sets. Pocket is excluded from entity matching here.
  for (const c of cards) {
    const lang=canonicalLanguage(c.language); if (lang!=="FR") continue;
    const set=setById.get(c.set_id); if (!set) continue;
    const logicalSet=frToJp.get(set.id) ?? set.source_id;
    const n=nodeFromSupa(c,{...set,source_id:logicalSet},dexByCard);
    if (!n) continue;
    n.setDir=logicalSet; n.setLabel=`${logicalSet} | ${set.name}`;
    nodeById.set(n.id,n); nodes.push(n);
  }

  console.log(`PTCG nodes : ${nodes.filter(x=>x.source==="ptcg").length}`);
  console.log(`TCGdex FR nodes : ${nodes.filter(x=>x.source==="tcgdex").length}`);
  console.log(`Mappings FR→JP utilisables : ${frToJp.size}`);
  console.log("");

  const edges: Edge[] = [];
  const hardConflicts: Edge[] = [];
  const seenPairs = new Set<string>();
  const tryPair = (a: Node, b: Node) => {
    if (a.id === b.id || a.language === b.language) return;
    const key = [a.id,b.id].sort().join("|");
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    const e=edgeFor(a,b);
    if (!e) return;
    if (e.hardConflict) hardConflicts.push(e); else edges.push(e);
  };

  // 1) Primary PTCG↔PTCG candidate index: print_key + number.
  const byPrintNumber = groupBy(nodes.filter(n=>n.source==="ptcg" && n.printKey && n.number), n=>`${norm(n.printKey)}|||${n.number}`);
  for (const candidates of byPrintNumber.values()) {
    for (let i=0;i<candidates.length;i++) for (let j=i+1;j<candidates.length;j++) tryPair(candidates[i],candidates[j]);
  }

  // 2) Fallback: same set directory + number, useful when print_key is absent.
  const fallback = groupBy(nodes.filter(n=>n.number), n=>`${n.setDir}|||${n.number}`);
  for (const candidates of fallback.values()) {
    for (let i=0;i<candidates.length;i++) for (let j=i+1;j<candidates.length;j++) tryPair(candidates[i],candidates[j]);
  }

  // Union only high-confidence edges. Medium edges are retained as review candidates but never used to merge components.
  const parent = new Map<string,string>();
  function find(x:string):string { let p=parent.get(x)??x; while(parent.get(p)&&parent.get(p)!==p) p=parent.get(p)!; let y=x; while(parent.get(y)&&parent.get(y)!==y){const z=parent.get(y)!; parent.set(y,p); y=z;} parent.set(x,p); return p; }
  function union(a:string,b:string){const ra=find(a),rb=find(b); if(ra!==rb) parent.set(rb,ra);}
  for (const n of nodes) parent.set(n.id,n);

  const strongEdges = edges.filter(e => e.score >= minAuto);
  for (const e of strongEdges) union(e.a,e.b);

  const components = new Map<string,Node[]>();
  for (const n of nodes) { const r=find(n.id); const a=components.get(r)??[]; a.push(n); components.set(r,a); }

  const outputComponents:any[]=[];
  const decisionCounts:Record<Decision,number>={AUTO_MERGE:0,AUTO_MERGE_WITH_WARNING:0,REVIEW:0,CONFLICT:0,UNMATCHED:0};

  for (const members of components.values()) {
    const memberIds=new Set(members.map(x=>x.id));
    const componentEdges=edges.filter(e=>memberIds.has(e.a)&&memberIds.has(e.b));
    const componentConflicts=hardConflicts.filter(e=>memberIds.has(e.a)&&memberIds.has(e.b));
    const languages=unique(members.map(x=>x.language));
    const byLang=new Map<Language,Node[]>();
    for(const n of members){const a=byLang.get(n.language)??[];a.push(n);byLang.set(n.language,a);}
    const duplicateLanguage=[...byLang.entries()].filter(([,v])=>v.length>1).map(([l])=>l);
    const hasFR=byLang.has("FR"), hasPtcgFR=members.some(x=>x.source==="ptcg"&&x.language==="FR"), hasTcgdexFR=members.some(x=>x.source==="tcgdex");
    let decision:Decision;
    const reasons:string[]=[];
    if (members.length===1) { decision="UNMATCHED"; reasons.push("aucune correspondance exploitable"); }
    else if (componentConflicts.length) { decision="CONFLICT"; reasons.push("conflit structurel dans le composant"); }
    else if (duplicateLanguage.length) { decision="AUTO_MERGE_WITH_WARNING"; reasons.push(`plusieurs cartes dans une même langue: ${duplicateLanguage.join(",")}`); }
    else if (componentEdges.length && componentEdges.every(e=>e.score>=minAuto)) { decision="AUTO_MERGE"; reasons.push("composant relié uniquement par des correspondances fortes"); }
    else if (componentEdges.length) { decision="REVIEW"; reasons.push("composant dépendant d'au moins une correspondance moyenne"); }
    else { decision="UNMATCHED"; reasons.push("aucune arête"); }
    decisionCounts[decision]++;
    outputComponents.push({
      componentId:`ce-${String(outputComponents.length+1).padStart(6,"0")}`,
      decision, languages, setDir:members[0].setDir,
      members:members.map(n=>({id:n.id,source:n.source,language:n.language,file:n.file,cardId:n.cardId,number:n.number,name:n.name,category:n.category,pokedexNumbers:n.pokedexNumbers,author:n.author,printKey:n.printKey,cardKey:n.cardKey})),
      edges:componentEdges.map(e=>({from:e.a,to:e.b,score:e.score,method:e.method,reasons:e.reasons})),
      conflicts:componentConflicts.map(e=>({from:e.a,to:e.b,score:e.score,method:e.method,reasons:e.reasons})),
      reasons,
      hasFR,hasPtcgFR,hasTcgdexFR
    });
  }

  const autoComponents=outputComponents.filter(x=>x.decision==="AUTO_MERGE"||x.decision==="AUTO_MERGE_WITH_WARNING");
  const multiLanguage=outputComponents.filter(x=>x.languages.length>1);
  const languagePairs:Record<string,number>={};
  for(const e of strongEdges){const a=nodeById.get(e.a)!,b=nodeById.get(e.b)!; const pair=[a.language,b.language].sort().join("-"); languagePairs[pair]=(languagePairs[pair]??0)+1;}

  const output={
    generatedAt:new Date().toISOString(),
    mode:"full-card-entity-resolution-dry-run",
    writeToSupabase:false,
    languages:LANGUAGES,
    repo:repoDir,
    rules:{
      candidateScope:"même set logique + même numéro; FR TCGdex relié au set JP via set_mappings vérifié",
      printKey:"jamais utilisé seul; renforce une correspondance PTCG",
      cardKey:"renforce une correspondance mais ne suffit jamais seul",
      pokemon:"même numéro + même catégorie + même Pokédex; auteur/HP/types renforcent; Pokédex différent = conflit",
      trainerEnergy:"même numéro + même catégorie; auteur/card_key/attributs renforcent",
      tcgdexFR:"aucun print_key/card_key; utilise numéro + catégorie + Dex + attributs disponibles et mapping de set",
      componentMerge:`seules les arêtes >= ${minAuto} sont utilisées pour fusionner les composants`,
      ambiguity:"plusieurs cartes d'une même langue dans un composant => warning, jamais fusion silencieuse",
      unmatched:"une carte sans preuve reste indépendante et peut devenir sa propre card_entity",
      supabaseWrites:false
    },
    summary:{
      repoNodes:nodes.filter(x=>x.source==="ptcg").length,
      tcgdexFRNodes:nodes.filter(x=>x.source==="tcgdex").length,
      totalNodes:nodes.length,
      sets:nodes.length?groups.size:0,
      strongEdges:strongEdges.length,
      reviewEdges:edges.filter(e=>e.score<minAuto).length,
      hardConflicts:hardConflicts.length,
      components:outputComponents.length,
      multiLanguageComponents:multiLanguage.length,
      autoMergeComponents:decisionCounts.AUTO_MERGE,
      autoMergeWithWarningComponents:decisionCounts.AUTO_MERGE_WITH_WARNING,
      reviewComponents:decisionCounts.REVIEW,
      conflictComponents:decisionCounts.CONFLICT,
      unmatchedComponents:decisionCounts.UNMATCHED,
      strongEdgeLanguagePairs:languagePairs
    },
    components:outputComponents
  };

  fs.writeFileSync(outputPath,JSON.stringify(output,null,2),"utf8");
  console.log("==============================================");
  console.log(" DRY RUN TERMINÉ");
  console.log("==============================================");
  console.log(`AUTO_MERGE             : ${decisionCounts.AUTO_MERGE}`);
  console.log(`AUTO_MERGE_WITH_WARNING: ${decisionCounts.AUTO_MERGE_WITH_WARNING}`);
  console.log(`REVIEW                 : ${decisionCounts.REVIEW}`);
  console.log(`CONFLICT               : ${decisionCounts.CONFLICT}`);
  console.log(`UNMATCHED              : ${decisionCounts.UNMATCHED}`);
  console.log(`Arêtes fortes          : ${strongEdges.length}`);
  console.log(`Arêtes en revue        : ${edges.filter(e=>e.score<minAuto).length}`);
  console.log(`Conflits durs          : ${hardConflicts.length}`);
  console.log(`Rapport                : ${outputPath}`);
}

main().catch(e=>{ console.error("ERREUR FATALE:",e); process.exit(1); });
