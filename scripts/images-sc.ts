/**
 * IMAGES SC — ajoute les images des cartes en chinois simplifié depuis PTCG-CHS-Datasets
 *
 * Usage :
 *   npx tsx scripts/images-sc.ts                 simulation : rien n'est écrit ni envoyé
 *   npx tsx scripts/images-sc.ts --apply         écriture réelle
 *   options :
 *     --limit=50          ne traite que les N premières cartes (pour un essai)
 *     --concurrency=4     téléchargements en parallèle
 *
 * Rapprochement : nos cartes SC ont source_id = « SC-<set>-<id> », où <id> est l'identifiant de la
 * carte dans ptcg_chs_infos.json. Chaque carte du jeu de données donne son image « img/<n>/<k>.png ».
 *
 * Hébergement : les PNG d'origine font 300 × 419 px. Chacun est converti en WebP (même taille, environ
 * 25 Ko) et envoyé dans le bucket public Supabase « cartes-sc » (environ 330 Mo pour 13 000 cartes).
 * image_small et image_large pointent vers ce même fichier.
 *
 * Règles : seules les cartes encore sans image sont touchées ; image_source = 'ptcg-chs'.
 * Le script peut être relancé : il reprend là où il s'est arrêté.
 *
 * Rapports : output/images-sc-<dry-run|apply>.json
 *            output/images-sc-apercu.html  (3 cartes par set, à vérifier avant --apply)
 *
 * Prérequis pour --apply : SQL 14-images-sc.sql passé (COMMIT), et `npm i -D sharp` si sharp manque.
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const opt = (name: string): string | undefined =>
  ARGS.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const LIMIT = opt("limit") ? Number(opt("limit")) : Infinity;
const CONCURRENCY = Number(opt("concurrency") ?? 4);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Variables Supabase manquantes dans .env.local");
const supabase = createClient(supabaseUrl, serviceRoleKey);

const RAW = "https://raw.githubusercontent.com/duanxr/PTCG-CHS-Datasets/main";
const BUCKET = "cartes-sc";

const OUT_DIR = path.resolve(process.cwd(), "output");
const REPORT_FILE = path.join(OUT_DIR, `images-sc-${APPLY ? "apply" : "dry-run"}.json`);
const PREVIEW_FILE = path.join(OUT_DIR, "images-sc-apercu.html");

const log = (m: string) => console.log(m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hasNoImage = "image_small.is.null,image_small.eq.";

type Card = { id: string; source_id: string; number: string | null; name: string; set_code: string; set_name: string };
type Dataset = { collections: { id: number; cards: { id: number; image?: string }[] }[] };

async function fetchRetry(url: string, retries = 4): Promise<Response> {
  let last = "erreur inconnue";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      last = `${r.status} ${r.statusText}`;
      if (![429, 500, 502, 503, 504].includes(r.status)) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < retries) await sleep(2000 * 2 ** (attempt - 1));
  }
  throw new Error(`${url} : ${last}`);
}

async function loadDataset(): Promise<Map<number, string>> {
  log("Téléchargement de ptcg_chs_infos.json (environ 26 Mo)…");
  const data = (await (await fetchRetry(`${RAW}/ptcg_chs_infos.json`)).json()) as Dataset;
  const images = new Map<number, string>();
  for (const c of data.collections) {
    for (const k of c.cards) if (k.image && !images.has(k.id)) images.set(k.id, k.image);
  }
  log(`  ${images.size} cartes avec image dans le jeu de données`);
  return images;
}

async function loadMissing(): Promise<Card[]> {
  const sets = new Map<string, { code: string; name: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("sets").select("id, code, name").eq("language", "SC").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) sets.set(s.id as string, { code: s.code as string, name: s.name as string });
    if (!data || data.length < 1000) break;
  }
  const out: Card[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("cards").select("id, set_id, source_id, number, name")
      .eq("language", "SC").or(hasNoImage).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const s = sets.get(c.set_id as string);
      out.push({
        id: c.id as string, source_id: c.source_id as string, number: c.number as string | null,
        name: c.name as string, set_code: s?.code ?? "?", set_name: s?.name ?? "?",
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

const datasetId = (sourceId: string): number | null => {
  const m = /-(\d+)$/.exec(sourceId);
  return m ? Number(m[1]) : null;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);

function writePreview(list: { card: Card; large: string }[]) {
  const groups = new Map<string, { card: Card; large: string }[]>();
  for (const p of list) {
    const k = `${p.card.set_code} — ${p.card.set_name}`;
    const g = groups.get(k) ?? [];
    if (g.length < 3) groups.set(k, [...g, p]);
  }
  const sections = [...groups].map(([title, g]) => `
<h2>${esc(title)}</h2>
<div class="grille">${g.map((p) => `
  <figure><a href="${esc(p.large)}" target="_blank" rel="noreferrer"><img src="${esc(p.large)}" loading="lazy" referrerpolicy="no-referrer" alt=""></a>
  <figcaption>${esc(p.card.number ?? "?")} · ${esc(p.card.name)}</figcaption></figure>`).join("")}
</div>`).join("\n");
  fs.writeFileSync(PREVIEW_FILE, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Images SC proposées</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f6f6f6}h2{margin-top:28px;font-size:16px}
.grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
figure{margin:0;background:#fff;padding:6px;border-radius:8px}img{width:100%;aspect-ratio:63/88;object-fit:contain}
figcaption{font-size:12px;margin-top:4px}</style></head><body>
<h1>Images SC proposées : ${list.length} cartes (3 par set ci-dessous)</h1>
<p>Vérifie que l'image correspond au nom et au numéro de la carte.</p>
${sections}</body></html>`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log(APPLY ? "MODE ÉCRITURE (--apply)" : "SIMULATION : rien n'est écrit ni envoyé");

  const images = await loadDataset();
  const cards = await loadMissing();
  log(`${cards.length} cartes SC sans image en base`);

  const proposals: { card: Card; imagePath: string; large: string }[] = [];
  const unmatched: string[] = [];
  for (const card of cards) {
    const id = datasetId(card.source_id);
    const img = id === null ? undefined : images.get(id);
    if (!img) { unmatched.push(card.source_id); continue; }
    proposals.push({ card, imagePath: img, large: `${RAW}/${img}` });
  }
  log(`  ${proposals.length} rapprochées, ${unmatched.length} sans correspondance`);
  writePreview(proposals);
  log(`Aperçu : ${PREVIEW_FILE}`);

  const report: Record<string, unknown> = {
    date: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run",
    sans_image: cards.length, rapprochees: proposals.length, sans_correspondance: unmatched.slice(0, 50),
  };

  if (APPLY) {
    const { error: colErr } = await supabase.from("cards").select("image_source").limit(1);
    if (colErr) throw new Error("Colonne cards.image_source absente : lance d'abord 13-image-source.sql");
    const { error: bucketErr } = await supabase.storage.getBucket(BUCKET);
    if (bucketErr) throw new Error(`Bucket « ${BUCKET} » absent : lance d'abord 14-images-sc.sql (avec COMMIT)`);
    let sharp: typeof import("sharp");
    try {
      sharp = (await import("sharp")).default as unknown as typeof import("sharp");
    } catch {
      throw new Error("sharp n'est pas installé : lance `npm i -D sharp` puis relance");
    }

    const todo = proposals.slice(0, LIMIT);
    let written = 0, skipped = 0, done = 0;
    const errors: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const p = todo[next++];
        try {
          const png = Buffer.from(await (await fetchRetry(p.large)).arrayBuffer());
          const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
          const objectPath = `${p.card.set_code}/${datasetId(p.card.source_id)}.webp`;
          const up = await supabase.storage.from(BUCKET)
            .upload(objectPath, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
          if (up.error) throw new Error(up.error.message);
          const url = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
          const { data, error } = await supabase.from("cards")
            .update({ image_small: url, image_large: url, image_source: "ptcg-chs" })
            .eq("id", p.card.id).or(hasNoImage).select("id");
          if (error) throw new Error(error.message);
          if (data && data.length) written++; else skipped++;
        } catch (e) {
          errors.push(`${p.card.source_id} : ${e instanceof Error ? e.message : String(e)}`);
        }
        if (++done % 250 === 0) log(`  ${done}/${todo.length}…`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    log(`Écrites : ${written}, déjà remplies : ${skipped}, erreurs : ${errors.length}`);
    Object.assign(report, { ecrites: written, deja_remplies: skipped, erreurs: errors.slice(0, 50), nb_erreurs: errors.length });
    if (errors.length) log("Relance la même commande : seules les cartes encore sans image seront reprises.");
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  log(`Rapport : ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
