---
name: fixtracker-mcp
description: Référence complète du workflow FixTracker via MCP — mécanique start/stop_worklog et rattrapage d'un créneau, catalogue des refus RLS et des triggers d'intégrité, style « reporting client » des worklogs et des demandes, HTML des commentaires, rappels de sécurité des tokens. Invoquer avant d'écrire via un tool `mcp__fixtracker__*` (statut, worklog, commentaire, demande, projet), ou quand un tool renvoie `isError`. Les interdits eux-mêmes sont dans CLAUDE.md, toujours chargés.
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

# Workflow FixTracker via MCP — référence

Le texte de référence complet vit dans
`docs/mcp-workflow-claude-code.md` — ⚠️ **À L'INSTANCIATION** : copier ce
document depuis APP-FIX dans le `docs/` du nouveau projet, puis rétablir le
lien relatif `[...](../../../docs/mcp-workflow-claude-code.md)`.
Lis-le en entier avant une écriture MCP non triviale — il est autonome et
c'est aussi la version distribuée aux collègues.

Ce qu'il couvre, dans l'ordre :

| Section                                 | Quand la lire                                            |
| --------------------------------------- | -------------------------------------------------------- |
| Deux environnements en parallèle        | avant de choisir `fixtracker` vs `fixtracker-preprod`    |
| Lifecycle d'une tâche                   | avant `update_task_status`                               |
| Chrono `start_worklog` / `stop_worklog` / `list_active_worklogs` | avant d'ouvrir ou de fermer un créneau — **plusieurs peuvent courir en parallèle, un par tâche**, ⚠️ voir la note ci-dessous |
| Style « reporting client »              | avant d'écrire un `title` / `body_md` / une demande      |
| Préfixe « Mise à disposition — »        | avant une clôture visible du client                      |
| Commentaires : HTML, pas Markdown       | avant `comment_task` / `comment_request`                 |
| Ce que tu peux faire via MCP            | pour les quatre pièges que la liste des tools ne dit pas |
| Ce que tu ne dois pas faire             | rappel — aussi dans CLAUDE.md                            |
| Refus RLS — comment lire un `isError`   | quand un tool échoue                                     |
| Sécurité — rappels                      | avant de toucher au `.env` du paquet MCP                 |

⚠️ **LE SERVEUR MCP NE SE MET PAS À JOUR TOUT SEUL.** Il ne tourne nulle
part : **chacun lance le sien**, bâti depuis son clone d'APP-FIX. Une
capacité mergée n'est donc réelle que pour qui a rebâti.

Les chronomètres parallèles (**un créneau par tâche**, ADR-077) sont en
**production depuis le 2026-09-10** (PR #836). Pour les obtenir :

```bash
git pull && npm --prefix tools/mcp-server ci \
         && npm --prefix tools/mcp-server run build
```

puis **une nouvelle session** — les serveurs MCP se chargent au démarrage.

⭐ **Le contrôle qui tranche, et il vaut mieux que la mémoire** : si
`list_active_worklogs` n'apparaît pas dans la liste des tools, le build est
antérieur. Avec l'ancien, **un seul créneau à la fois**, tous projets
confondus.

⚠️ Les règles qui coûtent cher si on les apprend trop tard sont **déjà
résidentes** dans `CLAUDE.md` § « Workflow FixTracker via MCP » : la
lecture sur prod / l'écriture sur préprod, `review` ≠ `done`, le HTML brut
des commentaires, le préfixe « Mise à disposition — », et les interdits.
Ce skill ne les remplace pas, il les détaille.
