import type { MetadataRoute } from "next";

// Rend le site installable sur l'écran d'accueil (PWA). Icônes : kit mascotte Krikrou.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Krikrou collection",
    short_name: "Krikrou",
    description: "Nos cartes Pokémon FR, JP, KR et CN",
    lang: "fr",
    start_url: "/collection",
    display: "standalone",
    background_color: "#fbf6f0",
    theme_color: "#d9712b",
    icons: [
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icone-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
