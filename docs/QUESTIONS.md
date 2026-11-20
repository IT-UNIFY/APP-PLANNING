# Questions ouvertes — APP-PLANNING

> File des questions fonctionnelles que l'agent n'a pas pu trancher seul
> (`AGENTS.md` §11). Pour chacune : sa recommandation, le choix **provisoire**
> retenu pour avancer, et ce qu'il coûte de changer d'avis. L'utilisateur
> tranche par lots ; une question tranchée passe en bas, avec la réponse et la
> date, et le code ou l'ADR marqué « provisoire » est mis à jour.

## Ouvertes

| # | Date | Question | Recommandation | Choix provisoire | Coût d'un changement | Où |
| --- | --- | --- | --- | --- | --- | --- |
| Q5 | 2026-11-20 | Couleurs du module Planning en thème sombre : la maquette n'a pas de thème sombre. | Faire valider par la personne qui tient la charte ERP (maquette « Palette des modules ») | Dérivées de la framboise : action `#B0194A`, survol `#A3123F`, accent `#E0708A`, fond clair `#3A1621`, foncée `#F4A3B5` ; AA vérifié par test (blanc sur action 6,8:1, foncée sur fond clair 8,2:1) | Faible : une valeur dans `tokens/sombre.json` de TEMPLATE-EPSS, puis resynchronisation | TEMPLATE-EPSS `tokens/sombre.json` |

## Tranchées

| # | Date | Question | Réponse | Par |
| --- | --- | --- | --- | --- |
| Q1 | 2026-11-20 | Modèle des affectations (carnet « à valider ») | Validé | utilisateur |
| Q2 | 2026-11-20 | Statuts et rôles d'une affectation | Statuts du carnet + brut Aurion, rôle facultatif | utilisateur |
| Q3 | 2026-11-20 | Lecture de `api_v1` par GDC | Edge Function du Planning, `lecteur_gdc` sans connexion | utilisateur |
| Q4 | 2026-11-20 | Répétition sur base jetable | Oui | utilisateur |
