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
