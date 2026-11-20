# Backlog — APP-PLANNING

> Ce qui est identifié mais pas fait. Une ligne se retire quand elle est
> livrée, ou quand on décide de ne pas la faire — auquel cas on écrit
> pourquoi.

## File du lot 1 — ordre de travail (AGENTS.md §11)

L'agent prend la première tâche non bloquée. ⛔ = attend une action de
l'utilisateur ou de l'EPSS, hors du dépôt.

1. ✅ **Charte, dettes courtes** (2026-11-20) : rôles sombres du module
   Planning (provisoires, Q5), étiquette `v0.1.0`, resynchronisation.
2. **RPC d'import** `importer_seances` (migration additive) : une seule
   transaction qui pose `planning.import_id`, insère ou met à jour séances,
   affectations, groupes, salles, intervenants, compte nouvelles / modifiées /
   retirées et écrit les anomalies. Tests pgTAP.
3. **Client Aurion partagé** (ADR-001 D7) : extraire de GDC (lecture seule) vers
   TEMPLATE-EPSS la lecture du favori et la transformation, avec des tests sur
   des données d'exemple.
4. **Edge Function `import-aurion`** : appel du favori, transformation, appel de
   la RPC ; identifiants Aurion en base selon le modèle de l'ADR-021 de GDC.
   Testée sur des données d'exemple. ⛔ pour la tester sur le vrai Aurion :
   requête écrite par l'EPSS (favori) et identifiants du compte technique.
5. **Écran « Interventions »** : liste (filtres, tri, colonnes, une ligne par
   intervenant) puis calendrier mois et semaine, d'après `L1-Interventions`.
   Tests de composants sur des données simulées. ⛔ pour le voir avec de vraies
   données : connexion (tâche 8).
6. **Écran « Import Aurion »** (paramètres) : état, compteurs, anomalies,
   historique, données reprises, d'après `L1-Import`.
7. **Edge Function de lecture pour GDC** (`lecteur_gdc`, ADR-002 D5) et
   exposition de `api_v1`. ⛔ réglage du projet (schémas exposés).
8. **Connexion M365 et rôles** dans le front (garde de routes, menu selon le
   rôle, `utilisateur` et déconnexion dans la coque). ⛔ inscription Entra,
   secret en Vault, domaine du locataire (`docs/PREREQUIS-m365-auth.md`).
9. **Écran « Utilisateurs et accès »** : liste, rôle, retrait tracé. ⛔ ajout
   depuis l'annuaire M365 : droits Graph côté Entra.
10. **Paquet « Mon planning »** (`@it-unify/planning-ecrans`, ADR-001 D4) pour
    l'espace intervenant de GDC.

## Dettes

- **Pas de préprod séparée** : un seul projet Supabase pour le lot 1. À revoir avant l'ouverture aux utilisateurs (11/01/2027).
- **Socle : le squelette annonce `boilerplate-kit@0.2.0`**, qui ne publie pas `src/` et ne se vendorise pas. Corrigé ici en 0.3.0 ; à remonter à APP-TEMPLATE (`template/socle.json`).
- **ADR-001 à accepter** : mesurer le coût d'un projet Supabase de plus (offre et nombre de projets de l'organisation). Le projet du lot 1 existe déjà (décision de l'utilisateur, 2026-11-19).
- **ADR-001, modèle des affectations** : « proposé, à valider » dans le carnet de conception ; à faire valider avant la première migration (D2, D5, D6 en dépendent).
- **ADR-001 D7** : extraire le client Aurion de GDC dans TEMPLATE-EPSS avant d'écrire l'import du Planning.
- **Historique des groupes d'une séance** : un changement de `intervention_groupes` ne laisse aucune trace (ADR-002, limites). À traiter si le groupe entre dans une preuve.
- **Écriture du secret M365 en Vault** : la RPC `m365_tenant_secret` lit le secret, mais rien ne le pose ni ne met `secret_is_set` à vrai. Il faut un outil (Edge Function ou procédure) avant d'activer la connexion.
- **Exposer `api_v1` dans l'API du projet** (réglage distant, hors migration) quand l'Edge Function de lecture pour GDC arrive.
- **Connexion et rôles** : la coque tourne sans `utilisateur` ni déconnexion, et tout le menu est visible. À brancher avec `m365-auth` et les rôles du lot 1 (administrateur, lecteur des interventions).

## Instabilités de tests constatées

<!-- La porte pre-push demande de consigner ici tout test qui repasse au vert
     sans qu'une ligne change : c'est une instabilité sous charge, pas une
     régression. Noter le NOM du test et la date. -->

## Idées non arbitrées

- Aucune pour l'instant.

### Câblage `outillage-agent` — prérequis hors bande à poser

Câblage `outillage-agent` — le skill `fixtracker-mcp` renvoie à `docs/mcp-workflow-claude-code.md`, que la recette ne peut pas poser : ce document vit chez APP-FIX et n'est pas dans le socle. Sans lui, le skill se charge mais son renvoi principal pointe dans le vide. Détail : docs/PREREQUIS-outillage-agent.md.

> Ouverte par `ajouter-module` le 2026-11-19.
> **Reste ouverte tant que les prérequis ne sont pas posés** — un projet
> instancié doit savoir ce qui lui manque (ADR-001 D18).

### Câblage `m365-auth` — prérequis hors bande à poser

Câblage `m365-auth` — prérequis hors bande non posés : inscription Entra, clés en Vault, tables et RLS. Tant qu'ils manquent, la connexion Microsoft 365 ne fonctionne pas. Détail : docs/PREREQUIS-m365-auth.md.

> Ouverte par `ajouter-module` le 2026-11-19.
> **Reste ouverte tant que les prérequis ne sont pas posés** — un projet
> instancié doit savoir ce qui lui manque (ADR-001 D18).

### Câblage `edge-kit` — prérequis hors bande à poser

Câblage `edge-kit` — à vérifier avant de croire le CORS configuré : `ALLOWED_ORIGINS` doit être posée dans CHAQUE environnement déployé. Absente, la fonction refuse toute origine (fail-closed, voulu) et l'application front ne peut plus l'appeler. Détail : docs/PREREQUIS-edge-kit.md.

> Ouverte par `ajouter-module` le 2026-11-19.
> **Reste ouverte tant que les prérequis ne sont pas posés** — un projet
> instancié doit savoir ce qui lui manque (ADR-001 D18).
