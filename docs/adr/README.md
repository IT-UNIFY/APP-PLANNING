# ADR — APP-PLANNING

Décisions d'architecture **propres à ce projet**. Une décision qui porte sur
plusieurs applications du parc va dans le `docs/adr/` du dépôt `APP-TEMPLATE`,
pas ici — et ce projet la référence.

| ADR | Titre | Statut |
| --- | --- | --- |
| [ADR-001](ADR-001-donnees-planning-et-modules-erp.md) | Données du Planning : une base propre, une API de lecture pour les autres modules | proposé |
| [ADR-002](ADR-002-schema-lot1-historique-api-v1.md) | Schéma du lot 1 : historique par trigger, `api_v1`, `lecteur_gdc` | accepté |

## Convention

- Nommage : `ADR-00N-<slug-en-kebab-case>.md`.
- Structure : contexte **mesuré**, problème nommé, décisions numérotées
  `D1…Dn`, conséquences (positives / négatives / points d'attention),
  alternatives écartées, périmètre exclu, références.
- **Un chiffre dans un ADR est une mesure, pas une estimation.** Si la mesure
  n'a pas été faite, écrire « non mesuré » et dire quand elle le sera.
- Une décision écartée reste dans l'ADR, marquée comme telle, avec son motif.
  Une décision effacée revient six mois plus tard sous forme de question déjà
  posée.
