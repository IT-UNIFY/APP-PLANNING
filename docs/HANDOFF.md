# HANDOFF — APP-PLANNING

> Ce document doit permettre à une session neuve de reprendre le projet **avec
> zéro contexte préalable**. À lire EN ENTIER avant d'agir. À mettre à jour
> avant de clore un jalon — c'est un des quatre livrables de la Definition of
> Done, avec `JOURNAL.md`, `TIMELOG.md` et `BACKLOG.md`.

## 1. Le projet en un paragraphe

Outil Planning de l'ERP EPSS — lot 1 : consultation des séances importées d'Aurion.

Spécifications et règles d'engagement : `AGENTS.md` à la racine, plus les ADR
sous `docs/adr/`.

## 2. Pièges d'environnement

- **Migrations** : uniquement par `gh workflow run db-push.yml` (AGENTS.md §4).
  Le port DB s'ouvre depuis le runner : pas de partage de connexion. Tout
  autre accès direct à la base depuis le poste (port 5432 / 6543) est bloqué
  sur le réseau normal.
- **Projet Supabase** : `yvuutsniduqqinkowqkc`, projet unique du lot 1. Il n'y
  a pas de préprod séparée : `prod` et `preprod` du workflow visent le même ref.
- **Socle vendorisé** : `supabase/functions/_shared/socle/` vient de
  `@it-unify/boilerplate-kit@0.3.0`. Le squelette annonçait `0.2.0`, mais cette
  version ne publie pas `src/` et ne peut pas être vendorisée. La copie a été
  faite depuis l'étiquette `boilerplate-kit@0.3.0` d'APP-TEMPLATE (npm pack
  local), car le jeton `gh` n'avait pas `read:packages`.
- **Secrets hors bande** : voir `docs/PREREQUIS-*.md` et `docs/BACKLOG.md`.
- **Maquette** : copie locale dans `mockups/maquette-planning/` (source en
  ligne : https://claude.ai/artifact/Mo76MtNVbCFSe3gouryR37).

⚠️ **Porte de vérification.** Ce dépôt n'a pas de CI GitHub. La vérification
est locale, via `.githooks/pre-push`. Elle s'active automatiquement au
`npm install` (script `prepare`) ; après un `npm ci --ignore-scripts`, la
lancer à la main :

```
git config core.hooksPath .githooks
```

## 3. Pile technique

- **Front** : React 19 + Vite + TypeScript + Tailwind CSS 4 (config CSS-first,
  pas de `tailwind.config.js`).
- **Routage** : `react-router-dom`. URL partageables — ne pas régresser vers un
  state machine.
- **Backend** : Supabase (Postgres + Auth + Storage + Edge Functions Deno).
- **Client Supabase** : un seul, `src/lib/supabase.ts`.

Projet Supabase : `yvuutsniduqqinkowqkc` (eu-west-1, Postgres 17, créé le 2026-11-19). URL et
clé publique dans le `.env` gitignoré ; mot de passe DB dans le `.env` et en
secret GitHub Actions.

Comptes de test : identifiants dans le `.env` gitignoré. **Jamais dans ce
document.**

## 4. État des modules

| Module | État | État de vérification |
| --- | --- | --- |
| Socle (amorce) | 🚧 | squelette instancié ; `npm run verify` vert (lint, typecheck, socle, tests, Deno, build) ; jamais lancé contre un Supabase réel |
| Modules socle : outillage-agent, m365-auth, edge-kit | 🚧 | câblés ; prérequis hors bande non posés (`docs/BACKLOG.md`) |
| Charte ERP EPSS (`@it-unify/ui-epss`) | ✅ | vendorisée depuis l'étiquette `v0.1.0` (TEMPLATE-EPSS `3debc0d`) ; coque montée, menu du lot 1, 3 pages-enveloppes ; 5 tests de rendu ; vue dans le navigateur en clair (1440 et 375 px) et en sombre (rôles sombres du Planning, provisoires : Q5) |
| Écrans du lot 1 | ⬜ | maquette seule (`mockups/maquette-planning/`) |

<!-- ✅ livré · 🚧 en cours · ⬜ non démarré.
     La colonne « état de vérification » dit ce qui a été testé PAR QUEL MOYEN,
     et surtout ce qui n'est PAS encore vérifié en conditions réelles. -->

## 5. Migrations appliquées · fonctions déployées · secrets attendus

- Migrations appliquées : **9**. Les 8 du schéma du lot 1 (`20261120090000`
  à `20261120090700`, ADR-002), puis la RPC d'import `importer_seances`
  (`20261120120000`, ADR-002 D8, PR #9, run `44734727296`), le 2026-11-20.
  Contrôle MCP de la RPC : invoker, `search_path` vide, `execute` pour
  `service_role` seulement. Runs `44720952788` (1 à 7 ; la
  8e arrêtée sur `rls_auto_enable()`, fonction de Supabase) puis
  `44722665259` (8e, après correction, PR #5). Contrôle MCP en lecture
  seule : `list_migrations` = 8 ; 15 tables, toutes en RLS ; 8 vues
  `api_v1` ; `get_advisors(security)` ne signale que l'attendu
  (`m365_tenants` sans politique : aucun accès client ; `m365_tenant_for_email`
  ouverte à `anon` : écran de connexion ; `a_role` pour `authenticated` :
  RLS) et `rls_auto_enable()`, fonction de Supabase non appelable.
- Fonctions déployées : aucune.
- Secrets attendus : GitHub Actions `SUPABASE_ACCESS_TOKEN` et
  `SUPABASE_DB_PASSWORD` (✅ posés tous les deux) ; Edge Functions
  `ALLOWED_ORIGINS` (edge-kit, sans motif de sous-domaine) et ceux de
  `docs/PREREQUIS-m365-auth.md`.

## 6. Dettes et décisions en attente

- Charte partagée : `@it-unify/ui-epss` (TEMPLATE-EPSS, son ADR-001). La coque
  React n'est pas encore portée ; brief de la session :
  `docs/brief-session-cloud-coque.md`.
- APP-PLANNING est en Tailwind 4, GDC en Tailwind 3 : `ui-epss` doit servir les
  deux (ajouté au brief).
- Données : un projet Supabase propre au Planning, lu par GDC via un schéma
  `api_v1` en lecture seule, sans copie chez le lecteur ; « Mon planning »
  fourni par le Planning en paquet React monté dans GDC (ADR-001, **proposé** :
  coût et modèle des affectations à valider). Source qui fait foi sur le
  fonctionnel : le carnet de conception,
  https://claude.ai/artifact/MHDtYossAju15FJ6q1Uujg.
- Politique de liaison M365 : `refuser` (choix de l'utilisateur, 2026-11-19).
- CORS edge-kit : liste explicite seulement (`MOTIF_ORGANISATION=aucun`) ; pas
  de sous-domaine défini à ce jour.

## 7. L'étape suivante

1. ✅ Chemin de migration prouvé le 2026-11-19 (runs `44564723167` plan et
   `44564704213` push : `link` réussi, « Remote database is up to date »).
2. ✅ Charte consommée (vendoring, 2026-11-20). Prochaine synchronisation :
   `npm run ui-epss:sync -- <ref>` depuis un clone voisin de TEMPLATE-EPSS.
3. ✅ Schéma du lot 1 appliqué en prod le 2026-11-20 (ADR-002, PR #4 et #5).
4. Ensuite : Edge Function d'import Aurion (identifiants en base, requête
   écrite par l'EPSS), puis l'écran « Interventions », puis « Mon planning »
   (`mockups/maquette-planning/project/L1-*.dc.html`).

## 8. Lancer et vérifier

```
npm install          # active aussi la porte pre-push
cp .env.example .env # puis renseigner
npm run dev
npm run verify       # lint + typecheck + test + build
```

## 9. Index des ADR, docs et mémoires

- ADR du projet : `docs/adr/`
- ADR inter-projets du parc : dépôt `APP-TEMPLATE`, `docs/adr/`
