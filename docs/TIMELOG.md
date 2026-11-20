# Relevé de temps — APP-PLANNING

> Journal du temps facturable, le jour le plus récent EN HAUT. Compagnon de
> `JOURNAL.md` : le journal dit **ce qui** a avancé, ce relevé dit **combien de
> temps** cela a pris.
>
> L'unité facturable est la **durée d'horloge de la séance de travail sur une
> tâche** — début → fin, temps de réflexion et d'échange inclus.
>
> **Ne jamais inventer une durée.** Elle se dérive du journal brut de capture,
> via :
>
> ```
> node ~/.claude/hooks/timelog-rollup.mjs <projectKey> [AAAA-MM-JJ]
> node ~/.claude/hooks/timelog-rollup.mjs --list
> ```
>
> La capture est câblée par ce dépôt (`.claude/settings.json` →
> `.claude/hooks/timelog-shim.mjs`). Elle est **silencieuse** : « ai-je fait le
> rollup ? » est un point de contrôle explicite avant de déclarer un incrément
> terminé.
>
> À défaut de capture (séance ancienne, jour rétroactif) : horodater soi-même
> avec `date +"%F %H:%M"`, ou reconstruire depuis les enveloppes de commits — et
> marquer ces lignes `≈`, jamais comme du temps exact.
>
> Arrondir à 5 min. Fondre les poussières de moins de 5 min dans la tâche
> parente. Les libellés reprennent ceux de `JOURNAL.md`, pour que les deux se
> réconcilient.

## 2026-11-20 — Total : 2 h 35

| Tâche | Tâche_ID | Début | Fin | Durée |
| --- | --- | --- | --- | --- |
| Charte ERP EPSS : ui-epss vendorisé, coque et menu du lot 1 (PR #2, #3) | — | 08:09 | 08:26 | 0 h 15 |
| Merge de la PR #3, choix de la suite (modèle de données) | — | 09:11 | 09:18 | 0 h 05 |
| Modèle de données (lead-dev, arbitrages) et schéma du lot 1 : migrations, répétition, apply en prod (PR #4, #5, #6) | — | 10:30 | 12:09 | 1 h 40 |
| Cadre d'autonomie et relevé des jetons (PR #7) | — | 12:09 | 12:14 | 0 h 05 |
| File du lot 1, tâche 1 : rôles sombres du Planning, ui-epss 0.1.0 (TEMPLATE-EPSS#3, PR #8) | — | 12:14 | 12:18 | 0 h 05 |
| File du lot 1, tâche 2 : RPC d'import `importer_seances` (PR #9, #10) | — | 12:18 | 12:39 | 0 h 20 |
| File du lot 1, tâche 2 : merge et apply de la RPC, contrôle MCP, clôture (PR #9, #10) | — | 13:18 | 13:22 | 0 h 05 |

> Rollup du journal brut : 4 séances, 53 événements, 2 h 37. La séance
> 10:30–12:39 est découpée aux **heures de merge** des PR (événements réels,
> `git log --merges`), pas à des heures estimées. Le temps des sous-agents en
> arrière-plan entre deux échanges n'est pas capté : plancher.

## 2026-11-19 — Total : ≈ 1 h 20

| Tâche | Tâche_ID | Début | Fin | Durée |
| --- | --- | --- | --- | --- |
| Cadrage, maquette, dépôt TEMPLATE-EPSS et jetons `ui-epss` | — | ≈ 16:19 | 16:43 | ≈ 0 h 25 |
| Instanciation, ADR-001, projet Supabase, handoff GDC | — | 16:43 | 17:40 | 0 h 55 |

> ≈ : avant 16:43, la capture n'était pas active (hooks chargés au démarrage
> de la séance). Début reconstruit depuis l'horodatage des fichiers ; plancher.
> De 16:43 à 17:40 : rollup du journal brut (30 événements).

<!-- La colonne Tâche_ID porte l'UUID de la tâche FixTracker entre backticks,
     ou — (tiret cadratin) si la séance n'est rattachable à aucune tâche unique
     (méta, setup, revue transverse). Garder le total de l'en-tête synchronisé. -->
