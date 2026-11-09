# milieu-contracts

Contrat partagé de MILIEU (submodule `packages/contracts` du dépôt `milieu`).

- `src/schemas.ts` : schémas Zod (studio, salles, disciplines, coachs, séances, packs, portefeuille, réservations, notifications).
- `src/mocks/milieu.ts` : données simulées du studio MILIEU pour la démo, générées par rapport à la date du jour et validées par les schémas.

Le backend implémentera exactement ces schémas ; tant qu'il n'existe pas, l'app tourne sur les données simulées.
