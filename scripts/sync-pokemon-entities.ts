import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

const PAGE_SIZE = 1000;
const CARD_BATCH_SIZE = 500;

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

type CardRow = {
  id: string;
  name: string;
  dex_ids: number[];
};

type PokemonCandidate = {
  dexId: number;
  names: Map<string, number>;
};

// ------------------------------------------------------------
// RÉCUPÉRER LES CARTES FR
// ------------------------------------------------------------

async function fetchFrenchPokemonCards(): Promise<CardRow[]> {
  const cards: CardRow[] = [];

  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, name, dex_ids")
      .eq("language", "FR")
      .eq("category", "Pokémon")
      .not("dex_ids", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const dexIds = Array.isArray(row.dex_ids)
        ? row.dex_ids.filter(
            (id: unknown): id is number =>
              typeof id === "number"
          )
        : [];

      if (dexIds.length === 0) {
        continue;
      }

      cards.push({
        id: row.id,
        name: row.name,
        dex_ids: dexIds,
      });
    }

    console.log(
      `Cartes FR récupérées : ${cards.length}`
    );

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return cards;
}

// ------------------------------------------------------------
// NETTOYAGE DU NOM
// ------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ");
}

// ------------------------------------------------------------
// ESSAYER DE TROUVER LE NOM DE BASE
// ------------------------------------------------------------

function scoreName(name: string): number {
  let score = 0;

  const lower = name.toLowerCase();

  // Les noms simples sont préférés.
  score += name.length;

  // On pénalise les suffixes qui décrivent une carte
  // plutôt que l'identité du Pokémon.

  const suffixes = [
    " ex",
    " gx",
    " v",
    " vmax",
    " vstar",
    " radieux",
    " brillant",
    " obscur",
    " δ",
    " de la team rocket",
    " de rocket",
    " méga-",
    " mega-",
  ];

  for (const suffix of suffixes) {
    if (lower.includes(suffix)) {
      score += 100;
    }
  }

  return score;
}

// ------------------------------------------------------------
// CONSTRUIRE LES CANDIDATS
// ------------------------------------------------------------

function buildPokemonCandidates(
  cards: CardRow[]
): Map<number, PokemonCandidate> {
  const candidates = new Map<
    number,
    PokemonCandidate
  >();

  for (const card of cards) {
    const name = normalizeName(card.name);

    for (const dexId of card.dex_ids) {
      if (!candidates.has(dexId)) {
        candidates.set(dexId, {
          dexId,
          names: new Map(),
        });
      }

      const candidate = candidates.get(dexId)!;

      candidate.names.set(
        name,
        (candidate.names.get(name) ?? 0) + 1
      );
    }
  }

  return candidates;
}

// ------------------------------------------------------------
// CHOISIR LE NOM FR DE RÉFÉRENCE
// ------------------------------------------------------------

function chooseFrenchName(
  candidate: PokemonCandidate
): string {
  const names = [...candidate.names.entries()];

  names.sort((a, b) => {
    const scoreA = scoreName(a[0]);
    const scoreB = scoreName(b[0]);

    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }

    // À score équivalent, le nom apparaissant
    // le plus souvent est privilégié.
    return b[1] - a[1];
  });

  return names[0][0];
}

// ------------------------------------------------------------
// CRÉER / RÉCUPÉRER LES POKEMON ENTITIES
// ------------------------------------------------------------

async function upsertPokemonEntities(
  candidates: Map<number, PokemonCandidate>
) {
  const entities = [];

  for (const candidate of candidates.values()) {
    const nameFr = chooseFrenchName(candidate);

    entities.push({
      dex_id: candidate.dexId,
      name_fr: nameFr,
    });
  }

  entities.sort((a, b) => a.dex_id - b.dex_id);

  console.log("");
  console.log(
    `Pokémon uniques trouvés : ${entities.length}`
  );

  for (let i = 0; i < entities.length; i += 100) {
    const batch = entities.slice(i, i + 100);

    const { error } = await supabase
      .from("pokemon_entities")
      .upsert(batch, {
        onConflict: "dex_id",
      });

    if (error) {
      throw error;
    }

    console.log(
      `Entités Pokémon enregistrées : ${Math.min(
        i + batch.length,
        entities.length
      )}/${entities.length}`
    );
  }

  return entities;
}

// ------------------------------------------------------------
// RÉCUPÉRER LES ENTITÉS
// ------------------------------------------------------------

async function fetchPokemonEntityMap(): Promise<
  Map<number, string>
> {
  const map = new Map<number, string>();

  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pokemon_entities")
      .select("id, dex_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      map.set(row.dex_id, row.id);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return map;
}

// ------------------------------------------------------------
// CRÉER LES RELATIONS CARD ↔ POKEMON
// ------------------------------------------------------------

async function createCardPokemonRelations(
  cards: CardRow[],
  entityMap: Map<number, string>
) {
  let totalRelations = 0;
  let skipped = 0;

  const relations: {
    card_id: string;
    pokemon_entity_id: string;
    dex_position: number;
  }[] = [];

  for (const card of cards) {
    for (
      let position = 0;
      position < card.dex_ids.length;
      position++
    ) {
      const dexId = card.dex_ids[position];

      const entityId = entityMap.get(dexId);

      if (!entityId) {
        skipped++;
        continue;
      }

      relations.push({
        card_id: card.id,
        pokemon_entity_id: entityId,
        dex_position: position,
      });

      totalRelations++;
    }
  }

  console.log("");
  console.log(
    `Relations à créer : ${totalRelations}`
  );

  console.log(
    `Relations ignorées : ${skipped}`
  );

  for (
    let i = 0;
    i < relations.length;
    i += CARD_BATCH_SIZE
  ) {
    const batch = relations.slice(
      i,
      i + CARD_BATCH_SIZE
    );

    const { error } = await supabase
      .from("card_pokemon")
      .upsert(batch, {
        onConflict: "card_id,pokemon_entity_id",
      });

    if (error) {
      throw error;
    }

    console.log(
      `Relations enregistrées : ${Math.min(
        i + batch.length,
        relations.length
      )}/${relations.length}`
    );
  }

  return {
    totalRelations,
    skipped,
  };
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

async function main() {
  console.log("==============================================");
  console.log("SYNC POKÉMON ENTITIES");
  console.log("==============================================");
  console.log("");

  // 1. Cartes FR
  const cards = await fetchFrenchPokemonCards();

  console.log("");
  console.log(
    `Cartes FR Pokémon avec dexId : ${cards.length}`
  );

  // 2. Candidats Pokémon
  const candidates =
    buildPokemonCandidates(cards);

  console.log(
    `Pokémon uniques identifiés : ${candidates.size}`
  );

  // 3. Entities
  await upsertPokemonEntities(candidates);

  // 4. Mapping dexId → entity UUID
  const entityMap =
    await fetchPokemonEntityMap();

  console.log(
    `Entities disponibles : ${entityMap.size}`
  );

  // 5. Relations cartes ↔ Pokémon
  const result =
    await createCardPokemonRelations(
      cards,
      entityMap
    );

  console.log("");
  console.log("==============================================");
  console.log("TERMINÉ");
  console.log("==============================================");

  console.log(
    `Cartes analysées       : ${cards.length}`
  );

  console.log(
    `Pokémon entities       : ${candidates.size}`
  );

  console.log(
    `Relations créées       : ${result.totalRelations}`
  );

  console.log(
    `Relations ignorées     : ${result.skipped}`
  );
}

main().catch((error) => {
  console.error("");
  console.error("ERREUR FATALE");
  console.error(error);
  process.exit(1);
});