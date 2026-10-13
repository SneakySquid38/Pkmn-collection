import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rafraîchit la session Supabase à chaque requête et renvoie vers /connexion
// toute personne non connectée. L'inscription est fermée : les comptes sont créés
// depuis le tableau de bord Supabase.
const PAGES_PUBLIQUES = ["/confidentialite", "/mentions-legales", "/hors-ligne"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const connecte = Boolean(data?.claims);
  const chemin = request.nextUrl.pathname;
  const surConnexion = chemin.startsWith("/connexion");
  // Pages légales lisibles par tous, connecté ou non.
  if (PAGES_PUBLIQUES.includes(chemin)) return response;
  // Réveil quotidien de la base (Vercel Cron) : protégé par son propre secret.
  if (chemin === "/api/reveil") return response;

  if (!connecte && !surConnexion) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    return NextResponse.redirect(url);
  }
  if (connecte && surConnexion) {
    const url = request.nextUrl.clone();
    url.pathname = "/collection";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Tout sauf les fichiers statiques, les icônes et le manifeste de l'application.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
