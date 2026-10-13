import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { cookies } from "next/headers";
import { EnregistrementHorsLigne } from "@/components/HorsLigne";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "800"],
});

export const metadata: Metadata = {
  title: "Krikrou collection",
  description: "Nos cartes Pokémon FR, JP, KR et CN",
  appleWebApp: { capable: true, title: "Krikrou", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1410" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Thème choisi dans « Plus » (clair, sombre) ; sans choix, on suit le téléphone.
  const theme = (await cookies()).get("theme")?.value;
  const dataTheme = theme === "clair" || theme === "sombre" ? theme : undefined;

  return (
    <html
      lang="fr"
      data-theme={dataTheme}
      className={`${figtree.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <EnregistrementHorsLigne />
      </body>
    </html>
  );
}
