import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Variables Supabase manquantes. Vérifie ton fichier .env.local."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const PAGE_SIZE = 1000;
const EXAMPLE_LIMIT = 30;

type SetRow = {
  id: string;
  source_id: string;
  name: string;
  language: string | null;
  region: string | null;
};

type CardRow = {
  id: string;
  set_id: string;
  source: string;
  source_id: string;
  local_id: string;
  name: string;
  language: string | null;
  rarity: string | null;
  category: string | null;
  artist: string | null;
  dex_ids: number[] | null;
};

type SetMappingRow = {
  source_set_id: string;
  target_set_id: string;
  mapping_type: string;
  confidence: number;
  status: string;
};

type CardPokemonRow = {
  card_id: string;
  pokemon_entity_id: string;
  dex_position: number | null;
};

type PokemonEntityRow = {
  id: string;
  dex_id: number;
  name_fr: string;
};

type Candidate = {
  card: CardRow;
  score: number;
  reasons: string[];
};

type MatchResult = {
  jp: CardRow;
  candidates: Candidate[];
  classification: "AUTO" | "REVIEW" | "NONE";
};

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeNumber(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function sameArray(a: number[] | null, b: number[] | null): boolean {
  if (!a?.length || !b?.length) return false;

  const aa = [...new Set(a)].sort((x, y) => x - y);
  const bb = [...new Set(b)].sort((x, y) => x - y);

  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function hasCommonDexId(a: number[] | null, b: number[] | null): boolean {
  if (!a?.length || !b?.length) return false;
  return a.some((id) => b.includes(id));
}

function getLanguage(value: string | null): string {
  return normalize(value);
}

async function fetchAll<T>(
  table: string,
  select: string,
  filters: (query: any) => any = (query) => query
): Promise<T[]> {
  const result: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from(table)
      .select(select)
      .range(from, to);

    query = filters(query);

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Erreur lecture ${table} : ${error.message}`
      );
    }

    if (!data || data.length === 0) break;

    result.push(...(data as T[]));

    if (data.length < PAGE_SIZE) break;
  }

  return result;
}

// ---------------------------------------------------------
// Scoring V2
// ---------------------------------------------------------

function scoreCandidate(
  jp: CardRow,
  fr: CardRow,
  jpDexIds: Set<number>,
  frDexIds: Set<number>,
  setMapping: SetMappingRow
): Candidate {
  let score = 0;
  const reasons: string[] = [];

  const jpNumber = normalizeNumber(jp.local_id);
  const frNumber = normalizeNumber(fr.local_id);

  // -------------------------------------------------------
  // 1. Même numéro
  // -------------------------------------------------------

  if (jpNumber && frNumber && jpNumber === frNumber) {
    score += 35;
    reasons.push("même numéro");
  }

  // -------------------------------------------------------
  // 2. Même Pokémon via card_pokemon / dex_id
  // -------------------------------------------------------

  const commonDexIds = [...jpDexIds].filter((id) =>
    frDexIds.has(id)
  );

  if (commonDexIds.length > 0) {
    if (jpDexIds.size === frDexIds.size && commonDexIds.length === jpDexIds.size) {
      score += 45;
      reasons.push(
        `même Pokémon (#${commonDexIds.join(", #")})`
      );
    } else {
      score += 30;
      reasons.push(
        `Pokémon commun (#${commonDexIds.join(", #")})`
      );
    }
  }

  // -------------------------------------------------------
  // 3. Même catégorie
  // -------------------------------------------------------

  if (
    normalize(jp.category) &&
    normalize(jp.category) === normalize(fr.category)
  ) {
    score += 5;
    reasons.push("même catégorie");
  }

  // -------------------------------------------------------
  // 4. Même rareté
  // -------------------------------------------------------

  if (
    normalize(jp.rarity) &&
    normalize(jp.rarity) === normalize(fr.rarity)
  ) {
    score += 5;
    reasons.push("même rareté");
  }

  // -------------------------------------------------------
  // 5. Même illustrateur
  // -------------------------------------------------------

  if (
    normalize(jp.artist) &&
    normalize(jp.artist) === normalize(fr.artist)
  ) {
    score += 8;
    reasons.push("même illustrateur");
  }

  // -------------------------------------------------------
  // 6. Nom identique après normalisation
  // -------------------------------------------------------

  if (
    normalize(jp.name) &&
    normalize(fr.name) &&
    normalize(jp.name) === normalize(fr.name)
  ) {
    score += 2;
    reasons.push("nom identique");
  }

  // -------------------------------------------------------
  // 7. Confiance du mapping de set
  // -------------------------------------------------------

  if (setMapping.confidence >= 0.99) {
    score += 5;
    reasons.push("mapping de set certain");
  } else if (setMapping.confidence >= 0.9) {
    score += 3;
    reasons.push("mapping de set fiable");
  }

  return {
    card: fr,
    score: Math.min(score, 100),
    reasons,
  };
}

// ---------------------------------------------------------
// Classification
// ---------------------------------------------------------

function classify(
  candidates: Candidate[]
): "AUTO" | "REVIEW" | "NONE" {
  if (candidates.length === 0) {
    return "NONE";
  }

  const best = candidates[0];
  const second = candidates[1];

  /*
   * AUTO :
   *
   * 1. Même numéro + même Pokémon
   * 2. Score >= 85
   * 3. Une avance suffisante sur la deuxième candidate
   */

  const sameNumberAndPokemon =
    best.reasons.some((r) => r === "même numéro") &&
    best.reasons.some((r) => r.startsWith("même Pokémon"));

  if (
    sameNumberAndPokemon &&
    best.score >= 80 &&
    (!second || best.score - second.score >= 5)
  ) {
    return "AUTO";
  }

  if (
    best.score >= 90 &&
    (!second || best.score - second.score >= 10)
  ) {
    return "AUTO";
  }

  if (best.score >= 50) {
    return "REVIEW";
  }

  return "NONE";
}

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------

async function main() {
  console.log("");
  console.log("==============================================");
  console.log(" MATCHING CARTES JP -> FR — V2");
  console.log("==============================================");
  console.log("");
  console.log(
    "MODE : DRY-RUN — aucune modification en base."
  );
  console.log("");
  console.log(
    "Matching basé sur : set_mapping + numéro + Pokémon/Dex"
  );
  console.log("");

  // -------------------------------------------------------
  // Sets
  // -------------------------------------------------------

  console.log("Chargement des sets...");

  const sets = await fetchAll<SetRow>(
    "sets",
    "id,source_id,name,language,region"
  );

  const setsById = new Map<string, SetRow>(
    sets.map((set) => [set.id, set])
  );

  const jpSets = sets.filter((set) => {
    const language = normalize(set.language);
    const region = normalize(set.region);
    const source = normalize(set.source_id);

    return (
      language === "ja" ||
      language === "jp" ||
      language === "japanese" ||
      region === "jp" ||
      region === "japan" ||
      source.includes("jp")
    );
  });

  const frSets = sets.filter((set) => {
    const language = normalize(set.language);
    const region = normalize(set.region);

    return (
      language === "fr" ||
      language === "fra" ||
      language === "french" ||
      region === "fr" ||
      region === "france"
    );
  });

  console.log(`Sets JP : ${jpSets.length}`);
  console.log(`Sets FR : ${frSets.length}`);

  // -------------------------------------------------------
  // Set mappings
  // -------------------------------------------------------

  console.log("");
  console.log("Chargement des mappings JP -> FR...");

  const mappings = await fetchAll<SetMappingRow>(
    "set_mappings",
    "source_set_id,target_set_id,mapping_type,confidence,status",
    (query) => query.eq("status", "verified")
  );

  const mappingsBySource = new Map<string, SetMappingRow[]>();

  for (const mapping of mappings) {
    const list =
      mappingsBySource.get(mapping.source_set_id) ?? [];

    list.push(mapping);
    mappingsBySource.set(mapping.source_set_id, list);
  }

  console.log(`Mappings vérifiés : ${mappings.length}`);

  // -------------------------------------------------------
  // Cards
  // -------------------------------------------------------

  console.log("");
  console.log("Chargement des cartes...");

  const cards = await fetchAll<CardRow>(
    "cards",
    [
      "id",
      "set_id",
      "source",
      "source_id",
      "local_id",
      "name",
      "language",
      "rarity",
      "category",
      "artist",
      "dex_ids",
    ].join(",")
  );

  console.log(`Cartes en base : ${cards.length}`);

  const jpCards = cards.filter((card) => {
    const language = getLanguage(card.language);

    return (
      language === "ja" ||
      language === "jp" ||
      language === "japanese"
    );
  });

  const frCards = cards.filter((card) => {
    const language = getLanguage(card.language);

    return (
      language === "fr" ||
      language === "fra" ||
      language === "french"
    );
  });

  console.log(`Cartes JP : ${jpCards.length}`);
  console.log(`Cartes FR : ${frCards.length}`);

  // -------------------------------------------------------
  // card_pokemon
  // -------------------------------------------------------

  console.log("");
  console.log("Chargement des relations card_pokemon...");

  const cardPokemon = await fetchAll<CardPokemonRow>(
    "card_pokemon",
    "card_id,pokemon_entity_id,dex_position"
  );

  console.log(
    `Relations card_pokemon : ${cardPokemon.length}`
  );

  // -------------------------------------------------------
  // pokemon_entities
  // -------------------------------------------------------

  console.log("");
  console.log("Chargement des Pokémon...");

  const pokemonEntities = await fetchAll<PokemonEntityRow>(
    "pokemon_entities",
    "id,dex_id,name_fr"
  );

  console.log(
    `Pokémon dans pokemon_entities : ${pokemonEntities.length}`
  );

  // -------------------------------------------------------
  // Index Pokémon par carte
  // -------------------------------------------------------

  const pokemonIdsByCard = new Map<string, Set<number>>();

  const pokemonByEntityId = new Map<
    string,
    PokemonEntityRow
  >(
    pokemonEntities.map((pokemon) => [
      pokemon.id,
      pokemon,
    ])
  );

  for (const relation of cardPokemon) {
    const pokemon = pokemonByEntityId.get(
      relation.pokemon_entity_id
    );

    if (!pokemon) continue;

    const set =
      pokemonIdsByCard.get(relation.card_id) ??
      new Set<number>();

    set.add(pokemon.dex_id);

    pokemonIdsByCard.set(relation.card_id, set);
  }

  // -------------------------------------------------------
  // Index FR par set
  // -------------------------------------------------------

  const frCardsBySet = new Map<string, CardRow[]>();

  for (const card of frCards) {
    const list =
      frCardsBySet.get(card.set_id) ?? [];

    list.push(card);
    frCardsBySet.set(card.set_id, list);
  }

  // -------------------------------------------------------
  // Matching
  // -------------------------------------------------------

  let examined = 0;
  let autoMatches = 0;
  let reviewMatches = 0;
  let noMatches = 0;
  let noSetMapping = 0;

  const autoResults: {
    jp: CardRow;
    fr: Candidate;
  }[] = [];

  const reviewResults: MatchResult[] = [];

  for (const jp of jpCards) {
    examined++;

    const jpSet = setsById.get(jp.set_id);

    if (!jpSet) {
      noSetMapping++;
      continue;
    }

    const setMappings =
      mappingsBySource.get(jpSet.id) ?? [];

    if (setMappings.length === 0) {
      noSetMapping++;
      continue;
    }

    // -----------------------------------------------------
    // Dex IDs de la carte JP
    // -----------------------------------------------------

    const jpDexIds =
      pokemonIdsByCard.get(jp.id) ??
      new Set<number>();

    // Fallback sur dex_ids de cards si card_pokemon absent.
    if (jpDexIds.size === 0 && jp.dex_ids?.length) {
      for (const id of jp.dex_ids) {
        jpDexIds.add(id);
      }
    }

    const candidates: Candidate[] = [];

    // -----------------------------------------------------
    // Parcours des sets FR liés
    // -----------------------------------------------------

    for (const mapping of setMappings) {
      const frSetCards =
        frCardsBySet.get(mapping.target_set_id) ?? [];

      for (const fr of frSetCards) {
        const frDexIds =
          pokemonIdsByCard.get(fr.id) ??
          new Set<number>();

        // Fallback
        if (frDexIds.size === 0 && fr.dex_ids?.length) {
          for (const id of fr.dex_ids) {
            frDexIds.add(id);
          }
        }

        const candidate = scoreCandidate(
          jp,
          fr,
          jpDexIds,
          frDexIds,
          mapping
        );

        if (candidate.score >= 20) {
          candidates.push(candidate);
        }
      }
    }

    // -----------------------------------------------------
    // Suppression des doublons
    // -----------------------------------------------------

    const uniqueCandidates = Array.from(
      new Map(
        candidates.map((candidate) => [
          candidate.card.id,
          candidate,
        ])
      ).values()
    );

    uniqueCandidates.sort(
      (a, b) => b.score - a.score
    );

    const classification =
      classify(uniqueCandidates);

    if (classification === "AUTO") {
      autoMatches++;

      autoResults.push({
        jp,
        fr: uniqueCandidates[0],
      });
    } else if (classification === "REVIEW") {
      reviewMatches++;

      reviewResults.push({
        jp,
        candidates: uniqueCandidates.slice(0, 5),
        classification,
      });
    } else {
      noMatches++;
    }
  }

  // -------------------------------------------------------
  // Résumé
  // -------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================");
  console.log("");
  console.log(
    `Cartes JP examinées        : ${examined}`
  );
  console.log(
    `Correspondances AUTO       : ${autoMatches}`
  );
  console.log(
    `Correspondances À VÉRIFIER : ${reviewMatches}`
  );
  console.log(
    `Aucune correspondance      : ${noMatches}`
  );
  console.log(
    `Sans mapping de set        : ${noSetMapping}`
  );

  // -------------------------------------------------------
  // Exemples AUTO
  // -------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log(" EXEMPLES — MATCHES AUTOMATIQUES");
  console.log("==============================================");

  if (autoResults.length === 0) {
    console.log("");
    console.log("Aucun match automatique.");
  }

  for (const result of autoResults.slice(
    0,
    EXAMPLE_LIMIT
  )) {
    const jpSet =
      setsById.get(result.jp.set_id);

    const frSet =
      setsById.get(result.fr.card.set_id);

    console.log("");
    console.log(
      `🇯🇵 ${jpSet?.source_id ?? "?"} ${result.jp.local_id} — ${result.jp.name}`
    );

    console.log(
      `🇫🇷 ${frSet?.source_id ?? "?"} ${result.fr.card.local_id} — ${result.fr.card.name}`
    );

    console.log(
      `   Score : ${result.fr.score}/100`
    );

    console.log(
      `   Raisons : ${result.fr.reasons.join(", ")}`
    );
  }

  // -------------------------------------------------------
  // Exemples REVIEW
  // -------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log(" EXEMPLES — À VÉRIFIER");
  console.log("==============================================");

  if (reviewResults.length === 0) {
    console.log("");
    console.log("Aucun cas à vérifier.");
  }

  for (const result of reviewResults.slice(
    0,
    EXAMPLE_LIMIT
  )) {
    const jpSet =
      setsById.get(result.jp.set_id);

    console.log("");
    console.log(
      `🇯🇵 ${jpSet?.source_id ?? "?"} ${result.jp.local_id} — ${result.jp.name}`
    );

    for (const candidate of result.candidates) {
      const frSet =
        setsById.get(candidate.card.set_id);

      console.log(
        `   🇫🇷 ${frSet?.source_id ?? "?"} ${candidate.card.local_id} — ${candidate.card.name}`
      );

      console.log(
        `      Score : ${candidate.score}/100`
      );

      console.log(
        `      Raisons : ${candidate.reasons.join(", ")}`
      );
    }
  }

  // -------------------------------------------------------
  // Fin
  // -------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log(" FIN DU DRY-RUN");
  console.log("==============================================");
  console.log("");
  console.log(
    "Aucune modification n'a été effectuée dans Supabase."
  );
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("❌ ERREUR");
  console.error(error);
  process.exit(1);
});