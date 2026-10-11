import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const API_BASE = "https://api.tcgdex.net/v2";
const LANGUAGE = "ja";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return await response.json();
      }

      if ([429, 502, 503, 504].includes(response.status)) {
        console.log(
          `  ⚠️ HTTP ${response.status} - nouvelle tentative (${attempt}/${retries})`
        );

        await sleep(1000 * attempt);
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      console.log(
        `  ⚠️ Erreur réseau - nouvelle tentative (${attempt}/${retries})`
      );

      await sleep(1000 * attempt);
    }
  }

  throw new Error("Impossible de récupérer les données");
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

async function main() {
  console.log("==============================================");
  console.log(" DIAGNOSTIC DES SETS JP SANS CARTES - TCGDEX");
  console.log("==============================================");
  console.log();

  console.log("📡 Récupération de la liste complète des sets JP...");

  const allSets = await fetchJson(`${API_BASE}/${LANGUAGE}/sets`);

  if (!Array.isArray(allSets)) {
    throw new Error("Réponse invalide pour /sets");
  }

  console.log(`✅ ${allSets.length} sets trouvés`);
  console.log();

  // On ignore les sets CS... comme dans le script d'import.
  const candidateSets = allSets.filter(
    (set: any) => !String(set.id ?? "").startsWith("CS")
  );

  console.log(
    `🔎 ${candidateSets.length} sets candidats après exclusion des sets CS`
  );
  console.log();

  const results: any[] = [];

  let processed = 0;

  for (const set of candidateSets) {
    processed++;

    console.log(
      `[${processed}/${candidateSets.length}] ${set.id} - ${set.name}`
    );

    try {
      const detail = await fetchJson(
        `${API_BASE}/${LANGUAGE}/sets/${encodeURIComponent(set.id)}`
      );

      const cards = Array.isArray(detail?.cards) ? detail.cards : [];

      const result = {
        id: set.id,
        name: set.name ?? null,
        series: set.serie?.name ?? null,
        releaseDate: set.releaseDate ?? null,

        listCardCount:
          set.cardCount?.total ??
          set.cardCount?.official ??
          null,

        listOfficialCardCount: set.cardCount?.official ?? null,

        detailCardCount: cards.length,

        detailOfficialCardCount:
          detail?.cardCount?.official ?? null,

        detailTotalCardCount:
          detail?.cardCount?.total ?? null,

        hasCards: cards.length > 0,

        detailId: detail?.id ?? null,
        detailName: detail?.name ?? null,
        detailSeries: detail?.serie?.name ?? null,
        detailReleaseDate: detail?.releaseDate ?? null,
      };

      results.push(result);

      if (cards.length > 0) {
        console.log(`   ✅ ${cards.length} cartes`);
      } else {
        console.log(`   ❌ 0 carte`);
      }
    } catch (error: any) {
      console.log(`   💥 ERREUR: ${error?.message ?? error}`);

      results.push({
        id: set.id,
        name: set.name ?? null,
        series: set.serie?.name ?? null,
        releaseDate: set.releaseDate ?? null,
        listCardCount: set.cardCount?.total ?? null,
        listOfficialCardCount: set.cardCount?.official ?? null,
        detailCardCount: null,
        detailOfficialCardCount: null,
        detailTotalCardCount: null,
        hasCards: false,
        error: error?.message ?? String(error),
      });
    }

    // Petite pause pour éviter de marteler l'API
    await sleep(100);
  }

  console.log();
  console.log("==============================================");
  console.log(" ANALYSE DES SETS SANS CARTES");
  console.log("==============================================");
  console.log();

  const zeroSets = results.filter((r) => r.detailCardCount === 0);

  console.log(`Sets sans cartes : ${zeroSets.length}`);
  console.log();

  for (const set of zeroSets) {
    console.log("----------------------------------------------");
    console.log(`ID              : ${set.id}`);
    console.log(`Nom             : ${set.name}`);
    console.log(`Série           : ${set.series}`);
    console.log(`Date            : ${set.releaseDate}`);
    console.log(`Cards /sets     : ${set.listCardCount}`);
    console.log(`Official /sets  : ${set.listOfficialCardCount}`);
    console.log(`Cards détail    : ${set.detailCardCount}`);
    console.log(`Official détail : ${set.detailOfficialCardCount}`);
    console.log(`Total détail    : ${set.detailTotalCardCount}`);

    // Recherche de potentiels doublons dans la liste globale.
    const sameName = candidateSets.filter(
      (other: any) =>
        other.id !== set.id &&
        normalize(other.name) === normalize(set.name)
    );

    if (sameName.length > 0) {
      console.log("🔁 POTENTIEL(S) DOUBLON(S) PAR NOM :");

      for (const duplicate of sameName) {
        console.log(
          `   - ${duplicate.id} | ${duplicate.name} | ${
            duplicate.releaseDate ?? "date inconnue"
          }`
        );
      }
    } else {
      console.log("🔁 Aucun doublon exact trouvé par nom.");
    }

    console.log();
  }

  // Résumé par type
  const withCards = results.filter((r) => r.detailCardCount > 0);

  const errors = results.filter((r) => r.error);

  console.log("==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================");
  console.log(`Sets analysés       : ${results.length}`);
  console.log(`Sets avec cartes    : ${withCards.length}`);
  console.log(`Sets sans cartes    : ${zeroSets.length}`);
  console.log(`Erreurs API         : ${errors.length}`);
  console.log();

  // Sauvegarde JSON exploitable ensuite
  const output = {
    generatedAt: new Date().toISOString(),
    language: LANGUAGE,
    totalSets: results.length,
    setsWithCards: withCards.length,
    setsWithoutCards: zeroSets.length,
    errors: errors.length,
    results,
  };

  const fs = await import("node:fs/promises");

  await fs.writeFile(
    "jp-zero-sets-diagnostic.json",
    JSON.stringify(output, null, 2),
    "utf-8"
  );

  console.log("💾 Rapport sauvegardé dans :");
  console.log("   jp-zero-sets-diagnostic.json");
  console.log();
}

main().catch((error) => {
  console.error();
  console.error("💥 ERREUR FATALE");
  console.error(error);
  process.exit(1);
});