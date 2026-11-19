---
name: journal-entry
description: Scaffolde une entrée `docs/JOURNAL.md` avec l'ancre `**Tâches**` déjà remplie à partir du contexte de la session (branche git, PR courantes, TaskList, task_ids dans les commits du jour). Invoquer au moment d'ajouter une entrée journal — typiquement à un jalon Definition of Done, avec `HANDOFF.md` et `TIMELOG.md`. Ne remplit PAS le narratif : c'est le boulot de l'humain / de l'AI qui appelle le skill.
---

<!-- ═══════════════════════════════════════════════════════════════════
     GÉNÉRÉ — NE PAS ÉDITER ICI.

     Ce fichier est posé par la recette `outillage-agent` d'APP-TEMPLATE.
     Le corriger ici marche… jusqu'à la prochaine synchronisation, et la
     correction ne profite à aucun autre dépôt du parc.

     Pour le corriger : l'éditer dans
       APP-TEMPLATE/recettes/outillage-agent/fichiers/.claude/skills/
     puis rejouer chez chaque adoptant :
       node scripts/ajouter-module.mjs --module outillage-agent --cible <projet>

     POURQUOI. Mesuré le 2026-09-10 : les deux copies de `fixtracker-mcp`
     avaient déjà divergé — celle du squelette ignorait les chronomètres
     parallèles et `list_active_worklogs`, livrés le 2026-09-08. Un agent
     d'un projet neuf aurait travaillé sur une capacité périmée sans
     qu'aucun signal ne le dise. Voir `BACKLOG.md` B5.
     ═══════════════════════════════════════════════════════════════════ -->

# journal-entry

Utilise ce skill quand tu dois ajouter une entrée dans `docs/JOURNAL.md`
au jalon (Definition of Done). Il n'écrit pas le narratif — il produit
le **squelette conforme à la convention** avec les ancres `**Tâches**`
déjà résolues.

## Quand l'invoquer

- Fin de session substantielle (feature livrée, ADR mergée, migration
  appliquée).
- Ajout d'un `## AAAA-MM-DD` ou d'un `### N — jalon` dans `JOURNAL.md`.
- Au moment où tu écrirais `## 2026-07-21` à la main.

## Ce qu'il fait

1.  Détecte si on ajoute un jour (`##`) ou un sous-jalon (`###`) — regarde
    `docs/JOURNAL.md` : si le jour du jour est déjà présent, propose un
    sous-jalon ; sinon un jour.
2.  Reconstitue la liste des task_ids concernés à partir du contexte :
    - `git log <depuis-le-dernier-jalon>` — cherche les PRs mergées, les
      issues référencées, les commits qui matchent `[FT-<uuid>]` ou
      `(#<uuid-court>)`.
    - `TaskList` — les tâches en `in_progress` ou récemment `completed`.
    - Task IDs mentionnés dans la conversation en cours (grep messages
      assistant/user).
3.  Écrit le squelette en haut du `##` du jour, ou en tête du `###` du
    sous-jalon :

        ### N — <titre à remplir>
        **Tâches** : `<uuid1>`, `<uuid2>`, …

        <narratif à remplir>

4.  **Ne remplit PAS le narratif.** Retourne un message court à l'agent
    appelant : « squelette posé aux lignes X-Y de docs/JOURNAL.md, ancres
    résolues à N tâches. Rédige le narratif ».

## Cas particuliers

- **Aucun task_id détecté** — le skill pose `**Tâches** : —` (em-dash
  explicite) et note « entrée méta présumée ». L'agent appelant peut
  écraser avec des UUIDs manuels s'il en a.
- **Task_id ambigu** (prefix court détecté mais plusieurs matches) — le
  skill demande à l'agent appelant de trancher avant de scaffolder.
- **Pas de git repo** (JOURNAL isolé) — le skill saute la phase 2.1
  (git log), s'appuie uniquement sur `TaskList` et le contexte
  conversationnel.

## Ce qu'il ne fait pas

- **N'écrit pas le narratif.** L'humain / l'AI qui invoque garde la
  plume.
- **N'appelle pas d'API FixTracker.** Le skill lit uniquement le repo
  local + la conversation. Les UUIDs sont pris au format tel qu'ils
  apparaissent.
- **Ne touche pas à `TIMELOG.md`** — c'est le rollup hook qui s'en
  charge, en parallèle et indépendamment.

## Convention associée

La règle de format est documentée dans `~/.claude/CLAUDE.md` section
« Daily progress journal ». Ce skill est l'outillage qui rend la
convention non-optionnelle en pratique.
