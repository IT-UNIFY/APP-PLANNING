# `outillage-agent` — ce que la recette NE PEUT PAS faire

> Trois choses. La première est un vrai trou, les deux autres des rappels.

## 1. 🔴 `docs/mcp-workflow-claude-code.md` n'est pas posé

Le skill `fixtracker-mcp` renvoie à ce document comme à sa **référence
principale** : *« lis-le en entier avant une écriture MCP non triviale »*.

**La recette ne peut pas le poser** : il vit chez **APP-FIX**, il n'est pas
dans le socle, et il décrit le serveur MCP — pas le projet qui l'utilise.

Conséquence sans détour : **le skill se charge, et son renvoi principal
pointe dans le vide.** Les règles qui coûtent cher restent couvertes — elles
sont dans le `CLAUDE.md` que la recette pose, en permanence — mais le détail
manque.

```bash
cp ~/work/APP-FIX/docs/mcp-workflow-claude-code.md docs/
```

⚠️ **C'est une recopie, donc une future divergence.** Elle est assumée faute
de mieux : ce document est long, propre au serveur MCP, et le verser au socle
en ferait un quatrième endroit à tenir. L'entrée de `docs/BACKLOG.md` ouverte
par la recette reste ouverte tant qu'il n'est pas copié.

## 2. ⚠️ Une ligne à ajouter à la main dans votre `CLAUDE.md`

La recette pose `.claude/regles-partagees.md`. **Rien ne le charge tant que
votre `CLAUDE.md` ne l'importe pas** :

```
@.claude/regles-partagees.md
```

🔴 **Pourquoi une ligne à la main plutôt qu'un fichier posé.** La première
version de cette recette posait un `CLAUDE.md` entier. Mesuré **avant** de
l'appliquer : chez APP-FIX, elle aurait **détruit 200 lignes et 14 sections**
propres au projet — architecture, migrations, styling, journalisation. Une
recette qui écrase le fichier le plus personnel d'un dépôt n'est pas une
recette, c'est un accident. **Aucun fichier de cette recette n'écrase du
contenu humain.**

⚠️ **`@fichier` est une directive d'IMPORT, pas une phrase.** Elle fait
charger le fichier. Mesuré le 2026-09-10 : quatre dépôts du parc portaient
« See AGENTS.md » — de la prose, que rien ne charge. Leurs règles
d'ingénierie n'étaient pas dans le contexte, alors que le fichier existait et
affirmait le contraire. **Un pointeur qui ne pointe pour personne est pire
qu'une absence : il rassure.**

Un projet **instancié depuis le squelette** a déjà les deux lignes.

## 3. ⚠️ Le serveur MCP est enregistré PAR RÉPERTOIRE

La recette pose les skills, pas l'accès. `mcp__fixtracker__*` ne se chargera
pas tant que le dossier du projet n'a pas son entrée :

```bash
claude mcp add fixtracker -- node ~/work/APP-FIX/tools/mcp-server/dist/index.js
```

**Les serveurs MCP se chargent au démarrage** : après l'ajout, il faut une
**nouvelle session**. Sans cela, le skill s'invoque et aucun tool ne répond.

## 🔴 APP-FIX ne joue PAS cette recette

Il est la **source** du savoir FixTracker, comme APP-TEMPLATE est la source du
socle. Son `fixtracker-mcp` porte légitimement ce que la version générique ne
peut pas porter :

- un **lien relatif cliquable** vers `docs/mcp-workflow-claude-code.md`, qui
  existe réellement chez lui ;
- les **citations d'ADR** (`ADR-077` pour les chronomètres parallèles), qui ne
  veulent rien dire dans un autre dépôt.

Mesuré : appliquer la recette chez lui lui ferait perdre exactement ces deux
choses. C'est peu, mais c'est une perte sans contrepartie — il n'a rien à
recevoir d'un fichier dérivé du sien.

**Le sens de circulation est donc l'inverse** : quand le savoir FixTracker
change chez APP-FIX, il remonte dans
`APP-TEMPLATE/recettes/outillage-agent/fichiers/`, généralisé, puis redescend
chez les adoptants par la recette. C'est ce chemin qui a manqué le
2026-09-08 — la mise à jour des chronomètres parallèles est restée chez
APP-FIX pendant deux jours.

## Ce que la recette fait, elle

| Fichier | Effet |
| --- | --- |
| `.claude/skills/journal-entry/SKILL.md` | posé, bandeau **GÉNÉRÉ** |
| `.claude/skills/fixtracker-mcp/SKILL.md` | posé, bandeau **GÉNÉRÉ** |
| `.claude/regles-partagees.md` | posé, bandeau **GÉNÉRÉ** — fichier NEUF, n'écrase rien |

**Resynchroniser plus tard** — c'est tout l'objet de la recette :

```bash
node scripts/ajouter-module.mjs --module outillage-agent --cible <projet>
```

⚠️ **Ce que le bandeau ne fait pas.** Il dit « ne pas éditer ici » ; **rien ne
l'empêche**. Contrairement au code du socle, ces fichiers n'ont pas de
contrôle d'empreinte : ce sont des instructions, pas du code, et une porte de
vérification n'a rien à quoi les comparer sans le paquet. La protection est
sociale, pas mécanique — dit ici plutôt que sous-entendu.
