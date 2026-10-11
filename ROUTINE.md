# Routine de mise à jour des données

## Une fois (installation)
1. Cloner à côté du projet (ou dans le projet, ils sont ignorés par git) :
   - `git clone https://github.com/<auteur>/PTCG-database`
   - `git clone https://github.com/<auteur>/PTCG-CHS-Datasets`
2. `.env.local` doit contenir `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
3. Avoir exécuté la migration `etape10_chaine_maj` dans le SQL Editor (fonctions `run_post_import`, `data_controls`).

## À chaque nouvelle extension
1. **Test à blanc** : `npm run update` — ne modifie rien, écrit `output/update-dry-run.json`.
2. Lire le rapport (sets et cartes à ajouter, par source).
3. **Application** : `npm run update:apply`.
4. Le script enchaîne : récupération des dépôts → TCGdex FR → TCGdex JP → PTCG-database (JP, KR, TC) → CHS (SC) → `run_post_import()` → contrôles.
5. Contrôles : tout doit être « OK ». Si « A VOIR » (code de sortie 2), regarder le détail dans `output/update-apply.json`.

Étapes à la carte : `npm run update -- --steps=fr,post,controls` (étapes : fetch, fr, jp, ptcg, chs, post, controls).

## En cas de problème
- Rejouer seulement la chaîne SQL : `select * from run_post_import();` dans le SQL Editor (`run_post_import(true)` pour tout recalculer).
- Contrôles seuls : `select * from data_controls();`
- Contrôle 4 (espèce inconnue) : ajouter l'espèce à `pokemon_entities` en SQL, puis relancer `run_post_import()`.

## Limites connues
- Le rapprochement par empreinte d'image (étape 4b) n'est pas automatisé : les nouvelles cartes asiatiques sans correspondance restent autonomes (visibles, non rattachées à une famille).
- Les appels TCGdex dépendent du réseau ; en cas d'erreur 429/5xx, relancer (reprise automatique des cartes manquantes).
- Noms d'extensions : les nouvelles extensions apparaissent en nom généré (« Japon · 2026 · CODE ») jusqu'à ajout manuel de leur nom.
