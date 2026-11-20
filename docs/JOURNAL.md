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

### Charte : rôles sombres du Planning et `ui-epss` 0.1.0 (file du lot 1, tâche 1)
**Tâches** : —

- Premier tour de la boucle autonome (`AGENTS.md` §11).
- TEMPLATE-EPSS#3 : rôles sombres du module Planning, dérivés de la framboise, **provisoires** (`docs/QUESTIONS.md` Q5) ; test AA du thème sombre ; version 0.1.0, étiquette `v0.1.0`.
- `vendor/ui-epss/` resynchronisé sur `v0.1.0` ; vérifié dans le navigateur en sombre.
- Suite : tâche 2, RPC d'import `importer_seances`.

### Schéma du lot 1 (ADR-002)
**Tâches** : —

- Plan du modèle par `lead-dev` ; l'utilisateur valide le modèle des affectations, les statuts du carnet (avec la valeur brute d'Aurion), la lecture par GDC via une Edge Function (`lecteur_gdc` sans connexion) et la répétition sur base jetable.
- `database-engineer` : 8 migrations (socle M365 et audit, rôles, référentiels, imports, interventions et affectations, historique par trigger en ajout seul, `api_v1` + `lecteur_gdc`, assertions de droits) et des tests pgTAP ; vérifiés sur un Postgres 16 local, rejeu compris, avec des sabotages détectés.
- `backend-dev` : répétition dans `db-push.yml` (`supabase db start` + `supabase test db`) avant tout dry-run ou apply.
- ADR-002 écrit ; ADR-001 corrigé (droits par colonne de `lecteur_gdc`, affectations validées).
- Revue `code-reviewer` : aucun bloquant ; corrections faites (droits positifs de `service_role` vérifiés, test « pas superutilisateur », `updated_at` non antidatable, date de retrait protégée). 110 tests.
- Migrations renommées du 23/11 au 20/11 : une migration créée avant le 23 se serait placée avant des migrations appliquées.
- Répétition sur le runner depuis la branche (run `44719340434`) : Postgres 17.12 du projet, 8 migrations, 110 tests pgTAP verts, dry-run vert.
- PR #4 mergée : l'apply s'arrête après la 7e migration. L'assertion « anon n'exécute rien » repère `public.rls_auto_enable()`, fonction de Supabase (déclencheur `ensure_rls`) absente de l'image de répétition. Elle renvoie `event_trigger` : pas appelable.
- PR #5 : l'assertion ignore les fonctions de déclencheur ; version jouée en lecture seule sur la base réelle avant le push ; répétition verte ; apply de la 8e migration vert.
- Contrôle MCP en lecture seule : 8 migrations, 15 tables en RLS, 8 vues `api_v1`, conseils de sécurité tous attendus.
- Suite : Edge Function d'import Aurion (une seule RPC qui pose `planning.import_id`), puis écran « Interventions ».

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
