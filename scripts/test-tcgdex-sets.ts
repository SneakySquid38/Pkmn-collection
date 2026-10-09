const TCGDEX_API = "https://api.tcgdex.net/v2";
const LANGUAGE = "ja";

const SET_IDS = ["SM3+", "S4a", "ADV2", "S4"];

async function main() {
  console.log("==============================================");
  console.log(" TEST DIRECT TCGDEX — SETS JP");
  console.log("==============================================\n");

  for (const setId of SET_IDS) {
    const url = `${TCGDEX_API}/${LANGUAGE}/sets/${encodeURIComponent(setId)}`;

    console.log(`\n----------------------------------------------`);
    console.log(`SET : ${setId}`);
    console.log(`URL : ${url}`);

    try {
      const response = await fetch(url);

      console.log(`HTTP : ${response.status}`);

      if (!response.ok) {
        console.log(`❌ Erreur HTTP : ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      console.log(`ID TCGdex : ${data.id}`);
      console.log(`Nom       : ${data.name}`);
      console.log(`Cartes    : ${(data.cards ?? []).length}`);

      if (data.cards?.length > 0) {
        console.log("\nPremières cartes :");

        for (const card of data.cards.slice(0, 5)) {
          console.log(
            `  - ${card.id} | localId=${card.localId} | ${card.name}`
          );
        }
      } else {
        console.log("⚠️ TCGdex ne fournit aucune carte pour ce set.");
      }
    } catch (error) {
      console.log(
        `❌ Erreur : ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log("\n==============================================");
  console.log(" TEST TERMINÉ");
  console.log("==============================================");
}

main();