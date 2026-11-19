# Backlog — APP-PLANNING

> Ce qui est identifié mais pas fait. Une ligne se retire quand elle est
> livrée, ou quand on décide de ne pas la faire — auquel cas on écrit
> pourquoi.

## Dettes

- **Secret `SUPABASE_ACCESS_TOKEN`** du workflow `db-push.yml` (jeton personnel Supabase, à poser par l'utilisateur). `SUPABASE_DB_PASSWORD` est posé. Sans ce jeton, le workflow échoue à l'étape « Link project ».
- **Pas de préprod séparée** : un seul projet Supabase pour le lot 1. À revoir avant l'ouverture aux utilisateurs (11/01/2027).
- **Socle : le squelette annonce `boilerplate-kit@0.2.0`**, qui ne publie pas `src/` et ne se vendorise pas. Corrigé ici en 0.3.0 ; à remonter à APP-TEMPLATE (`template/socle.json`).
- **ADR-001 à accepter** : mesurer le coût d'un projet Supabase de plus (offre et nombre de projets de l'organisation). Le projet du lot 1 existe déjà (décision de l'utilisateur, 2026-11-19).
- **ADR-001, modèle des affectations** : « proposé, à valider » dans le carnet de conception ; à faire valider avant la première migration (D2, D5, D6 en dépendent).
- **ADR-001 D7** : extraire le client Aurion de GDC dans TEMPLATE-EPSS avant d'écrire l'import du Planning.
- **Charte `@it-unify/ui-epss` pas encore consommée** : attendre la PR de la coque (TEMPLATE-EPSS) et la publication.

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
