import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Variables Supabase manquantes dans .env.local");
const supabase = createClient(url, key);

const CARD_ID = "ca278e59-239f-43b1-8fe7-2f908635c502";
const PAGE = 1000;

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  console.log("==============================================");
  console.log(" CORRECTION card_pokemon — HGSSP-HGSS18");
  console.log("==============================================\n");

  const { data: cardRaw, error: cardError } = await supabase
    .from("cards")
    .select("id,source_id,language,dex_ids,name,set_id")
    .eq("id", CARD_ID)
    .single();
  const card: any = cardRaw;
  if (cardError || !card) throw new Error(`Carte introuvable : ${cardError?.message ?? CARD_ID}`);

  const dexIds = [...new Set((card.dex_ids ?? []).map((n: number) => Math.trunc(n)))];
  if (!dexIds.length) throw new Error("La carte ne possède aucun dex_id : arrêt de sécurité.");

  console.log(`Carte : ${card.source_id} — ${card.name}`);
  console.log(`Langue : ${card.language}`);
  console.log(`dex_ids source : ${dexIds.join(", ")}`);

  const entities = await fetchAll<{ id: string; dex_id: number }>("pokemon_entities", "id,dex_id");
  const byDex = new Map(entities.map((p) => [p.dex_id, p.id]));

  const missingEntities = dexIds.filter((dex) => !byDex.has(dex));
  if (missingEntities.length) {
    throw new Error(`Pokémon absents de pokemon_entities : ${missingEntities.join(", ")}`);
  }

  const existing = await fetchAll<{ card_id: string; pokemon_entity_id: string; dex_position: number | null }>(
    "card_pokemon",
    "card_id,pokemon_entity_id,dex_position",
    (q) => q.eq("card_id", CARD_ID),
  );

  const existingDex = new Set(
    existing
      .map((r) => entities.find((p) => p.id === r.pokemon_entity_id)?.dex_id)
      .filter((v): v is number => v != null),
  );

  console.log(`Relations actuelles : ${[...existingDex].join(", ") || "aucune"}`);

  const missingRelations = dexIds
    .filter((dex) => !existingDex.has(dex))
    .map((dex, position) => ({
      card_id: CARD_ID,
      pokemon_entity_id: byDex.get(dex)!,
      dex_position: position,
    }));

  if (!missingRelations.length) {
    console.log("\n✅ Aucune correction nécessaire.");
    return;
  }

  console.log(`Relations à ajouter : ${missingRelations.length}`);
  console.log(`  ${dexIds.filter((d) => !existingDex.has(d)).join(", ")}`);

  const { error: insertError } = await supabase
    .from("card_pokemon")
    .insert(missingRelations);
  if (insertError) throw new Error(`Insertion card_pokemon échouée : ${insertError.message}`);

  const after = await fetchAll<{ card_id: string; pokemon_entity_id: string; dex_position: number | null }>(
    "card_pokemon",
    "card_id,pokemon_entity_id,dex_position",
    (q) => q.eq("card_id", CARD_ID),
  );
  const afterDex = [...new Set(
    after
      .map((r) => entities.find((p) => p.id === r.pokemon_entity_id)?.dex_id)
      .filter((v): v is number => v != null),
  )].sort((a, b) => a - b);
  const expected = [...dexIds].sort((a, b) => a - b);

  if (JSON.stringify(afterDex) !== JSON.stringify(expected)) {
    throw new Error(`Vérification échouée : attendu [${expected}], obtenu [${afterDex}]`);
  }

  console.log(`\n✅ Correction terminée : relations = [${afterDex.join(", ")}]`);
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
