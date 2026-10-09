import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: ".env.local",
});

type MappingType =
  | "direct"
  | "combined"
  | "partial"
  | "official"
  | "manual";

type MappingDefinition = {
  jp: string;
  fr: string[];
  mapping_type: MappingType;
  confidence: number;
  note: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Variables Supabase manquantes. Vérifie .env.local"
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 *
 * DRY-RUN par défaut :
 *
 *   npm run import:set-mappings
 *
 * Pour appliquer réellement :
 *
 *   npm run import:set-mappings -- --apply
 *
 * ============================================================
 */

const APPLY = process.argv.includes("--apply");

/**
 * ============================================================
 * MAPPINGS JP -> FR
 * ============================================================
 *
 * Important :
 *
 * - Un mapping peut avoir plusieurs cibles FR.
 * - Un mapping peut être "partial".
 * - Un set absent du catalogue JP ou FR est ignoré.
 * - Les mappings ignorés restent présents ici afin de pouvoir
 *   être appliqués automatiquement lorsqu'un set manquant sera
 *   ajouté ultérieurement.
 *
 * ============================================================
 */

const mappings: MappingDefinition[] = [

  // ==========================================================
  // CLASSIC / ORIGINAL
  // ==========================================================

  {
    jp: "PMCG1",
    fr: ["base1"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese Expansion Pack corresponds to Base Set.",
  },
  {
    jp: "PMCG2",
    fr: ["base2"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese Jungle corresponds to Jungle.",
  },
  {
    jp: "PMCG3",
    fr: ["base3"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese Fossil corresponds to Fossil.",
  },
  {
    jp: "PMCG4",
    fr: ["base5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese Rocket Gang corresponds to Team Rocket.",
  },
  {
    jp: "PMCG5",
    fr: ["base6"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese Leaders' Stadium corresponds to Gym Heroes.",
  },
  {
    jp: "PMCG6",
    fr: ["base7"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese Challenge from Darkness corresponds to Gym Challenge.",
  },
  {
    jp: "VS1",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Pokemon Card VS has no standalone FR equivalent in the current catalogue.",
  },
  {
    jp: "web1",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Pokemon Card web has no standalone FR equivalent in the current catalogue.",
  },

  // ==========================================================
  // NEO
  // ==========================================================

  {
    jp: "neo1",
    fr: ["neo1"],
    mapping_type: "direct",
    confidence: 1,
    note: "Neo Genesis.",
  },
  {
    jp: "neo2",
    fr: ["neo2"],
    mapping_type: "direct",
    confidence: 1,
    note: "Neo Discovery.",
  },
  {
    jp: "neo3",
    fr: ["neo3"],
    mapping_type: "direct",
    confidence: 1,
    note: "Neo Revelation.",
  },
  {
    jp: "neo4",
    fr: ["neo4"],
    mapping_type: "direct",
    confidence: 1,
    note: "Neo Destiny.",
  },

  // ==========================================================
  // E-CARD
  // ==========================================================

  {
    jp: "E1",
    fr: ["ecard1"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese E1 corresponds to Expedition.",
  },
  {
    jp: "E2",
    fr: ["ecard2"],
    mapping_type: "combined",
    confidence: 0.98,
    note: "E2 contributes to the international Aquapolis release.",
  },
  {
    jp: "E3",
    fr: ["ecard2"],
    mapping_type: "combined",
    confidence: 0.98,
    note: "E3 contributes to the international Aquapolis release.",
  },
  {
    jp: "E4",
    fr: ["ecard3"],
    mapping_type: "combined",
    confidence: 0.98,
    note: "E4 contributes to the international Skyridge release.",
  },
  {
    jp: "E5",
    fr: ["ecard3"],
    mapping_type: "combined",
    confidence: 0.98,
    note: "E5 contributes to the international Skyridge release.",
  },

  // ==========================================================
  // ADV
  // ==========================================================

  {
    jp: "ADV1",
    fr: ["ex1"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Ruby & Sapphire.",
  },
  {
    jp: "ADV2",
    fr: ["ex2"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Sandstorm.",
  },
  {
    jp: "ADV3",
    fr: ["ex3"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Dragon.",
  },
  {
    jp: "ADV4",
    fr: ["ex4"],
    mapping_type: "direct",
    confidence: 1,
    note: "Magma VS Aqua / EX Team Magma vs Team Aqua.",
  },
  {
    jp: "ADV5",
    fr: ["ex5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Undone Seal / EX Hidden Legends.",
  },

  // ==========================================================
  // PCG / EX
  // ==========================================================

  {
    jp: "PCG1",
    fr: ["ex6"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX FireRed & LeafGreen.",
  },
  {
    jp: "PCG2",
    fr: ["ex8"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Deoxys.",
  },
  {
    jp: "PCG3",
    fr: ["ex7"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Team Rocket Returns.",
  },
  {
    jp: "PCG4",
    fr: ["ex10"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Unseen Forces.",
  },
  {
    jp: "PCG5",
    fr: ["ex11"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Legend Maker.",
  },
  {
    jp: "PCG6",
    fr: ["ex12"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Delta Species.",
  },
  {
    jp: "PCG7",
    fr: ["ex13"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Holon Phantoms.",
  },
  {
    jp: "PCG8",
    fr: ["ex14"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Crystal Guardians.",
  },
  {
    jp: "PCG9",
    fr: ["ex15"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Dragon Frontiers.",
  },
  {
    jp: "PCG10",
    fr: ["ex16"],
    mapping_type: "direct",
    confidence: 1,
    note: "EX Power Keepers.",
  },

  // ==========================================================
  // DIAMOND / PEARL / PLATINUM
  // ==========================================================

  {
    jp: "DP1",
    fr: ["dp1"],
    mapping_type: "direct",
    confidence: 1,
    note: "Diamond & Pearl.",
  },
  {
    jp: "DP2",
    fr: ["dp2"],
    mapping_type: "direct",
    confidence: 1,
    note: "Mysterious Treasures.",
  },
  {
    jp: "DP3",
    fr: ["dp3"],
    mapping_type: "direct",
    confidence: 1,
    note: "Secret Wonders.",
  },
  {
    jp: "DP4",
    fr: ["dp4", "dp5"],
    mapping_type: "combined",
    confidence: 0.98,
    note: "Japanese DP4 content is split across Great Encounters and Majestic Dawn.",
  },
  {
    jp: "DP5",
    fr: ["dp6"],
    mapping_type: "direct",
    confidence: 1,
    note: "Stormfront.",
  },
  {
    jp: "DP6",
    fr: ["dp7"],
    mapping_type: "direct",
    confidence: 1,
    note: "Legends Awakened.",
  },
  {
    jp: "DPt1",
    fr: ["pl1"],
    mapping_type: "direct",
    confidence: 1,
    note: "Platinum.",
  },
  {
    jp: "DPt2",
    fr: ["pl2"],
    mapping_type: "direct",
    confidence: 1,
    note: "Rising Rivals.",
  },
  {
    jp: "DPt3",
    fr: ["pl3"],
    mapping_type: "direct",
    confidence: 1,
    note: "Supreme Victors.",
  },
  {
    jp: "DPt4",
    fr: ["pl4"],
    mapping_type: "direct",
    confidence: 1,
    note: "Arceus.",
  },

  // ==========================================================
  // LEGEND
  // ==========================================================

  {
    jp: "L1a",
    fr: ["hgss1"],
    mapping_type: "combined",
    confidence: 1,
    note: "HeartGold Collection contributes to HeartGold & SoulSilver.",
  },
  {
    jp: "L1b",
    fr: ["hgss1"],
    mapping_type: "combined",
    confidence: 1,
    note: "SoulSilver Collection contributes to HeartGold & SoulSilver.",
  },
  {
    jp: "L2",
    fr: ["hgss2"],
    mapping_type: "direct",
    confidence: 1,
    note: "HS Undaunted.",
  },
  {
    jp: "L3",
    fr: ["hgss4"],
    mapping_type: "combined",
    confidence: 0.98,
    note: "Clash at the Summit contributes to HS Triumphant.",
  },
  {
    jp: "LL",
    fr: ["hgss4", "col1"],
    mapping_type: "combined",
    confidence: 0.95,
    note: "Lost Link content is distributed across HS Triumphant and Call of Legends.",
  },

  // ==========================================================
  // XY
  // ==========================================================

  {
    jp: "XY1a",
    fr: ["xy1"],
    mapping_type: "combined",
    confidence: 1,
    note: "Collection X contributes to XY.",
  },
  {
    jp: "XY1b",
    fr: ["xy1"],
    mapping_type: "combined",
    confidence: 1,
    note: "Collection Y contributes to XY.",
  },
  {
    jp: "XY2",
    fr: ["xy2"],
    mapping_type: "direct",
    confidence: 1,
    note: "Wild Blaze / Flashfire.",
  },
  {
    jp: "XY3",
    fr: ["xy3"],
    mapping_type: "direct",
    confidence: 1,
    note: "Rising Fist / Furious Fists.",
  },
  {
    jp: "XY4",
    fr: ["xy4"],
    mapping_type: "direct",
    confidence: 1,
    note: "Phantom Gate / Phantom Forces.",
  },
  {
    jp: "XY5a",
    fr: ["xy5"],
    mapping_type: "combined",
    confidence: 1,
    note: "Gaia Volcano contributes to Primal Clash.",
  },
  {
    jp: "XY5b",
    fr: ["xy5"],
    mapping_type: "combined",
    confidence: 1,
    note: "Tidal Storm contributes to Primal Clash.",
  },
  {
    jp: "CP1",
    fr: ["dc1"],
    mapping_type: "direct",
    confidence: 1,
    note: "Double Crisis.",
  },
  {
    jp: "XY6",
    fr: ["xy6"],
    mapping_type: "direct",
    confidence: 1,
    note: "Emerald Break / Roaring Skies.",
  },
  {
    jp: "XY7",
    fr: ["xy7"],
    mapping_type: "direct",
    confidence: 1,
    note: "Bandit Ring / Ancient Origins.",
  },
  {
    jp: "CP2",
    fr: ["xy8"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Legendary Holo Collection content contributes to BREAKthrough.",
  },
  {
    jp: "XY8a",
    fr: ["xy8"],
    mapping_type: "combined",
    confidence: 1,
    note: "Blue Shock contributes to BREAKthrough.",
  },
  {
    jp: "XY8b",
    fr: ["xy8"],
    mapping_type: "combined",
    confidence: 1,
    note: "Red Flash contributes to BREAKthrough.",
  },
  {
    jp: "XY9",
    fr: ["xy9"],
    mapping_type: "direct",
    confidence: 1,
    note: "Rage of the Broken Sky / BREAKpoint.",
  },
  {
    jp: "CP3",
    fr: ["g1"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Pokekyun Collection contributes to Generations.",
  },
  {
    jp: "XY10",
    fr: ["xy10"],
    mapping_type: "direct",
    confidence: 1,
    note: "Awakened Heroes / Fates Collide.",
  },
  {
    jp: "CP4",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Premium Champion Pack has no single standalone FR equivalent.",
  },
  {
    jp: "XY11a",
    fr: ["xy11"],
    mapping_type: "combined",
    confidence: 1,
    note: "Heat-Burst Fighter contributes to Steam Siege.",
  },
  {
    jp: "XY11b",
    fr: ["xy11"],
    mapping_type: "combined",
    confidence: 1,
    note: "Cruel Traitor contributes to Steam Siege.",
  },
  {
    jp: "CP5",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "No single standalone FR equivalent.",
  },
  {
    jp: "CP6",
    fr: ["xy12"],
    mapping_type: "direct",
    confidence: 1,
    note: "20th Anniversary corresponds to Evolutions.",
  },

  // ==========================================================
  // SUN & MOON
  // ==========================================================

  {
    jp: "SM0",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Promotional Japanese product without standalone FR set.",
  },
  {
    jp: "SM1S",
    fr: ["sm1"],
    mapping_type: "combined",
    confidence: 1,
    note: "Collection Sun contributes to Sun & Moon.",
  },
  {
    jp: "SM1M",
    fr: ["sm1"],
    mapping_type: "combined",
    confidence: 1,
    note: "Collection Moon contributes to Sun & Moon.",
  },
  {
    jp: "SM1+",
    fr: ["sm2"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Enhancement product contributing to Guardians Rising.",
  },
  {
    jp: "SM2K",
    fr: ["sm2"],
    mapping_type: "combined",
    confidence: 1,
    note: "Island Awaiting You contributes to Guardians Rising.",
  },
  {
    jp: "SM2L",
    fr: ["sm2"],
    mapping_type: "combined",
    confidence: 1,
    note: "Alolan Moonlight contributes to Guardians Rising.",
  },
  {
    jp: "sm2+",
    fr: ["sm3"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Beyond a New Challenge contributes to Burning Shadows.",
  },
  {
    jp: "SM3H",
    fr: ["sm3"],
    mapping_type: "combined",
    confidence: 1,
    note: "Burning Shadows Japanese counterpart.",
  },
  {
    jp: "SM3N",
    fr: ["sm3"],
    mapping_type: "combined",
    confidence: 1,
    note: "Burning Shadows Japanese counterpart.",
  },
  {
    jp: "SM3+",
    fr: ["sm3.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Shining Legends.",
  },
  {
    jp: "SM4S",
    fr: ["sm4"],
    mapping_type: "combined",
    confidence: 1,
    note: "Crimson Invasion Japanese counterpart.",
  },
  {
    jp: "SM4A",
    fr: ["sm4"],
    mapping_type: "combined",
    confidence: 1,
    note: "Crimson Invasion Japanese counterpart.",
  },
  {
    jp: "SM4+",
    fr: ["sm5"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "GX Battle Boost contributes to Ultra Prism.",
  },
  {
    jp: "SM5S",
    fr: ["sm5"],
    mapping_type: "combined",
    confidence: 1,
    note: "Ultra Sun contributes to Ultra Prism.",
  },
  {
    jp: "SM5M",
    fr: ["sm5"],
    mapping_type: "combined",
    confidence: 1,
    note: "Ultra Moon contributes to Ultra Prism.",
  },
  {
    jp: "SM5+",
    fr: ["sm6"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Ultra Force contributes to Forbidden Light.",
  },
  {
    jp: "SM6",
    fr: ["sm6"],
    mapping_type: "direct",
    confidence: 1,
    note: "Forbidden Light.",
  },
  {
    jp: "SM6a",
    fr: ["sm7.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Dragon Majesty.",
  },
  {
    jp: "SM6b",
    fr: ["sm7"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Champion Road contributes to Celestial Storm.",
  },
  {
    jp: "SM7",
    fr: ["sm7"],
    mapping_type: "direct",
    confidence: 1,
    note: "Celestial Storm.",
  },
  {
    jp: "SM7a",
    fr: ["sm8"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Thunderclap Spark contributes to Lost Thunder.",
  },
  {
    jp: "SM7b",
    fr: ["sm8"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Fairy Rise contributes to Lost Thunder.",
  },
  {
    jp: "SM8",
    fr: ["sm8"],
    mapping_type: "direct",
    confidence: 1,
    note: "Lost Thunder.",
  },
  {
    jp: "SM8a",
    fr: ["sm8"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Dark Order contributes to Lost Thunder.",
  },
  {
    jp: "SM8b",
    fr: ["sm11.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "GX Ultra Shiny corresponds to Hidden Fates Shiny Vault.",
  },
  {
    jp: "SM9",
    fr: ["sm9"],
    mapping_type: "direct",
    confidence: 1,
    note: "Tag Bolt / Team Up.",
  },
  {
    jp: "SM9a",
    fr: ["sm9", "sm10"],
    mapping_type: "combined",
    confidence: 0.95,
    note: "Night Unison cards are distributed between Team Up and Unbroken Bonds.",
  },
  {
    jp: "SM9b",
    fr: ["sm10"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Full Metal Wall contributes to Unbroken Bonds.",
  },
  {
    jp: "SM10",
    fr: ["sm10"],
    mapping_type: "direct",
    confidence: 1,
    note: "Double Blaze / Unbroken Bonds.",
  },
  {
    jp: "SM10a",
    fr: ["sm11"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "GG End contributes to Unified Minds.",
  },
  {
    jp: "SM10b",
    fr: ["sm11"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Sky Legend contributes to Unified Minds.",
  },
  {
    jp: "SM11",
    fr: ["sm11"],
    mapping_type: "direct",
    confidence: 1,
    note: "Miracle Twin / Unified Minds.",
  },
  {
    jp: "SM11a",
    fr: ["sm12"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Remix Bout contributes to Cosmic Eclipse.",
  },
  {
    jp: "SM11b",
    fr: ["sm12"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Dream League contributes to Cosmic Eclipse.",
  },
  {
    jp: "SM12",
    fr: ["sm12"],
    mapping_type: "direct",
    confidence: 1,
    note: "Alter Genesis / Cosmic Eclipse.",
  },
  {
    jp: "SM12a",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "No standalone FR equivalent.",
  },
  {
    jp: "SMP2",
    fr: ["det1"],
    mapping_type: "direct",
    confidence: 0.95,
    note: "Detective Pikachu related product.",
  },
  {
    jp: "SM1p",
    fr: ["sm2"],
    mapping_type: "partial",
    confidence: 0.85,
    note: "Promotional/enhancement content associated with Guardians Rising.",
  },
  {
    jp: "SM2p",
    fr: ["sm3"],
    mapping_type: "partial",
    confidence: 0.85,
    note: "Promotional/enhancement content associated with Burning Shadows.",
  },
  {
    jp: "SM3p",
    fr: ["sm3.5"],
    mapping_type: "direct",
    confidence: 0.95,
    note: "Promotional Shining Legends content.",
  },
  {
    jp: "SM4p",
    fr: ["sm5"],
    mapping_type: "partial",
    confidence: 0.85,
    note: "Promotional/enhancement content associated with Ultra Prism.",
  },
  {
    jp: "SM5p",
    fr: ["sm6"],
    mapping_type: "partial",
    confidence: 0.85,
    note: "Promotional/enhancement content associated with Forbidden Light.",
  },

  // ==========================================================
  // SWORD & SHIELD
  // ==========================================================

  {
    jp: "S1W",
    fr: ["swsh1"],
    mapping_type: "combined",
    confidence: 1,
    note: "Sword contributes to Sword & Shield.",
  },
  {
    jp: "S1H",
    fr: ["swsh1"],
    mapping_type: "combined",
    confidence: 1,
    note: "Shield contributes to Sword & Shield.",
  },
  {
    jp: "S1a",
    fr: ["swsh2"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "VMAX Rising contributes to Rebel Clash.",
  },
  {
    jp: "S2",
    fr: ["swsh2"],
    mapping_type: "direct",
    confidence: 1,
    note: "Rebel Clash.",
  },
  {
    jp: "S2a",
    fr: ["swsh3"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Explosive Walker contributes to Darkness Ablaze.",
  },
  {
    jp: "S3",
    fr: ["swsh3"],
    mapping_type: "direct",
    confidence: 1,
    note: "Darkness Ablaze.",
  },
  {
    jp: "S3a",
    fr: ["swsh4"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Legendary Heartbeat contributes to Vivid Voltage.",
  },
  {
    jp: "S4",
    fr: ["swsh4"],
    mapping_type: "direct",
    confidence: 1,
    note: "Vivid Voltage.",
  },
  {
    jp: "S4a",
    fr: ["swsh4.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Shiny Star V / Shining Fates.",
  },
  {
    jp: "S5I",
    fr: ["swsh5"],
    mapping_type: "combined",
    confidence: 1,
    note: "Single Strike contributes to Battle Styles.",
  },
  {
    jp: "S5R",
    fr: ["swsh5"],
    mapping_type: "combined",
    confidence: 1,
    note: "Rapid Strike contributes to Battle Styles.",
  },
  {
    jp: "S5a",
    fr: ["swsh6"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Matchless Fighters contributes to Chilling Reign.",
  },
  {
    jp: "S6H",
    fr: ["swsh6"],
    mapping_type: "combined",
    confidence: 1,
    note: "Silver Lance contributes to Chilling Reign.",
  },
  {
    jp: "S6K",
    fr: ["swsh6"],
    mapping_type: "combined",
    confidence: 1,
    note: "Jet Black Spirit contributes to Chilling Reign.",
  },
  {
    jp: "S6a",
    fr: ["swsh8", "swsh7"],
    mapping_type: "combined",
    confidence: 0.95,
    note: "Eevee Heroes contributes to both Evolving Skies and Fusion Strike.",
  },
  {
    jp: "S7D",
    fr: ["swsh7"],
    mapping_type: "combined",
    confidence: 1,
    note: "Skyscraping Perfect contributes to Evolving Skies.",
  },
  {
    jp: "S7R",
    fr: ["swsh7"],
    mapping_type: "combined",
    confidence: 1,
    note: "Blue Sky Stream contributes to Evolving Skies.",
  },
  {
    jp: "S8",
    fr: ["swsh8"],
    mapping_type: "direct",
    confidence: 1,
    note: "Fusion Strike.",
  },
  {
    jp: "S8a",
    fr: ["cel25"],
    mapping_type: "direct",
    confidence: 1,
    note: "25th Anniversary Collection / Celebrations.",
  },
  {
    jp: "S8b",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "VMAX Climax contains cards distributed across multiple international Trainer Gallery products.",
  },
  {
    jp: "S9",
    fr: ["swsh9"],
    mapping_type: "direct",
    confidence: 1,
    note: "Brilliant Stars.",
  },
  {
    jp: "S9a",
    fr: ["swsh10", "swsh11"],
    mapping_type: "combined",
    confidence: 0.95,
    note: "Battle Region contributes to Astral Radiance and Lost Origin.",
  },
  {
    jp: "S10D",
    fr: ["swsh10"],
    mapping_type: "combined",
    confidence: 1,
    note: "Time Gazer contributes to Astral Radiance.",
  },
  {
    jp: "S10P",
    fr: ["swsh10"],
    mapping_type: "combined",
    confidence: 1,
    note: "Space Juggler contributes to Astral Radiance.",
  },
  {
    jp: "S10a",
    fr: ["swsh11"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Dark Phantasma contributes to Lost Origin.",
  },
  {
    jp: "S10b",
    fr: ["swsh11"],
    mapping_type: "direct",
    confidence: 1,
    note: "Lost Abyss / Lost Origin.",
  },
  {
    jp: "S11",
    fr: ["swsh11"],
    mapping_type: "direct",
    confidence: 1,
    note: "Paradigm Trigger / Silver Tempest.",
  },
  {
    jp: "S11a",
    fr: ["swsh12"],
    mapping_type: "partial",
    confidence: 0.95,
    note: "Incandescent Arcana contributes to Silver Tempest.",
  },
  {
    jp: "S12",
    fr: ["swsh12"],
    mapping_type: "direct",
    confidence: 1,
    note: "Silver Tempest.",
  },

  // IMPORTANT:
  // S12a = VSTAR Universe -> Crown Zenith / Zénith Suprême.
  {
    jp: "S12a",
    fr: ["swsh12.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "VSTAR Universe corresponds to Crown Zenith / Zénith Suprême.",
  },

  // ==========================================================
  // SCARLET & VIOLET
  // ==========================================================

  {
    jp: "SV1S",
    fr: ["sv01"],
    mapping_type: "combined",
    confidence: 1,
    note: "Scarlet contributes to Scarlet & Violet.",
  },
  {
    jp: "SV1V",
    fr: ["sv01"],
    mapping_type: "combined",
    confidence: 1,
    note: "Violet contributes to Scarlet & Violet.",
  },
  {
    jp: "SV1a",
    fr: ["sv02"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Triplet Beat contributes to Paldea Evolved.",
  },
  {
    jp: "SV2D",
    fr: ["sv02"],
    mapping_type: "combined",
    confidence: 1,
    note: "Clay Burst contributes to Paldea Evolved.",
  },
  {
    jp: "SV2P",
    fr: ["sv02"],
    mapping_type: "combined",
    confidence: 1,
    note: "Snow Hazard contributes to Paldea Evolved.",
  },
  {
    jp: "SV2a",
    fr: ["sv03.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Pokemon Card 151.",
  },
  {
    jp: "SV3",
    fr: ["sv03"],
    mapping_type: "direct",
    confidence: 1,
    note: "Ruler of the Black Flame / Obsidian Flames.",
  },
  {
    jp: "SV3a",
    fr: ["sv04"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Raging Surf contributes to Paradox Rift.",
  },
  {
    jp: "SV4K",
    fr: ["sv04"],
    mapping_type: "combined",
    confidence: 1,
    note: "Ancient Roar contributes to Paradox Rift.",
  },
  {
    jp: "SV4M",
    fr: ["sv04"],
    mapping_type: "combined",
    confidence: 1,
    note: "Future Flash contributes to Paradox Rift.",
  },
  {
    jp: "SV4a",
    fr: ["sv04.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Shiny Treasure ex / Paldean Fates.",
  },
  {
    jp: "SV5K",
    fr: ["sv05"],
    mapping_type: "combined",
    confidence: 1,
    note: "Wild Force contributes to Temporal Forces.",
  },
  {
    jp: "SV5M",
    fr: ["sv05"],
    mapping_type: "combined",
    confidence: 1,
    note: "Cyber Judge contributes to Temporal Forces.",
  },
  {
    jp: "SV5a",
    fr: ["sv06"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Crimson Haze contributes to Twilight Masquerade.",
  },
  {
    jp: "SV6",
    fr: ["sv06"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Mask of Change contributes to Twilight Masquerade.",
  },
  {
    jp: "SV6a",
    fr: ["sv06.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Night Wanderer / Shrouded Fable.",
  },
  {
    jp: "SV7",
    fr: ["sv07"],
    mapping_type: "direct",
    confidence: 1,
    note: "Stellar Miracle / Stellar Crown.",
  },
  {
    jp: "SV7a",
    fr: ["sv08"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Paradise Dragona contributes to Surging Sparks.",
  },
  {
    jp: "SV8",
    fr: ["sv08"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Super Electric Breaker contributes to Surging Sparks.",
  },
  {
    jp: "SV8a",
    fr: ["sv08.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Terastal Fest ex / Prismatic Evolutions.",
  },
  {
    jp: "SV9",
    fr: ["sv09"],
    mapping_type: "direct",
    confidence: 1,
    note: "Journey Together.",
  },
  {
    jp: "SV9a",
    fr: ["sv10"],
    mapping_type: "partial",
    confidence: 0.9,
    note: "Heat Wave Arena contributes to Destined Rivals.",
  },
  {
    jp: "SV10",
    fr: ["sv10"],
    mapping_type: "direct",
    confidence: 1,
    note: "Destined Rivals.",
  },
  {
    jp: "SV11B",
    fr: ["sv10.5b"],
    mapping_type: "direct",
    confidence: 1,
    note: "Black Bolt.",
  },
  {
    jp: "SV11W",
    fr: ["sv10.5w"],
    mapping_type: "direct",
    confidence: 1,
    note: "White Flare.",
  },
  {
    jp: "SV-P",
    fr: ["svp"],
    mapping_type: "direct",
    confidence: 1,
    note: "Japanese SV promotional cards.",
  },
  {
    jp: "SVK",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Starter/product cards without standalone FR set.",
  },
  {
    jp: "SVLS",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Starter/product cards without standalone FR set.",
  },
  {
    jp: "SVLN",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Starter/product cards without standalone FR set.",
  },

  // ==========================================================
  // MEGA EVOLUTION
  // ==========================================================

  {
    jp: "M1L",
    fr: ["me01"],
    mapping_type: "combined",
    confidence: 1,
    note: "Mega Brave contributes to Mega Evolution.",
  },
  {
    jp: "M1S",
    fr: ["me01"],
    mapping_type: "combined",
    confidence: 1,
    note: "Mega Symphonia contributes to Mega Evolution.",
  },
  {
    jp: "M2",
    fr: ["me02"],
    mapping_type: "direct",
    confidence: 1,
    note: "Phantasmal Flames.",
  },
  {
    jp: "M2a",
    fr: ["me02.5"],
    mapping_type: "direct",
    confidence: 1,
    note: "Ascended Heroes.",
  },
  {
    jp: "M3",
    fr: ["me03"],
    mapping_type: "direct",
    confidence: 1,
    note: "Perfect Order.",
  },
  {
    jp: "M4",
    fr: ["me04"],
    mapping_type: "direct",
    confidence: 1,
    note: "Chaos Rising.",
  },
  {
    jp: "M5",
    fr: ["me05"],
    mapping_type: "direct",
    confidence: 1,
    note: "Pitch Black.",
  },
  {
    jp: "M6",
    fr: ["me06"],
    mapping_type: "direct",
    confidence: 1,
    note: "Delta Reign.",
  },
  {
    jp: "M6a",
    fr: ["30th", "30th-c"],
    mapping_type: "combined",
    confidence: 1,
    note: "30th Anniversary Collection.",
  },
  {
    jp: "MF",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Mega product without standalone FR set.",
  },
  {
    jp: "MC",
    fr: [],
    mapping_type: "manual",
    confidence: 0,
    note: "Mega product without standalone FR set.",
  },
  {
    jp: "M-P",
    fr: ["mep"],
    mapping_type: "direct",
    confidence: 1,
    note: "Mega Evolution promotional cards.",
  },
];

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeCode(code: string) {
  return code.trim().toLowerCase();
}

async function fetchAllSets() {
  const { data, error } = await supabase
    .from("sets")
    .select(
      "id, source, source_id, name, code, language, region, product_type"
    );

  if (error) {
    throw new Error(
      `Erreur récupération sets : ${error.message}`
    );
  }

  return data ?? [];
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log("");
  console.log("==============================================");
  console.log(" IMPORT SET MAPPINGS JP -> FR");
  console.log("==============================================");
  console.log("");

  console.log(
    APPLY
      ? "MODE : APPLY — les mappings seront écrits en base."
      : "MODE : DRY-RUN — aucune modification en base."
  );

  console.log("");

  const sets = await fetchAllSets();

  const jpSets = sets.filter(
    (set) =>
      String(set.language ?? "").toLowerCase() === "jp" ||
      String(set.region ?? "").toLowerCase() === "jp" ||
      String(set.source ?? "").toLowerCase().includes("jp")
  );

  const frSets = sets.filter(
    (set) =>
      String(set.language ?? "").toLowerCase() === "fr" ||
      String(set.region ?? "").toLowerCase() === "fr" ||
      String(set.source ?? "").toLowerCase().includes("fr")
  );

  console.log(`Sets JP en base : ${jpSets.length}`);
  console.log(`Sets FR en base : ${frSets.length}`);
  console.log(`Mappings définis : ${mappings.length}`);
  console.log("");

  const jpByCode = new Map<string, any>();
  const frByCode = new Map<string, any>();

  for (const set of jpSets) {
    if (!set.code) continue;

    jpByCode.set(
      normalizeCode(set.code),
      set
    );
  }

  for (const set of frSets) {
    if (!set.code) continue;

    frByCode.set(
      normalizeCode(set.code),
      set
    );
  }

  /**
   * ==========================================================
   * VALIDATION
   * ==========================================================
   */

  const validRows: any[] = [];

  const skippedMissingJp: MappingDefinition[] = [];
  const skippedMissingFr: {
    mapping: MappingDefinition;
    frCode: string;
  }[] = [];

  const noTargetMappings: MappingDefinition[] = [];

  for (const mapping of mappings) {
    const jpCode = normalizeCode(mapping.jp);

    const jpSet = jpByCode.get(jpCode);

    /**
     * Aucun équivalent FR autonome.
     */
    if (mapping.fr.length === 0) {
      noTargetMappings.push(mapping);

      console.log(
        `⚪ ${mapping.jp} -> aucun équivalent FR autonome`
      );

      continue;
    }

    /**
     * Set JP absent de la base.
     *
     * On SKIP mais on ne considère PAS cela comme une erreur.
     */
    if (!jpSet) {
      skippedMissingJp.push(mapping);

      console.log(
        `⏭️ ${mapping.jp} -> JP absent de la base, SKIP`
      );

      continue;
    }

    /**
     * Une définition peut avoir plusieurs cibles FR.
     */
    for (const frCodeRaw of mapping.fr) {
      const frCode = normalizeCode(frCodeRaw);

      const frSet = frByCode.get(frCode);

      /**
       * Set FR absent du catalogue.
       *
       * On SKIP.
       */
      if (!frSet) {
        skippedMissingFr.push({
          mapping,
          frCode: frCodeRaw,
        });

        console.log(
          `⏭️ ${mapping.jp} -> ${frCodeRaw} | FR absent de la base, SKIP`
        );

        continue;
      }

      validRows.push({
        source_set_id: jpSet.id,
        target_set_id: frSet.id,
        mapping_type: mapping.mapping_type,
        confidence: mapping.confidence,
        status: "verified",
        evidence: {
          source: "manual_verified_mapping",
          jp_code: jpSet.code,
          jp_name: jpSet.name,
          fr_code: frSet.code,
          fr_name: frSet.name,
          note: mapping.note,
        },
      });

      const arrow =
        mapping.mapping_type === "direct"
          ? "→"
          : mapping.mapping_type === "combined"
            ? "⇢"
            : "↝";

      console.log(
        `${arrow} ${jpSet.code} -> ${frSet.code} ` +
        `(${mapping.mapping_type}, ${mapping.confidence})`
      );
    }
  }

  /**
   * ==========================================================
   * SETS JP NON DÉFINIS
   * ==========================================================
   */

  const mappedJpCodes = new Set(
    mappings.map((mapping) =>
      normalizeCode(mapping.jp)
    )
  );

  const unmappedJpSets = jpSets
    .filter((set) => set.code)
    .filter(
      (set) =>
        !mappedJpCodes.has(
          normalizeCode(set.code)
        )
    )
    .sort((a, b) =>
      String(a.code).localeCompare(
        String(b.code)
      )
    );

  /**
   * ==========================================================
   * RÉSUMÉ
   * ==========================================================
   */

  console.log("");
  console.log("==============================================");
  console.log(" RÉSUMÉ");
  console.log("==============================================");
  console.log("");

  console.log(
    `Mappings définis       : ${mappings.length}`
  );

  console.log(
    `Relations applicables  : ${validRows.length}`
  );

  console.log(
    `Mappings sans cible FR : ${noTargetMappings.length}`
  );

  console.log(
    `JP absents / SKIP      : ${skippedMissingJp.length}`
  );

  console.log(
    `FR absents / SKIP      : ${skippedMissingFr.length}`
  );

  console.log(
    `Sets JP non définis    : ${unmappedJpSets.length}`
  );

  /**
   * ==========================================================
   * DÉTAIL DES SKIP JP
   * ==========================================================
   */

  if (skippedMissingJp.length > 0) {
    console.log("");
    console.log("⚠️ SETS JP ABSENTS — SKIP");

    for (const mapping of skippedMissingJp) {
      console.log(
        `  - ${mapping.jp} -> ${mapping.fr.join(", ")}`
      );
    }
  }

  /**
   * ==========================================================
   * DÉTAIL DES SKIP FR
   * ==========================================================
   */

  if (skippedMissingFr.length > 0) {
    console.log("");
    console.log("⚠️ CIBLES FR ABSENTES — SKIP");

    for (const item of skippedMissingFr) {
      console.log(
        `  - ${item.mapping.jp} -> ${item.frCode}`
      );
    }
  }

  /**
   * ==========================================================
   * SETS JP NON DÉFINIS
   * ==========================================================
   */

  if (unmappedJpSets.length > 0) {
    console.log("");
    console.log("⚠️ SETS JP SANS MAPPING");

    for (const set of unmappedJpSets) {
      console.log(
        `  - ${set.code} | ${set.name}`
      );
    }
  }

  /**
   * ==========================================================
   * DRY-RUN
   * ==========================================================
   */

  if (!APPLY) {
    console.log("");
    console.log("==============================================");
    console.log(" DRY-RUN TERMINÉ");
    console.log("==============================================");
    console.log("");

    console.log(
      "Aucune modification n'a été effectuée dans Supabase."
    );

    console.log("");

    console.log(
      "Si le résultat est correct, applique avec :"
    );

    console.log("");

    console.log(
      "  npm run import:set-mappings -- --apply"
    );

    console.log("");

    return;
  }

  /**
   * ==========================================================
   * APPLY
   * ==========================================================
   */

  if (validRows.length === 0) {
    console.log("");
    console.log(
      "⚠️ Aucun mapping applicable. Rien à écrire."
    );
    return;
  }

  console.log("");
  console.log("==============================================");
  console.log(" APPLICATION DES MAPPINGS");
  console.log("==============================================");
  console.log("");

  const { data, error } = await supabase
    .from("set_mappings")
    .upsert(validRows, {
      onConflict:
        "source_set_id,target_set_id",
    })
    .select();

  if (error) {
    throw new Error(
      `Erreur insertion set_mappings : ${error.message}`
    );
  }

  console.log(
    `✅ ${data?.length ?? validRows.length} relations enregistrées.`
  );

  console.log("");
  console.log("==============================================");
  console.log(" TERMINÉ");
  console.log("==============================================");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("❌ ERREUR FATALE");
  console.error("");
  console.error(error);
  process.exit(1);
});