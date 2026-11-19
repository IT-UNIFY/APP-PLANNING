# Journal — APP-PLANNING

> Une entrée datée par jour où un travail substantiel a eu lieu, la plus
> récente EN HAUT. Ce fichier garde le **récit dans le temps** ;
> `HANDOFF.md` garde l'**état courant**.
>
> **Ancre par tâche — obligatoire.** Chaque bloc daté, jour ou sous-jalon
> `### N — …`, porte une ligne `**Tâches** :` juste après le titre, avec les
> UUID des tâches FixTracker entre backticks, séparés par des virgules. Une
> entrée méta (setup, décision transverse, ADR) déclare explicitement
> `**Tâches** : —` avec un tiret cadratin.
>
> Le parseur d'ingestion FixTracker lit cette ligne pour rattacher l'entrée à
> ses tâches et alimenter la vue « suivi de tâche ». Une entrée sans ancre
> reste visible dans le feed projet mais **absente de la vue tâche**.
>
> Invoquer le skill `journal-entry` pour scaffolder le squelette avec l'ancre
> déjà résolue depuis le contexte de session.

## 2026-11-19

### 1 — Instanciation du projet depuis APP-TEMPLATE
**Tâches** : —

- Squelette instancié depuis `APP-TEMPLATE` (cf. son ADR-001).
- Modules câblés : `outillage-agent`, `m365-auth` (liaison `refuser`), `edge-kit` (CORS sans motif).
- Socle vendorisé en `boilerplate-kit@0.3.0` (la 0.2.0 du squelette ne publie pas `src/`).
- Migrations : chemin unique `db-push.yml`, repris d'APP-FIX ; refs à renseigner.
- Maquette du lot 1 copiée dans `mockups/maquette-planning/`.
- Charte partagée créée à part : dépôt TEMPLATE-EPSS, paquet `@it-unify/ui-epss` (jetons des 14 modules). Portage de la coque confié à une session cloud (brief dans `docs/`).
- Bloque : projet Supabase non créé.
- Suite : projet Supabase, puis consommer `ui-epss` et l'écran « Mon planning ».
