const sets = ["SM3+", "S4a", "ADV2", "S4"];

const API = "https://api.tcgdex.net/v2/ja/sets";

async function main() {
  for (const setId of sets) {
    console.log("\n================================");
    console.log(`SET : ${setId}`);
    console.log("================================");

    const response = await fetch(
      `${API}/${encodeURIComponent(setId)}`
    );

    console.log("HTTP :", response.status);

    if (!response.ok) {
      console.log("Erreur :", response.statusText);
      continue;
    }

    const data = await response.json();

    console.log("Nom :", data.name);
    console.log("Nombre de cartes :", data.cards?.length ?? 0);

    if (data.cards?.length) {
      console.log(
        "Premières cartes :",
        data.cards.slice(0, 5)
      );
    }
  }
}

main().catch(console.error);