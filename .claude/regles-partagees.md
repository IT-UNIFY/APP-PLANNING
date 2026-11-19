<!-- ═══════════════════════════════════════════════════════════════════
     GÉNÉRÉ — NE PAS ÉDITER ICI.

     Posé par la recette `outillage-agent` d'APP-TEMPLATE. Le corriger là-bas
     puis rejouer :
       node scripts/ajouter-module.mjs --module outillage-agent --cible <projet>

     🔴 CE FICHIER NE REMPLACE PAS VOTRE `CLAUDE.md`, il le COMPLÈTE.
     Il ne porte QUE les règles communes à tout le parc. Vos conventions
     propres — architecture, migrations, styling, journalisation — restent
     dans VOTRE `CLAUDE.md` et dans `AGENTS.md`, et rien ne les touche.

     POURQUOI CETTE SÉPARATION, et elle vient d'un défaut évité de justesse :
     la première version de cette recette posait un `CLAUDE.md` entier. Mesuré
     avant de l'appliquer — chez APP-FIX, elle aurait **détruit 200 lignes**
     et 14 sections propres au projet. Une recette qui écrase le fichier le
     plus personnel d'un dépôt n'est pas une recette, c'est un accident.

     POUR L'ACTIVER, une ligne dans votre `CLAUDE.md` :
       @.claude/regles-partagees.md
     ═══════════════════════════════════════════════════════════════════ -->

# Workflow FixTracker via MCP — règles communes au parc

Référence complète : `docs/mcp-workflow-claude-code.md`, via le skill
`fixtracker-mcp` — invoque-le avant une écriture MCP non triviale, ou quand
un tool renvoie `isError`. Ce qui suit reste chargé en permanence, parce que
ces règles coûtent cher si on les apprend après coup.

Les écritures passent sous l'identité du membre et sont bornées par la RLS :
un refus « non assigné » n'est pas un bug, c'est la sécurité.

**Environnements.** Les tâches sont lues **et mises à jour** sur **prod**
(`mcp__fixtracker__*`, toujours enregistré) ; le code applicatif se développe
et se teste sur préprod. `mcp__fixtracker-preprod__*` n'est enregistré **qu'à
la demande**, quand on travaille sur une évolution du serveur MCP lui-même —
son absence de la liste des tools est normale.

⚠️ **Le raccourci « lecture sur prod, écriture sur préprod » est trompeur** et
a déjà fait hésiter une session (2026-09-10) : il parle du **code du serveur
MCP**, pas des tâches. Les tâches s'écrivent sur prod.

**`review` n'est pas `done`.** Une tâche passe en `review` quand le travail
est fait et vérifiable ; en `done` seulement après validation. Les
dépendances de tâches se lisent sur cet état — un `done` prématuré débloque
un successeur qui ne devrait pas l'être.

**Les commentaires sont du HTML, pas du Markdown.** Un `**gras**` s'affiche
tel quel côté client.

**Préfixe « Mise à disposition — »** sur toute clôture visible du client.

**Durée facturée.** `billed_duration_minutes` **REMPLACE** le total, elle ne
s'y ajoute pas. Le relevé de temps du dépôt (`docs/TIMELOG.md`) en est la
source ; **le relevé suit la TÂCHE, pas le dépôt touché** — une même séance
inscrite dans deux relevés serait comptée deux fois.

## Ce qu'il ne faut pas faire

- **Ne jamais supprimer** une tâche, une demande ou un projet.
- **Ne jamais écrire dans la base directement** : tout passe par les tools
  MCP, qui portent la RLS et les triggers d'intégrité.
- **Ne jamais recopier un secret** dans une description, un commentaire ou un
  message de commit — un mot de passe dans un fichier suivi n'est pas un
  secret, même de recette.
