# Workflow FixTracker via MCP

Conventions internes pour toute session Claude Code qui utilise le
serveur MCP FixTracker. Chargé automatiquement dans le contexte
d'APP-FIX (référencé depuis `CLAUDE.md`) et copiable tel quel dans le
`CLAUDE.md` d'un autre projet qui utilise le même MCP — la section
« Diffusion à un collègue » en bas décrit ce cas.

Prérequis :

- Serveur MCP FixTracker installé et enregistré (voir la page `/mcp` de
  FixTracker et [`tools/mcp-server/README.md`](../tools/mcp-server/README.md)).
- Session Claude Code redémarrée après l'installation.

Tu as accès au serveur MCP FixTracker sous mon identité. Les écritures
passent sous mon JWT et sont bornées par la RLS (ADR-014) : un refus
« non assigné » n'est pas un bug, c'est la sécurité.

## Deux environnements en parallèle

Deux serveurs MCP existent :

- `mcp__fixtracker__*` — **production** (`fix.it-unify.com`). Toujours
  enregistré. Utilise-le pour **lire** ma liste de tâches, mes demandes,
  l'historique — et pour écrire sur mes tâches.
- `mcp__fixtracker-preprod__*` — **préprod** (`fix-p.it-unify.com`).
  Enregistré **à la demande**, quand on travaille sur une évolution du
  serveur MCP lui-même : il sert à éprouver les tools en préprod avant de
  les promouvoir. S'il n'apparaît pas dans la liste des tools de la
  session, c'est normal — il n'est pas censé y être en permanence.

✅ **Tâches liées à une demande : la reconstruction est permise.** Les
migrations d'ADR-096 sont en production depuis le 2026-10-09, et la RPC
`convert_request_to_task` est retirée de la base le 2026-10-12. Un poste pas
encore mis à jour (`npm run update-mcp`) garde l'ancien outil, qui répond
désormais « fonction inexistante ». La règle générale reste : un seul `dist/`
sert les deux serveurs, donc pas de reconstruction avec un outil dont les
migrations ne sont pas en production (détail : README du paquet, « Ordre de
déploiement — tâches liées »).

**Règle par défaut** : les tâches sont lues et mises à jour sur **prod**,
le code applicatif se développe et se teste sur **préprod**. On ne promeut
en prod qu'après feu vert explicite.

Un même appel MCP existe en deux versions (`mcp__fixtracker__update_task`
vs `mcp__fixtracker-preprod__update_task`) : choisis toujours celui qui
correspond à l'environnement visé.

## Lifecycle d'une tâche

Statuts FixTracker : `todo → in_progress → review → done`.

| Événement                   | Statut cible  |
| --------------------------- | ------------- |
| Je prends une tâche         | `in_progress` |
| PR mergée sur `pre-prod`    | `review`      |
| Review live OK + promo prod | `done`        |

**Important** : `review` ≠ `done`. Une tâche merge sur `pre-prod` reste
`review` — elle n'est `done` qu'après validation live et promotion prod.
Cette distinction alimente le reporting « livré préprod » vs « livré
prod ».

Change le statut via `update_task_status` (ou `update_request` côté
demande). N'inclus jamais `status` dans un `update_task` — utilise le
tool dédié, qui respecte les triggers d'intégrité (prédécesseurs
terminés, sous-tâches terminées).

## Chrono de travail — `start_worklog` / `stop_worklog`

> 🔴 **Le début, c'est l'instruction du sujet — pas la première ligne de
> code. La fin, c'est le compte rendu — pas le dernier commit.** Mesuré le
> 2026-09-11 : 42 % des messages d'une journée tombaient hors de tout
> créneau, tous logés dans les trous entre deux chronos. Ces trous sont du
> travail : instruire un sujet, rendre compte du précédent.
>
> ⚠️ La règle sert la **justesse**, pas le gonflement : un créneau laissé
> ouvert pendant une pause est une erreur, pas une marge.

Ouvre le chrono **au début** du travail sur une tâche, ferme-le **à la
fin**. La durée est calculée à l'horloge réelle (arrondie 5 min) — elle
n'est **jamais estimée** ni inventée.

1. **Début** : appelle `start_worklog({ task_id })`. **Plusieurs créneaux
   peuvent courir en parallèle, un par tâche** (ADR-077) — le refus ne
   porte que sur une tâche qui a déjà le sien. La réponse rappelle les
   autres créneaux ouverts : lis-la.
2. **Fin** : appelle `stop_worklog({ title, body_md?, task_id? })`. Le
   `task_id` est facultatif tant qu'un seul créneau est ouvert ; au-delà
   il est exigé, et le refus énumère les créneaux avec leur heure. La
   réponse dit ce qu'elle a fermé et ce qui reste ouvert.
3. **À tout moment** : `list_active_worklogs` rend les créneaux ouverts,
   leur âge et un drapeau « périmé ».

⚠️ **Le geste réflexe, c'est le listage.** Avec un seul créneau possible,
le refus au `start` signalait tout oubli. Ce n'est plus le cas : un
créneau oublié n'est visible que si on le demande.

**Ne jamais fermer un créneau périmé.** Si le `start` a été fait la
veille et que je te demande de fermer aujourd'hui, la durée postée
inclurait toute la nuit. Le serveur refuse de lui-même au-delà de 8 h ou
d'un changement de jour, et propose `forcer: true` — **ne le passe pas
sans me demander** : reprends un `start`, ou impute le temps réel avec
`update_task { billed_duration_minutes }`.

Après chaque `stop_worklog`, la réponse contient `journal_entry_id`,
`timelog_entry_id` et `deduplicated`. `deduplicated: true` = retry
idempotent, rien de neuf posté.

## Style « reporting client » pour les worklogs

Le `title` et le `body_md` d'un `stop_worklog` sont **visibles côté
client** (feed projet, onglet `/nouveautes`). Écris-les en **langage
simplifié orienté valeur** — pas de jargon technique.

**À éviter** :

- références PR (`PR #612`), commits (`a389003`), fichiers
  (`src/components/…`) ou migrations (`20260820_…`),
- références ADR (`ADR-058 QW4`),
- vocabulaire d'implémentation (« refactor », « rebase », « CI »,
  « lockfile »).

**À privilégier** : ce que l'utilisateur voit, ce qui change pour lui,
la valeur livrée.

Le jargon technique reste utile — mais dans les **commits**, les **PR**
et les **ADR**, pas dans les worklogs.

### Préfixe « Mise à disposition — »

Un worklog dont le `title` commence par `Mise à disposition — `
(avec U+2014 EM DASH) est **exposé dans l'onglet `/nouveautes`** de
FixTracker.

Utilise ce préfixe **uniquement** pour les clôtures qui livrent une
**valeur visible à l'utilisateur final** — nouvelle fonctionnalité,
correctif utilisateur, amélioration visible.

Les worklogs techniques intermédiaires (« Correction post-revue »,
« Résolution de conflit », « Décision d'architecture », « Rebase »,
etc.) restent hors de ce filtre — ils apparaissent dans le journal
projet du technicien, pas dans le feed nouveautés client.

## Commentaires : HTML, Markdown ou texte — mais jamais mélangés

Depuis le 2026-08-25, le format est détecté **enregistrement par
enregistrement** (`detecterFormat`, `src/lib/richText.ts`). Trois formats
coexistent en base sans se mélanger — relevé sur 758 champs remplis : 96 en
HTML (saisis au WYSIWYG), 22 en Markdown (postés par le MCP), le reste en
texte brut. Les commentaires de tâche et de demande passent par le même
rendu (`RichTextContent`).

L'ordre de détection est ce qui compte :

1. une **balise ouvrante** (`<p`, `<strong>`, `<br/>`…) ⇒ tout le champ part
   en **HTML**, et il est assaini ;
2. sinon un **marqueur Markdown** ⇒ **Markdown** interprété ;
3. sinon **texte brut**, affiché tel quel, sauts de ligne conservés.

Marqueurs Markdown reconnus : `**gras**`, `_italique_`, `- liste`,
`1. liste`, `# titre`, `> citation`, `[texte](url)`, `` `code` ``, et le
tableau GFM depuis le 2026-09-22 — celui-ci exige la ligne de tirets sous
l'en-tête, sans quoi une simple barre verticale ferait un faux tableau.

🔴 **Le piège est le mélange, pas le Markdown.** La détection HTML passe en
premier : une seule balise glissée dans un texte Markdown bascule tout le
champ en HTML, et les astérisques s'affichent alors littéralement. Choisis un
format et tiens-t'y dans un même commentaire.

### Les deux formats n'ont pas le même vocabulaire

La liste blanche d'assainissement HTML est plus courte que ce que le rendu
Markdown sait faire.

| Besoin                            | HTML                    | Markdown                                   |
| --------------------------------- | ----------------------- | ------------------------------------------ |
| Gras / italique / souligné        | `<strong>` `<em>` `<u>` | `**gras**`, `_italique_` (pas de souligné) |
| Listes                            | `<ul><li>` · `<ol><li>` | `- ` et `1. `                              |
| Paragraphes / sauts de ligne      | `<p>` `<br>`            | ligne vide (les sauts simples sont forcés) |
| Titres, citations, code, tableaux | ❌ non rendus           | ✅ `#`, `>`, `` ` ``, tableau GFM          |
| **Liens**                         | ❌ `<a>` est **retiré** | ✅ `[texte](url)`, ouvert en nouvel onglet |

⚠️ **`<a href="…">` ne fonctionne pas.** La balise n'est pas dans la liste
blanche (`ALLOWED_TAGS`) : l'élément est jeté, seul son texte survit, et
l'URL est perdue. Les versions antérieures de ce guide la recommandaient —
c'était faux. Pour poser un lien, écris le commentaire en **Markdown**.

⚠️ Les **entités échappées** restent une erreur définitive : `&lt;p&gt;`
s'affiche littéralement.

Relis toujours avant d'appeler le tool — la publication est immédiate.

### Corriger après coup

`edit_task_comment` / `edit_request_comment` modifient **ton propre**
commentaire, jamais celui d'autrui. Mais la modification est **silencieuse** :
rien n'enregistre qu'un commentaire a changé, et rien ne l'affiche.

Corriger une **mise en forme** est donc légitime, l'intention étant
identique. Réécrire le **fond** d'un commentaire que quelqu'un a déjà lu ne
l'est pas — un second commentaire est alors plus honnête qu'une réécriture
invisible. Demande-moi en cas de doute.

## Ce que tu peux faire via MCP

La liste des tools et des resources `fixtracker://…` est celle de ta
session — lis-la là plutôt qu'ici. Les écritures passent sous mon JWT,
donc la RLS est la frontière.

Sept points que la liste des tools ne dit pas :

- `attach_file_to_task` prend un chemin **LOCAL**, 10 Mo au plus. Le
  retrait (`remove_task_attachment`) demande `tasks:delete` — je peux donc
  joindre sans pouvoir retirer.
- Sur une **demande** (n° 228) : `attach_file_to_request` (10 Mo),
  `attach_image_to_request_comment` (image, 5 Mo, 5 par commentaire, sur
  **mon** commentaire : le poster d'abord avec `comment_request`) et
  `remove_request_attachment` (l'auteur de la pièce, ou `requests:delete`).
  Pas d'image sur un commentaire de **tâche** : ni l'application ni la base
  ne le permettent.
- `set_project_member` : **les deux permissions à faux retirent l'accès**.
  `assign_project_member` existe encore mais ne sait qu'ajouter avec les
  défauts.
- **Pour agir sur quelque chose, il faut son identifiant — et trois tools
  le donnent** : `rechercher_personnes` (par nom ou courriel),
  `lister_projets`, `lister_taches` (par projet, personne, statut ou titre)
  et `lister_demandes` (mêmes filtres, plus le **numéro de ticket**).
  Recopie le champ `id`. ⚠️ Un décompte plus petit que prévu est la
  RLS qui borne ce que je peux voir, pas un tool en panne — et ce n'est
  **jamais** une raison de basculer sur un serveur `service_role` pour
  « voir tout le monde ».
- `generer_rapport` est un tool de **lecture** parmi les écritures,
  donc utilisable même avec un jeton en lecture seule. Il écrit un PDF
  localement et rend son **chemin**, jamais les octets ; ce chemin se passe
  tel quel à `attach_file_to_task`. Portée `client` (avec `clientIds`) ou
  `projet` (avec `projetId`) — « tous les clients » a été retirée, un tel
  document nommait tous les clients et les projets internes.
- `edit_task_comment` / `edit_request_comment` corrigent le **mien**,
  jamais celui d'autrui.
- **Travailler sur une demande passe par une tâche liée** — voir la section
  suivante. `convert_request_to_task` n'existe plus.

## Travailler sur une demande : la tâche liée

Le chrono et la facturation portent sur une **tâche**. `start_worklog` refuse
l'identifiant d'une demande et oriente vers l'un de ces deux gestes :

- **`create_task` avec `request_id`** — crée une tâche qui répond à la demande,
  avec le lien, en une seule fois : tout ou rien. La demande **reste ouverte**
  avec sa discussion : elle n'est pas modifiée et le demandeur n'est pas
  prévenu ; le commentaire système posé sur la tâche notifie ses assignés,
  son créateur et les responsables de son projet.
  Sur ce chemin, un assigné refusé annule toute la création.
- **`link_task_to_request`** — lie une tâche qui existe déjà.
  `unlink_task_from_request` retire le lien, sans toucher ni à la tâche ni à la
  demande.

Une tâche peut répondre à plusieurs demandes, et une demande avoir plusieurs
tâches, y compris d'un autre projet. Quand une tâche liée passe en `done` ou
`cancelled` et que toutes sont alors finies (au moins une `done`), une demande
`new` ou `in_progress` passe **d'elle-même** en `treated`, avec la notification
habituelle au demandeur. Rouvrir une tâche ne revient pas en arrière.

Il faut voir la demande, avoir le droit de modifier les demandes et les tâches,
et être assigné à une tâche du projet de la tâche. Le refus dit **quel côté**
manque (demande ou tâche) quand il peut le déterminer — remonte-le tel quel.
⚠️ Si ton compte ne lit que les tâches auxquelles il est assigné, mets ton
propre identifiant **en tête** de `assignees` dans `create_task` : la tâche
doit t'être lisible dès sa création.

Les liens se lisent dans `lister_demandes` (`linked_tasks`), `lister_taches` et
`fixtracker://task/{id}` (`linked_requests`). Une liste vide veut dire « aucun
lien visible pour moi », pas « aucun lien » ; un côté masqué n'apparaît que par
son identifiant (`lisible: false`).

## Ce que tu ne dois pas faire

- **Pas de `service_role`.** Le MCP écrit sous mon JWT uniquement.
  Une écriture qui refuse en RLS refuse — ne cherche pas à la
  contourner.
- **Pas de modification directe du `.env` MCP** pour ajouter des droits.
- **Pas de tour de passe-passe pour changer un statut** verrouillé par
  un trigger d'intégrité (prédécesseurs non terminés, sous-tâches non
  terminées) — remonte-moi le refus, je décide.

  ⚠️ `remove_task_dependency` **n'est pas** ce tour de passe-passe, mais il
  peut y ressembler : retirer une dépendance change le MODÈLE du projet, ce
  qui est une décision, pas un contournement. Ne le fais pas pour débloquer
  un statut sans me demander — la règle d'intégrité continue de s'appliquer
  sur les dépendances restantes, et c'est voulu.

- **Ne pas confirmer un worklog à ma place.** Le client MCP demande une
  approbation avant chaque écriture (annotations MCP) — c'est
  volontaire. Un `stop_worklog` reste ma décision.

## Refus RLS — comment lire un `isError`

Un tool refusé renvoie `isError: true` avec un `error` explicite. Les
formes typiques :

- « Aucune tâche mise à jour : id inexistant, ou vous n'êtes pas
  assigné à une tâche de ce projet » → **RLS** (ADR-014). Pas un bug.
- « Transition refusée : prédécesseur non terminé » → **trigger
  d'intégrité**. Ferme le prédécesseur d'abord.
- « La sous-tâche doit appartenir au même projet » → **trigger
  `enforce_subtask_same_project`** (ADR-046).
- « Refusé par la RLS : … réservée aux administrateurs » → **ADR-035**
  (création/rename/assignation projet admin-only).

Remonte-moi le refus tel quel — ne réessaie pas en boucle.

## Sécurité — rappels

- **Token = personnel.** Un token MCP porte mon identité. Ne le partage
  jamais, n'en affiche jamais la valeur, ne le mets pas dans un
  `.mcp.json` committé.
- **Le `.env` du paquet MCP est gitignoré.** Ne le committe pas.
- **stdout MCP = JSON-RPC réservé.** Les logs de diagnostic vont sur
  stderr — n'y injecte rien.

## Si un doute

En cas de doute sur une écriture (statut à changer, worklog à poster,
commentaire à publier), **demande-moi la confirmation avant**. Le coût
d'une confirmation est faible ; celui d'un worklog client visible mal
formulé ou d'un statut cassé est plus élevé.

## Diffusion à un collègue

Ce fichier est autonome : un collègue qui installe le MCP FixTracker
depuis un autre projet peut le déposer à la racine de son projet sous
`CLAUDE.md` (ou l'ajouter à un `CLAUDE.md` existant) — sa session
Claude Code applique alors les mêmes règles. Il est référencé
automatiquement depuis :

- l'invite d'installation du MCP (étape 6) — postes neufs ;
- l'invite de mise à jour (étape 4) — postes déjà installés ;
- la page `/mcp` (paragraphe « Conventions de session Claude »).
