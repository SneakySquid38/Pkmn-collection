# Krikrou collection

Catalogue et collection de cartes Pokémon (FR, JP, KR, chinois) pour Hugo et Louise.
Site : https://www.krikroucollection.fr — Next.js 16 sur Vercel, base Supabase.

## Lancer le site en local

```bash
npm install
npm run dev
```

`.env.local` (jamais dans git) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
et pour les scripts de mise à jour seulement `SUPABASE_SERVICE_ROLE_KEY`.

## Organisation

| Dossier | Contenu |
|---|---|
| `app/`, `components/`, `lib/`, `proxy.ts` | le site |
| `public/` | icônes de l'application et mascotte |
| `scripts/` | mise à jour du catalogue : `update.ts` (chef d'orchestre), `import-ptcg-database-languages-v7.ts` (JP, KR, TC), `import-chs.ts` (chinois simplifié) ; `prototype-mapping-fr-jp.ts` (essai de rapprochement FR ↔ JP, lecture seule) |
| `supabase/migrations/` | historique des scripts SQL appliqués à la base, dans l'ordre des dates |
| `supabase/tests/` | tests à blanc (rollback), à lancer dans le SQL Editor |
| `.github/workflows/mise-a-jour.yml` | mise à jour du catalogue sur GitHub Actions |
| `vercel.json` | région Paris et réveil quotidien de la base (`/api/reveil`) |

## Mise à jour du catalogue

Voir [ROUTINE.md](ROUTINE.md).
