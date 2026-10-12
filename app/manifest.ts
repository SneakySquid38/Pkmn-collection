import type { MetadataRoute } from "next";

// Rend le site installable sur l'écran d'accueil (PWA).
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
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
