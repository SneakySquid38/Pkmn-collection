// Lecture d'un export JSON de Pokiframe (dans le navigateur, avant tout envoi).
// Structure : { name, currency, cardCount, cards: [{ id, quantity, name, setName, setCode, number, language, price, ... }] }

export const LIMITE_LIGNES = 3000;

export type LignePokiframe = {
  i: number;
  external_id: string; // identifiant Pokiframe de la ligne, sert à ne pas importer deux fois
  nom: string; // nom donné par Pokiframe (anglais pour les cartes asiatiques)
  set: string | null;
  code: string | null;
  numero: string | null;
  langue: string; // FRENCH, JAPANESE, KOREAN, CHINESE…
  quantite: number;
  prix: number | null; // en euros
};

const texte = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function lireExport(contenu: string): { nom: string; lignes: LignePokiframe[] } {
  let json: unknown;
  try {
    json = JSON.parse(contenu);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON lisible.");
  }
  const cartes = (json as { cards?: unknown })?.cards;
  if (!Array.isArray(cartes)) throw new Error("Ce fichier ne ressemble pas à un export Pokiframe (pas de liste « cards »).");
  if (cartes.length > LIMITE_LIGNES) throw new Error(`Le fichier contient ${cartes.length} lignes : la limite est de ${LIMITE_LIGNES}.`);

  const lignes: LignePokiframe[] = [];
  cartes.forEach((c: Record<string, unknown>, i) => {
    const id = texte(c?.id, 100);
    if (!id) return;
    const quantite = Number(c.quantity);
    const prix = Number(c.price);
    lignes.push({
      i,
      external_id: id,
      nom: texte(c.name) ?? "Carte sans nom",
      set: texte(c.setName),
      code: texte(c.setCode, 40),
      numero: texte(c.number, 20),
      langue: texte(c.language, 20)?.toUpperCase() ?? "",
      quantite: Number.isInteger(quantite) && quantite > 0 ? Math.min(quantite, 999) : 1,
      prix: Number.isFinite(prix) && prix >= 0 ? Math.round(prix * 100) / 100 : null,
    });
  });
  return { nom: texte((json as { name?: unknown }).name) ?? "Export Pokiframe", lignes };
}

export const LANGUES_POKIFRAME: Record<string, string> = {
  FRENCH: "FR",
  JAPANESE: "JP",
  KOREAN: "KR",
  CHINESE: "CN",
  ENGLISH: "EN",
};
