// Krikrou collection · service worker : l'appli reste consultable sans réseau.
// - Fichiers du site (_next/static, icônes, mascotte) : gardés une fois chargés.
// - Pages : toujours demandées au serveur ; une copie est gardée, servie si le réseau manque
//   (ou ne répond pas en 4 s). Sans copie : page « Hors ligne ».
// - Images des cartes : gardées une fois vues (200 au plus).
// - Pages ouvertes dans l'appli (sans rechargement) : copie demandée par components/HorsLigne.tsx.
// Les modifications (ajout, envies, classeurs) demandent toujours le réseau.
// Les pages gardées sont effacées à la déconnexion (components/HorsLigne.tsx, sur la page de connexion).

const STATIQUE = "krikrou-statique-v2";
const PAGES = "krikrou-pages";
const IMAGES = "krikrou-images";
const HORS_LIGNE = "/hors-ligne";
const A_L_AVANCE = ["/collection", "/envies", "/classeurs", "/binders"];
const DELAI = 4000;

// Une page gardée à l'avance n'a jamais été affichée : on garde aussi ses fichiers JS et CSS,
// sans quoi elle ne pourrait pas s'afficher hors ligne.
async function garderFichiers(reponse) {
  const html = await reponse.clone().text();
  const fichiers = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  const cache = await caches.open(STATIQUE);
  await Promise.all(fichiers.map((f) => cache.match(f).then((deja) => deja || cache.add(f)).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIQUE);
      await cache.addAll(["/mascotte/aucun-resultat.webp", "/mascotte/aucun-resultat-sombre.webp", "/icons/icone-192.png"]);
      const r = await fetch(HORS_LIGNE);
      await cache.put(HORS_LIGNE, r.clone());
      await garderFichiers(r);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n.startsWith("krikrou-statique-") && n !== STATIQUE).map((n) => caches.delete(n)));
      await self.clients.claim();
      // Pages principales gardées dès l'installation (seulement si on est connecté).
      const pages = await caches.open(PAGES);
      await Promise.all(
        A_L_AVANCE.map(async (chemin) => {
          try {
            const r = await fetch(chemin, { credentials: "same-origin" });
            if (r.ok && !r.redirected) {
              await pages.put(chemin, r.clone());
              await garderFichiers(r);
            }
          } catch {
            // pas de réseau : tant pis, la page sera gardée à la première visite
          }
        }),
      );
    })(),
  );
});

// Garde au plus `max` entrées dans un cache (les plus anciennes partent).
async function limiter(nom, max) {
  const cache = await caches.open(nom);
  const cles = await cache.keys();
  for (let i = 0; i < cles.length - max; i++) await cache.delete(cles[i]);
}

async function page(requete) {
  const cache = await caches.open(PAGES);
  const reseau = fetch(requete).then(async (r) => {
    // Une page redirigée vers /connexion veut dire « déconnecté » : on ne garde rien.
    if (r.ok && !r.redirected) await cache.put(requete, r.clone());
    return r;
  });
  reseau.catch(() => {});
  const copie = async () => (await cache.match(requete, { ignoreVary: true })) || (await cache.match(requete, { ignoreSearch: true, ignoreVary: true }));
  const attente = new Promise((resoudre) => setTimeout(resoudre, DELAI));
  try {
    const premiere = await Promise.race([reseau, attente.then(copie)]);
    if (premiere) return premiere;
    return await reseau;
  } catch {
    const garde = await copie();
    if (garde) return garde;
    // Page jamais ouverte : on renvoie vers « Hors ligne » (servie à sa propre adresse, sinon Next la refuse).
    const horsLigne = await caches.match(HORS_LIGNE, { ignoreVary: true });
    if (new URL(requete.url).pathname === HORS_LIGNE) return horsLigne || Response.error();
    return horsLigne ? Response.redirect(HORS_LIGNE, 302) : Response.error();
  }
}

async function garde(nom, requete, max) {
  const deja = await caches.match(requete);
  if (deja) return deja;
  const r = await fetch(requete);
  if (r.ok || r.type === "opaque") {
    const cache = await caches.open(nom);
    await cache.put(requete, r.clone()).catch(() => {});
    if (max) limiter(nom, max);
  }
  return r;
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  const ici = url.origin === self.location.origin;

  if (ici && requete.mode === "navigate") {
    if (url.pathname.startsWith("/api") || url.pathname.startsWith("/mes-donnees") || url.pathname.startsWith("/connexion")) return;
    event.respondWith(page(requete));
    return;
  }
  if (ici && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/mascotte/"))) {
    event.respondWith(garde(STATIQUE, requete, 400));
    return;
  }
  if (!ici && requete.destination === "image") {
    event.respondWith(garde(IMAGES, requete, 200).catch(() => Response.error()));
  }
  // Le reste (données des pages Next, Supabase) passe directement par le réseau.
});

// Les changements de page dans l'appli ne rechargent pas la page entière : l'appli signale chaque page
// affichée, et on en garde une copie complète (au plus une fois toutes les 5 minutes par page).
const dernieresCopies = new Map();
self.addEventListener("message", (event) => {
  const { type, chemin } = event.data ?? {};
  if (type !== "garder" || typeof chemin !== "string" || !chemin.startsWith("/") || chemin.startsWith("//")) return;
  if (Date.now() - (dernieresCopies.get(chemin) ?? 0) < 5 * 60 * 1000) return;
  dernieresCopies.set(chemin, Date.now());
  event.waitUntil(
    (async () => {
      try {
        const r = await fetch(chemin, { credentials: "same-origin" });
        if (!r.ok || r.redirected) return;
        await (await caches.open(PAGES)).put(chemin, r.clone());
        await garderFichiers(r);
        await limiter(PAGES, 150);
      } catch {
        // hors ligne : rien à garder
      }
    })(),
  );
});
