# Brief — session cloud « Porter la coque ERP EPSS dans @it-unify/ui-epss »

À coller dans New session → Cloud, dépôt **IT-UNIFY/TEMPLATE-EPSS**, environnement « Default ».

---

Contexte. Le dépôt IT-UNIFY/TEMPLATE-EPSS porte le paquet npm `@it-unify/ui-epss` : la charte « ERP EPSS » partagée par les modules de l'ERP (APP-GDC = module Intervenant, APP-PLANNING = module Planning, puis d'autres). Lire d'abord `docs/adr/ADR-001-paquet-charte-erp-epss.md`, `docs/HANDOFF.md`, `AGENTS.md` et `reference/README.md`. Déjà sur `main` : jetons générés depuis la maquette (`styles/tokens-erp.css`, `src/modules.ts`, 14 modules, module courant par `data-module="<id>"` sur `<html>`, rôles `--erp-module-{principale,accent,action,action-survol,fond-clair,foncee}-rgb`), preset Tailwind v3 (`tailwind-preset.js`), `npm run verify`. `reference/` contient des copies EN LECTURE SEULE : coque et composants d'APP-GDC (`reference/gdc-pre-prod-test/`) et maquette Planning lot 1 (`reference/maquette-planning/project/*.dc.html`, à lire comme source). Écrire code, commentaires, docs et commits en français.

Tâche. Porter la coque d'application ERP EPSS et les composants de base dans `@it-unify/ui-epss`, sur une branche, puis ouvrir une PR vers `main`.

Lots, dans cet ordre (chaque lot commité à part ; s'arrêter proprement si le temps manque) :
1. **Coque** depuis `reference/gdc-pre-prod-test/src/components/layout/shell/` : `AppShell`, `AppBandeau`, `AppMenu`, `useMenuReplie`, `useGroupesMenu`, `useHauteurBandeau`, `usePanneauMenu` (+ `compteursMenu` si utile), avec leurs tests portés. La maquette (`Bandeau.dc.html`, `Menu.dc.html`) fait foi pour le visuel.
2. **Menu des paramètres** d'après `L1NavParam.dc.html` (groupes repliables, recherche, mode réduit), données par props.
3. **Composants de base** utilisés par les écrans `L1-*.dc.html` : bouton, badge d'état, carte, onglets, tuile de chiffre, en-tête de page (bandeau du module avec fil d'Ariane et titre). Reprendre `reference/gdc-pre-prod-test/src/components/ui/` quand ils suivent la charte ERP (ADR-047), sinon partir de la maquette.
4. **Page de démonstration** (Vite dev, non publiée) : la coque avec un sélecteur `data-module` sur les 14 modules et un exemple de chaque composant.

Choix d'API validés :
- `react` / `react-dom` ^19 et `react-router-dom` ^7 en `peerDependencies` (liens du menu en `NavLink`).
- Icônes en `ReactNode` dans chaque entrée de menu ; aucune dépendance Font Awesome.
- Libellés : props avec valeurs françaises par défaut (remplacent l'i18n `fr` de GDC).
- Session et déconnexion : props `utilisateur` et `onDeconnexion` (remplacent `useAuth`, `useDeconnexion`).
- Logo EPSS inclus ; bascule de thème passée en emplacement (`ReactNode`).
- Seulement les classes du preset (rôles `module-*`, socle, états), jamais une couleur de module en dur.
- Build : Vite mode bibliothèque (ESM + `.d.ts`), React externe ; garder `./tokens.css`, `./tailwind-preset`, `./modules`, `./tokens.json` dans `exports` et ajouter les composants (ex. `./coque`, `./composants`). README : le consommateur ajoute `node_modules/@it-unify/ui-epss/dist/**/*.js` au `content` de Tailwind.
- **Deux versions de Tailwind à servir** : APP-GDC est en Tailwind v3 (preset JS actuel), APP-PLANNING en Tailwind v4 (CSS-first, `@tailwindcss/vite`). Ajouter un sous-chemin `./theme.css` (bloc `@theme inline` qui mappe les mêmes noms que le preset sur les variables `--erp-*`, généré par `scripts/generer-tokens.mjs` et contrôlé par `--check`), et documenter pour v4 : `@import "@it-unify/ui-epss/tokens.css"; @import "@it-unify/ui-epss/theme.css"; @source "../node_modules/@it-unify/ui-epss/dist";`. Les composants n'utilisent que des classes qui existent dans les deux.
- Tests : Vitest + jsdom + Testing Library, dans `npm run verify`.

Limites : ne pas modifier `reference/` ni éditer à la main `styles/tokens-erp.css` / `src/modules.ts` (générés). Pas de publication npm, pas de merge, pas d'autre dépôt. Thème sombre des 13 autres modules : hors périmètre. Accessibilité : vrais `<button>` / `<a>`, `aria-label` sur les boutons icône, cibles ≥ 44 px, `aria-current`, `aria-expanded`.

Fini quand : `npm run verify` est vert ; la PR est ouverte vers `main` ; `docs/HANDOFF.md` (état + prochaine étape), `docs/JOURNAL.md` (entrée du jour, `**Tâches** : —`) et `README.md` (sous-chemins) sont à jour ; la PR liste ce qui est porté, les écarts avec GDC et la maquette, et ce qui reste.
