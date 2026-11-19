@AGENTS.md
@.claude/regles-partagees.md

<!-- ⭐ CES DEUX LIGNES SONT DES DIRECTIVES D'IMPORT, PAS DES PHRASES.
     Elles font CHARGER les deux fichiers à chaque session.

     🔴 Mesuré le 2026-09-10 sur le parc : quatre dépôts portaient
     « See AGENTS.md » — de la prose, que rien ne charge. Leurs règles
     d'ingénierie n'étaient donc pas dans le contexte de l'agent, alors que
     le fichier existait et affirmait le contraire. Un pointeur qui ne
     pointe pour personne est pire qu'une absence : il rassure.

     `.claude/regles-partagees.md` est posé par la recette `outillage-agent`
     d'APP-TEMPLATE. Tant qu'elle n'a pas été jouée, le fichier est absent —
     un import manquant est sans gravité, mais les règles FixTracker
     communes ne seront pas chargées. Le poser :
       node scripts/ajouter-module.mjs --module outillage-agent --cible . -->

# APP-PLANNING — conventions locales

- Module **Planning** de l'ERP EPSS (couleur framboise, `data-module="planning"`).
- La charte et les composants partagés viennent de `@it-unify/ui-epss`
  (dépôt IT-UNIFY/TEMPLATE-EPSS). Un composant utile à d'autres modules se
  crée LÀ-BAS, pas ici.
- Lot 1 = lecture seule des séances importées d'Aurion ; rien ne repart vers
  Aurion. La maquette fait foi : `mockups/maquette-planning/`.
- Schéma : uniquement par `gh workflow run db-push.yml` (AGENTS.md §4).
