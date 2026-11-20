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

## 2026-11-20

### Schéma du lot 1 (ADR-002)
**Tâches** : —

- Plan du modèle par `lead-dev` ; l'utilisateur valide le modèle des affectations, les statuts du carnet (avec la valeur brute d'Aurion), la lecture par GDC via une Edge Function (`lecteur_gdc` sans connexion) et la répétition sur base jetable.
- `database-engineer` : 8 migrations (socle M365 et audit, rôles, référentiels, imports, interventions et affectations, historique par trigger en ajout seul, `api_v1` + `lecteur_gdc`, assertions de droits) et des tests pgTAP ; vérifiés sur un Postgres 16 local, rejeu compris, avec des sabotages détectés.
- `backend-dev` : répétition dans `db-push.yml` (`supabase db start` + `supabase test db`) avant tout dry-run ou apply.
- ADR-002 écrit ; ADR-001 corrigé (droits par colonne de `lecteur_gdc`, affectations validées).
- Suite : répétition sur le runner depuis la branche, revue, puis merge (= apply en prod).

### Charte ERP EPSS branchée dans le Planning
**Tâches** : —

- TEMPLATE-EPSS#1 (coque et composants, écrite par la session cloud) déjà mergée ; `verify` relancé sur sa branche : 156 tests verts.
- Décision : `ui-epss` est **vendorisé** (comme le socle), pas installé depuis GitHub Packages : aucun jeton au build ni dans l'image Docker.
- `scripts/vendorer-ui-epss.mjs` : synchronisation depuis un clone de TEMPLATE-EPSS (`git archive` + build), contrôle hors ligne des empreintes dans `verify`.
- Coque montée avec `data-module="planning"`, menu du lot 1 (Interventions, Paramètres), menu des paramètres, pages-enveloppes ; 5 tests de rendu.
- Bloque : rien. Dette : rôles sombres du module Planning, étiquette `v0.1.0`, connexion et rôles.
- Suite : contenu de l'écran « Interventions » (calendrier et liste), qui demande d'abord le modèle de données (ADR-001, affectations à valider).

## 2026-11-19

### 1 — Instanciation du projet depuis APP-TEMPLATE
**Tâches** : —

- Squelette instancié depuis `APP-TEMPLATE` (cf. son ADR-001).
- Modules câblés : `outillage-agent`, `m365-auth` (liaison `refuser`), `edge-kit` (CORS sans motif).
- Socle vendorisé en `boilerplate-kit@0.3.0` (la 0.2.0 du squelette ne publie pas `src/`).
- Migrations : chemin unique `db-push.yml`, repris d'APP-FIX ; refs à renseigner.
- Maquette du lot 1 copiée dans `mockups/maquette-planning/`.
- Charte partagée créée à part : dépôt TEMPLATE-EPSS, paquet `@it-unify/ui-epss` (jetons des 14 modules). Portage de la coque confié à une session cloud (brief dans `docs/`).
- ADR-001 (proposé), relu contre le carnet de conception : un projet Supabase par module, contrat de lecture `api_v1`, clés `aurion_individu_id` et UUID d'affectation, pas de copie chez le lecteur (historique daté côté Planning), « Mon planning » en paquet React monté dans GDC, un seul import Aurion.
- Projet Supabase `yvuutsniduqqinkowqkc` créé (projet unique du lot 1) ; ref reportée, `config.toml` ajouté, secret `SUPABASE_DB_PASSWORD` posé.
- Secret `SUPABASE_ACCESS_TOKEN` posé, jeton vérifié par l'API Supabase. Le workflow de migration se prouve après le merge (GitHub ne lance à la main qu'un workflow présent sur `main`).
- PR #1 mergée. `db-push.yml` prouvé : run `plan` vert et run `push` vert, « Remote database is up to date ».
- Coque `ui-epss` livrée par la session cloud : TEMPLATE-EPSS#1, à relire.
- Handoff pour la session GDC : `docs/handoffs/2026-11-19-session-gdc-template-epss.md`.
- Suite : relire TEMPLATE-EPSS#1, publier 0.1.0, consommer `ui-epss`, puis l'écran « Mon planning ».
