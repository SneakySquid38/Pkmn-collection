async function main() {
  const setIds = ["B1a", "B2"];

  for (const setId of setIds) {
    console.log(`\n========== ${setId} ==========\n`);

    const url = `https://api.tcgdex.net/v2/fr/sets/${setId}`;

    const response = await fetch(url);

    console.log(`HTTP : ${response.status}`);

    if (!response.ok) {
      console.log(`Erreur pour ${setId}`);
      continue;
    }

    const data = await response.json();

    console.log(`Nom : ${data.name}`);
    console.log(`ID : ${data.id}`);
    console.log(
      `Nombre de cartes dans cards[] : ${data.cards?.length ?? 0}`
    );
    console.log(
      `Nombre officiel : ${data.cardCount?.official ?? "?"}`
    );
    console.log(
      `Nombre total : ${data.cardCount?.total ?? "?"}`
    );

    console.log("\nPremières cartes :");

    if (data.cards) {
      for (const card of data.cards.slice(0, 10)) {
        console.log(
          `${card.localId} - ${card.name} - ${card.id}`
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});