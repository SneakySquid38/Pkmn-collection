import fs from "node:fs";
import path from "node:path";

/**
 * Prototype WESTERN / ASIAN pour le catalogue Pokémon.
 *
 * Objectif :
 * - WESTERN = FR uniquement pour l'instant
 * - ASIAN = JP / KO / SC / TC
 * - retrouver une carte par set, groupe de langues ou langue
 * - conserver une image distincte par langue
 * - regrouper les cartes multilingues quand la preuve est suffisante
 * - laisser une carte seule si aucune correspondance fiable n'existe
 * - AUCUNE écriture Supabase
 *
 * Exemple :
 *   npx tsx scripts/prototype-western-asian.ts --sets=S4,S4a,SV10
 *
 * Le repo PTCG-database doit être présent dans ./PTCG-database.
 */

type Language = "FR" | "JP" | "KO" | "SC" | "TC";
type LanguageGroup = "WESTERN" | "ASIAN";
type Category = "pokemon" | "trainer" | "energy" | "unknown";

type RawCard = Record<string, unknown>;

type Card = {
  id: string;
  language: Language;
  languageGroup: LanguageGroup;
  setId: string;
  setName: string | null;
  number: string | null;
  name: string | null;
  category: Category;
  pokedexNumber: number | null;
  author: string[];
  printKey: string | null;
  cardKey: string | null;
  rarity: string | null;
  image: string | null;
  sourceFile: string;
};

type CardIdentity = {
  id: string;
  setId: string;
  setName: string | null;
  languageGroups: LanguageGroup[];
  languages: Language[];
  cards: Array<{
    cardId: string;
    language: Language;
    languageGroup: LanguageGroup;
    number: string | null;
    name: string | null;
    category: Category;
    pokedexNumber: number | null;
    rarity: string | null;
    image: string | null;
    printKey: string | null;
    cardKey: string | null;
  }>;
  matchMethod: "print_key" | "fallback" | "single";
  confidence: number;
};

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(x => x.startsWith("--"))
    .map(x => {
      const i = x.indexOf("=");
      return [x.slice(2, i > 0 ? i : undefined), i > 0 ? x.slice(i + 1) : "true"];
    })
);

const repoDir = path.resolve(args.repo ?? path.resolve(process.cwd(), "PTCG-database"));
const selectedSets = String(args.sets ?? "S4,S4a,SV10")
  .split(",")
  .map(x => x.trim())
  .filter(Boolean);
const outputPath = path.resolve(
  args.output ?? path.resolve(process.cwd(), "prototype-western-asian.json")
);

const LANGUAGES: Language[] = ["FR", "JP", "KO", "SC", "TC"];
const GROUPS: Record<LanguageGroup, Language[]> = {
  WESTERN: ["FR"],
  ASIAN: ["JP", "KO", "SC", "TC"],
};

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s._'’`-]+/g, "");
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function number(v: unknown): string | null {
  const x = text(v);
  if (!x) return null;
  if (/^\d+$/.test(x)) return String(Number(x));
  return x.toUpperCase().replace(/\s+/g, "");
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => norm(x)).filter(Boolean) : [];
}

function authors(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => norm(x)).filter(Boolean);
}

function languageFromDir(dir: string): Language | null {
  const x = dir.toLowerCase();
  if (x === "data_fr") return "FR";
  if (x === "data_jp") return "JP";
  if (x === "data_ko") return "KO";
  if (x === "data_sc") return "SC";
  if (x === "data_tc") return "TC";
  return null;
}

function languageGroup(language: Language): LanguageGroup {
  return language === "FR" ? "WESTERN" : "ASIAN";
}

function category(v: unknown): Category {
  const x = norm(v);
  if (["pokemon", "pokémon", "ポケモン"].includes(x)) return "pokemon";
  if ([
    "trainer", "dresseur", "trainercard", "グッズ", "サポート", "スタジアム",
    "ポケモンのどうぐ", "supporter", "item", "tool", "stadium",
    "trainerkarte", "cartaentrenador", "cartaentrenadora", "treinador"
  ].includes(x)) return "trainer";
  if ([
    "energy", "énergie", "energie", "特殊エネルギー", "basicenergy",
    "specialenergy", "energiebasique", "energía", "energia"
  ].includes(x)) return "energy";
  return "unknown";
}

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

function readCard(filePath: string, language: Language, setId: string): Card | null {
  let raw: RawCard;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }

  return {
    id: `ptcg:${language}:${setId}:${path.basename(filePath, ".json")}`,
    language,
    languageGroup: languageGroup(language),
    setId,
    setName: text(raw.set_full_name ?? raw.set_name),
    number: number(raw.number),
    name: text(raw.name),
    category: category(raw.card_type ?? raw.category ?? raw.sub_type),
    pokedexNumber: typeof raw.pokedex_number === "number" ? raw.pokedex_number : null,
    author: authors(raw.author ?? raw.authors ?? raw.illustrator),
    printKey: text(raw.print_key ?? raw.printKey),
    cardKey: text(raw.card_key ?? raw.cardKey),
    rarity: text(raw.rarity),
    // PTCG-database utilise `img`, pas `image`.
    image: text(raw.img ?? raw.image ?? raw.image_url),
    sourceFile: filePath,
  };
}

function keyForPrint(card: Card): string | null {
  if (!card.printKey || !card.number) return null;
  return `${norm(card.printKey)}|||${card.number}`;
}

function fallbackKey(card: Card): string | null {
  if (!card.number) return null;
  // Fallback volontairement conservateur : même set + numéro + catégorie.
  return `${card.setId}|||${card.number}|||${card.category}`;
}

function compatible(a: Card, b: Card): boolean {
  if (a.language === b.language) return false;
  if (a.number !== b.number) return false;
  if (a.category !== "unknown" && b.category !== "unknown" && a.category !== b.category) return false;
  if (a.category === "pokemon" && b.category === "pokemon") {
    if (a.pokedexNumber != null && b.pokedexNumber != null && a.pokedexNumber !== b.pokedexNumber) return false;
  }
  return true;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function main() {
  if (!fs.existsSync(repoDir)) {
    throw new Error(`PTCG-database introuvable : ${repoDir}`);
  }

  const cards: Card[] = [];
  const missingSets: string[] = [];

  for (const language of LANGUAGES) {
    const dataDir = path.join(repoDir, `data_${language.toLowerCase()}`);
    for (const setId of selectedSets) {
      const setDir = path.join(dataDir, setId);
      if (!fs.existsSync(setDir)) {
        missingSets.push(`${language}/${setId}`);
        continue;
      }
      for (const file of filesRecursive(setDir)) {
        const card = readCard(file, language, setId);
        if (card) cards.push(card);
      }
    }
  }

  const cardsById = new Map(cards.map(c => [c.id, c]));

  // -----------------------------------------------------------------------
  // 1. Construction des familles de set.
  // -----------------------------------------------------------------------
  // Ici, les sets portant le même identifiant PTCG-database constituent la
  // famille de test. Plus tard, cette couche sera alimentée par set_mappings
  // et/ou des relations explicites de set_family.
  const setGroups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.setId;
    const arr = setGroups.get(key) ?? [];
    arr.push(card);
    setGroups.set(key, arr);
  }

  // -----------------------------------------------------------------------
  // 2. Résolution des cartes à l'intérieur d'une famille de set.
  // -----------------------------------------------------------------------
  // Priorité : print_key + numéro.
  // Fallback : set + numéro + catégorie, uniquement si compatible.
  const identityGroups = new Map<string, Card[]>();
  const used = new Set<string>();

  // 2a. print_key
  const byPrint = new Map<string, Card[]>();
  for (const card of cards) {
    const key = keyForPrint(card);
    if (!key) continue;
    const arr = byPrint.get(key) ?? [];
    arr.push(card);
    byPrint.set(key, arr);
  }

  let identityCounter = 0;
  for (const [key, candidates] of byPrint) {
    const selected: Card[] = [];
    for (const card of candidates) {
      if (selected.some(x => x.language === card.language)) continue;
      if (selected.every(x => compatible(x, card))) selected.push(card);
    }

    // On ne crée un groupe multilingue que s'il y a au moins deux langues.
    if (selected.length >= 2) {
      const id = `ci-${String(++identityCounter).padStart(6, "0")}`;
      identityGroups.set(id, selected);
      selected.forEach(c => used.add(c.id));
    }
  }

  // 2b. cartes restantes : fallback prudent, puis singleton.
  const byFallback = new Map<string, Card[]>();
  for (const card of cards) {
    if (used.has(card.id)) continue;
    const key = fallbackKey(card);
    if (!key) continue;
    const arr = byFallback.get(key) ?? [];
    arr.push(card);
    byFallback.set(key, arr);
  }

  for (const candidates of byFallback.values()) {
    const selected: Card[] = [];
    for (const card of candidates) {
      if (selected.some(x => x.language === card.language)) continue;
      if (selected.every(x => compatible(x, card))) selected.push(card);
    }
    if (selected.length >= 2) {
      const id = `ci-${String(++identityCounter).padStart(6, "0")}`;
      identityGroups.set(id, selected);
      selected.forEach(c => used.add(c.id));
    }
  }

  // 2c. Toute carte restante devient sa propre identité.
  for (const card of cards) {
    if (used.has(card.id)) continue;
    const id = `ci-${String(++identityCounter).padStart(6, "0")}`;
    identityGroups.set(id, [card]);
    used.add(card.id);
  }

  const identities: CardIdentity[] = [];
  const cardToIdentity: Record<string, string> = {};

  for (const [identityId, members] of identityGroups) {
    const languages = unique(members.map(x => x.language));
    const groups = unique(members.map(x => x.languageGroup));
    const hasMultiLanguage = languages.length > 1;
    const hasPrintKey = members.length > 1 && members.every(x => !!x.printKey);

    const first = members[0];
    const identity: CardIdentity = {
      id: identityId,
      setId: first.setId,
      setName: first.setName,
      languageGroups: groups,
      languages,
      cards: members.map(card => ({
        cardId: card.id,
        language: card.language,
        languageGroup: card.languageGroup,
        number: card.number,
        name: card.name,
        category: card.category,
        pokedexNumber: card.pokedexNumber,
        rarity: card.rarity,
        image: card.image,
        printKey: card.printKey,
        cardKey: card.cardKey,
      })),
      matchMethod: hasMultiLanguage ? (hasPrintKey ? "print_key" : "fallback") : "single",
      confidence: hasMultiLanguage ? (hasPrintKey ? 100 : 90) : 0,
    };
    identities.push(identity);
    members.forEach(card => { cardToIdentity[card.id] = identityId; });
  }

  // -----------------------------------------------------------------------
  // 3. Index de recherche pour le futur site.
  // -----------------------------------------------------------------------
  const bySet: Record<string, string[]> = {};
  const byLanguageGroup: Record<string, string[]> = {};
  const byLanguage: Record<string, string[]> = {};
  const byNumber: Record<string, string[]> = {};

  for (const identity of identities) {
    (bySet[identity.setId] ??= []).push(identity.id);
    for (const group of identity.languageGroups) (byLanguageGroup[group] ??= []).push(identity.id);
    for (const lang of identity.languages) (byLanguage[lang] ??= []).push(identity.id);
    for (const card of identity.cards) {
      if (!card.number) continue;
      (byNumber[card.number] ??= []).push(identity.id);
    }
  }

  const setSummary = selectedSets.map(setId => {
    const setCards = cards.filter(c => c.setId === setId);
    return {
      setId,
      setName: setCards.find(c => c.setName)?.setName ?? null,
      languagesPresent: unique(setCards.map(c => c.language)),
      languageGroupsPresent: unique(setCards.map(c => c.languageGroup)),
      cardsByLanguage: Object.fromEntries(
        LANGUAGES.map(lang => [lang, setCards.filter(c => c.language === lang).length])
      ),
      identities: identities.filter(i => i.setId === setId).length,
    };
  });

  const summary = {
    repo: repoDir,
    selectedSets,
    languages: LANGUAGES,
    languageGroups: GROUPS,
    cards: cards.length,
    identities: identities.length,
    multilingualIdentities: identities.filter(i => i.languages.length > 1).length,
    singletonIdentities: identities.filter(i => i.languages.length === 1).length,
    identitiesWesternAsian: identities.filter(i => i.languageGroups.includes("WESTERN") && i.languageGroups.includes("ASIAN")).length,
    identitiesAsianOnly: identities.filter(i => !i.languageGroups.includes("WESTERN") && i.languageGroups.includes("ASIAN")).length,
    identitiesWesternOnly: identities.filter(i => i.languageGroups.length === 1 && i.languageGroups[0] === "WESTERN").length,
    cardsWithImage: cards.filter(c => !!c.image).length,
    cardsWithoutImage: cards.filter(c => !c.image).length,
    missingSets,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    mode: "prototype-western-asian",
    writeToSupabase: false,
    model: {
      WESTERN: ["FR"],
      ASIAN: ["JP", "KO", "SC", "TC"],
      identityRule: "une carte sans correspondance reste une identité indépendante",
      imageRule: "l'image reste attachée à la carte et donc à sa langue, jamais à une identité abstraite",
      primaryMatch: "print_key + numéro",
      fallbackMatch: "set + numéro + catégorie, avec contrôles de compatibilité",
    },
    summary,
    setSummary,
    searchIndex: { bySet, byLanguageGroup, byLanguage, byNumber },
    identities,
    cards,
    cardToIdentity,
    diagnostics: {
      duplicateIdentityLanguages: identities
        .filter(i => i.languages.some(lang => i.languages.filter(x => x === lang).length > 1))
        .map(i => i.id),
      identitiesWithMixedGroups: identities
        .filter(i => i.languageGroups.length > 1)
        .map(i => ({ id: i.id, languages: i.languages, languageGroups: i.languageGroups })),
      examples: identities
        .filter(i => i.languages.length > 1)
        .slice(0, 20),
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("==============================================");
  console.log(" PROTOTYPE WESTERN / ASIAN");
  console.log("==============================================");
  console.log(`Sets testés                 : ${selectedSets.join(", ")}`);
  console.log(`Cartes chargées             : ${summary.cards}`);
  console.log(`Identités créées            : ${summary.identities}`);
  console.log(`Identités multilingues      : ${summary.multilingualIdentities}`);
  console.log(`Identités WESTERN + ASIAN  : ${summary.identitiesWesternAsian}`);
  console.log(`Identités ASIAN uniquement  : ${summary.identitiesAsianOnly}`);
  console.log(`Identités FR uniquement     : ${summary.identitiesWesternOnly}`);
  console.log(`Cartes avec image           : ${summary.cardsWithImage}`);
  console.log(`Cartes sans image           : ${summary.cardsWithoutImage}`);
  console.log("");
  for (const set of setSummary) {
    console.log(`${set.setId} | ${set.setName ?? "?"}`);
    console.log(`  langues : ${set.languagesPresent.join(", ")}`);
    console.log(`  cartes  : ${JSON.stringify(set.cardsByLanguage)}`);
    console.log(`  identités : ${set.identities}`);
  }
  if (missingSets.length) {
    console.log(`\nSets absents : ${missingSets.join(", ")}`);
  }
  console.log(`\nJSON : ${outputPath}`);
}

main();
