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

## 2026-11-20 — Total : 1 h 40

| Tâche | Tâche_ID | Début | Fin | Durée |
| --- | --- | --- | --- | --- |
| Charte ERP EPSS : ui-epss vendorisé, coque et menu du lot 1 (PR #2, #3) | — | 08:09 | 08:26 | 0 h 15 |
| Plan du modèle de données et arbitrages (lead-dev) | — | 09:11 | 09:18 | 0 h 05 |
| Schéma du lot 1 : migrations, répétition, apply en prod (PR #4, #5) | — | 10:30 | 11:48 | 1 h 20 |

> Rollup du journal brut (32 événements, 3 séances). Séance encore ouverte à
> 11:52 : refaire le rollup en fin de journée. Le temps des sous-agents en
> arrière-plan entre deux échanges n'est pas capté (écart > 30 min = nouvelle
> séance) : ces durées sont un plancher.

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
