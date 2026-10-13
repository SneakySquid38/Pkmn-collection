"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const abonner = (prevenir: () => void) => {
  window.addEventListener("online", prevenir);
  window.addEventListener("offline", prevenir);
  return () => {
    window.removeEventListener("online", prevenir);
    window.removeEventListener("offline", prevenir);
  };
};

// Installe le service worker (public/sw.js) qui garde une copie des pages pour le hors-ligne.
export function EnregistrementHorsLigne() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

// Chaque page affichée dans l'appli est signalée au service worker, qui en garde une copie pour le hors-ligne.
export function CopieHorsLigne() {
  const chemin = usePathname();
  const parametres = useSearchParams().toString();
  useEffect(() => {
    const p = new URLSearchParams(parametres);
    p.delete("carte"); // la fiche ouverte par-dessus ne change pas la page
    const q = p.toString();
    navigator.serviceWorker?.controller?.postMessage({ type: "garder", chemin: q ? `${chemin}?${q}` : chemin });
  }, [chemin, parametres]);
  return null;
}

// Bandeau affiché quand le téléphone n'a plus de réseau.
export function BandeauHorsLigne() {
  const enLigne = useSyncExternalStore(abonner, () => navigator.onLine, () => true);
  if (enLigne) return null;
  return (
    <p role="status" className="sticky top-0 z-30 -mx-4 mb-3 bg-encre px-4 py-2 text-center text-sm font-semibold text-fond lg:-mx-8">
      Pas de réseau : tu vois la dernière version enregistrée. Les modifications attendront le retour du réseau.
    </p>
  );
}

// Sur la page de connexion (donc après une déconnexion) : efface les pages gardées sur l'appareil.
export function OublierPages() {
  useEffect(() => {
    if ("caches" in window) caches.delete("krikrou-pages").catch(() => {});
  }, []);
  return null;
}
