# Routine de mise à jour des données

## Le plus simple : depuis le site
Plus › Catalogue (compte de Hugo seulement) :
1. **Vérifier (simulation)** : ne modifie rien. Le rapport se télécharge sur la page de l'exécution GitHub (section Artifacts).
2. **Appliquer** : écrit les nouvelles cartes, puis relance les calculs et les contrôles.
3. Ensuite, refaire l'import Pokiframe (Plus › Importer) pour reconnaître les nouvelles cartes.

Le travail tourne sur GitHub Actions (`.github/workflows/mise-a-jour.yml`), qui clone lui-même les dépôts de données.
Réglages : secrets GitHub `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` ; variables Vercel `GITHUB_TOKEN`, `GITHUB_REPO`, `KRIKROU_ADMIN_ID`, `CRON_SECRET`.
Le rôle `service_role` a un délai de 120 s par requête (`alter role service_role set statement_timeout = '120s'`) : sans ça, les contrôles sont coupés à 8 s.

## Depuis l'ordinateur (dépannage)
1. Une fois : cloner les dépôts de données à la racine du projet (ignorés par git) :
   - `git clone --depth 1 https://github.com/type-null/PTCG-database.git`
   - `git clone --depth 1 https://github.com/duanxr/PTCG-CHS-Datasets.git`
2. `.env.local` doit contenir `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
3. **Test à blanc** : `npm run update` — écrit `output/update-dry-run.json`.
4. **Application** : `npm run update:apply`.

Le script enchaîne : récupération des dépôts → TCGdex FR → TCGdex JP → PTCG-database (JP, KR, TC) → CHS (SC) → `run_post_import()` → contrôles.
Contrôles : tout doit être « OK » ou « INFO ». Si « A VOIR » (code de sortie 2), regarder le détail dans `output/update-apply.json`.

Étapes à la carte : `npm run update -- --steps=fr,post,controls` (étapes : fetch, fr, jp, ptcg, chs, post, controls).

## En cas de problème
- Rejouer seulement la chaîne SQL : `select * from run_post_import();` dans le SQL Editor (`run_post_import(true)` pour tout recalculer).
- Contrôles seuls : `select * from data_controls();`
- Contrôle 4 (espèce inconnue) : ajouter l'espèce à `pokemon_entities` en SQL, puis relancer `run_post_import()`.

## Limites connues
- Le rapprochement par empreinte d'image (étape 4b) n'est pas automatisé : les nouvelles cartes asiatiques sans correspondance restent autonomes (visibles, non rattachées à une famille).
- Les appels TCGdex dépendent du réseau ; en cas d'erreur 429/5xx, relancer (reprise automatique des cartes manquantes). Certains sets JP récents (M6a, MF) n'existent pas encore chez TCGdex : erreur 404 sans gravité, ils viennent de PTCG-database.
- Noms d'extensions : les nouvelles extensions apparaissent en nom généré (« Japon · 2026 · CODE ») jusqu'à ajout manuel de leur nom.
