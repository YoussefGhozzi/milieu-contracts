# milieu-contracts

Contrat partagé de MILIEU (submodule `packages/contracts` du dépôt `milieu`).

- `src/schemas.ts` : schémas Zod (studio, salles, disciplines, coachs, séances, packs, portefeuille, réservations, notifications).
- `src/mocks/milieu.ts` : données simulées du studio MILIEU pour la démo, générées par rapport à la date du jour et validées par les schémas.

Le backend implémentera exactement ces schémas ; tant qu'il n'existe pas, l'app tourne sur les données simulées.

## Publication (paquet npm versionné)

Le paquet est publié sur **GitHub Packages** sous le nom `@youssefghozzi/milieu-contracts` (GitHub impose le nom du propriétaire), en JavaScript compilé avec ses types (`dist/`).

```bash
npm version minor          # 0.2.0 → 0.3.0 : commit + tag v0.3.0
git push --follow-tags     # la CI « Publication » publie la version
```

Pour l'utiliser dans un autre dépôt (l'API, les apps) en gardant `import … from '@milieu/contracts'` :

```bash
# .npmrc du dépôt qui l'utilise
@youssefghozzi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

```json
"dependencies": { "@milieu/contracts": "npm:@youssefghozzi/milieu-contracts@^0.2.0" }
```

`NPM_TOKEN` : jeton GitHub avec le droit `read:packages` (dans les CI : le `GITHUB_TOKEN` du dépôt, après avoir autorisé ce dépôt dans les réglages du paquet).
