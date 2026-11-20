# Handoff pour la session APP-GDC — charte partagée TEMPLATE-EPSS

Date : 2026-11-19, 17 h 25. Rédigé depuis la session APP-PLANNING.
À lire avant toute modification de la coque, des jetons ou des composants
`ui/` de GDC.

## 1. En une phrase

La charte ERP EPSS de GDC (coque, jetons, composants de base) a été **sortie
dans un paquet partagé**, `@it-unify/ui-epss`, dépôt privé
[IT-UNIFY/TEMPLATE-EPSS](https://github.com/IT-UNIFY/TEMPLATE-EPSS). APP-PLANNING
la consomme en premier ; GDC devra migrer dessus.

## 2. Pourquoi

- Le Planning (module « Planning », couleur framboise) reprend le même bandeau,
  le même menu et les mêmes jetons que GDC (module « Intervenant », cuivre).
  D'autres modules de l'ERP suivront.
- Recopier la coque de GDC dans chaque dépôt referait les copies divergentes
  décrites par l'ADR-001 d'APP-TEMPLATE.
- Décision : `TEMPLATE-EPSS/docs/adr/ADR-001-paquet-charte-erp-epss.md`.

## 3. Ce qui existe

| Élément | État | Où |
| --- | --- | --- |
| Jetons (`tokens.css`), 14 modules, `data-module="<id>"` | ✅ sur `main` | `styles/tokens-erp.css` (généré depuis la maquette) |
| Preset Tailwind v3 (`tailwind-preset`) | ✅ sur `main` | `tailwind-preset.js` |
| `theme.css` pour Tailwind v4 | 🚧 PR | [TEMPLATE-EPSS#1](https://github.com/IT-UNIFY/TEMPLATE-EPSS/pull/1) |
| Coque (`AppShell`, `AppBandeau`, `AppMenu`, hooks), `MenuParametres` | 🚧 PR | idem, sous-chemin `./coque` |
| Composants (`Bouton`, `BadgeEtat`, `Carte`, `Onglets`, `TuileChiffre`, `EnTetePage`) | 🚧 PR | idem, sous-chemin `./composants` |
| Publication sur GitHub Packages | ⬜ | aucune version publiée |

La PR #1 de TEMPLATE-EPSS a été écrite par une session cloud. `npm run verify`
est vert dans sa branche (156 tests), mais **personne ne l'a encore relue**.

## 4. Ce qui concerne GDC directement

### 4.1 La coque de GDC est la source du portage — à geler

- Copie de référence : `TEMPLATE-EPSS/reference/gdc-pre-prod-test/`, prise au
  commit `ad68cf2` de `pre-prod-test`.
- Vérifié à 17 h 20 : `git diff ad68cf2 origin/pre-prod-test` sur
  `src/components/layout`, `src/components/ui`, `src/styles`,
  `tailwind.config.js`, `EpssLogo`, `ThemeToggle` est **vide**. Rien n'a
  divergé.
- **Règle à partir de maintenant** : un correctif de la coque ou d'un
  composant de base se fait dans TEMPLATE-EPSS, pas dans GDC. Si un correctif
  urgent doit passer dans GDC avant la migration, le reporter aussi dans
  TEMPLATE-EPSS, dans le même jalon, et le noter dans le JOURNAL de GDC.

### 4.2 Noms et compatibilité

- Les variables CSS gardent **les noms de GDC** (`--erp-*-rgb`), et le preset
  garde les mêmes classes (`bg-module-action`, `text-encre`,
  `text-titre-page`…). La migration ne demande pas de renommer les classes.
- Le module se choisit par l'attribut `data-module` : GDC devra poser
  `data-module="intervenant"` sur `<html>`.
- Le thème sombre du paquet est **celui de GDC** (socle + Intervenant), repris
  tel quel. Les 13 autres modules n'ont pas encore de rôles sombres.
- **Typographie** : le paquet suit la maquette. GDC ajoute 1 px à chaque taille
  (AGENTS §10.2 de GDC). Pour garder ce choix : redéfinir `--erp-fs-*` et
  `--erp-lh-*` dans GDC.
- Le preset ne porte pas les anciens jetons propres à GDC (`surface`, `ink`,
  `border`, `epss-*`) : ils restent dans le `tailwind.config.js` de GDC.

### 4.3 Écarts de la coque portée avec celle de GDC (extrait de la PR)

- Pas de Font Awesome : les icônes du menu sont des `ReactNode`.
- Libellés par la prop `libelles` au lieu de `fr.shell` ; session par
  `utilisateur` / `onDeconnexion` au lieu de `useAuth` / `useDeconnexion`.
- `ErrorBoundary` et `BandeauHorsLigne` → props `limiteErreur` / `avantContenu`.
- `useHubEntries` (choix des entrées selon le rôle) **reste chez GDC**.
- Clé du menu replié paramétrable : GDC passe `ogc.menu.replie` pour garder le
  choix déjà mémorisé par ses utilisateurs.
- `font-display` → `font-erp` ; logo EPSS en SVG au lieu des PNG
  `public/brand/`.
- Visuel aligné sur la maquette : disque du logo de module en haut à droite,
  onglet actif en `module-action` / `module-foncee`, badges en pastille, tuile
  de chiffre de la maquette L1 au lieu de `QuickStat`.
- Deux points à trancher : taille du titre de page (26 px dans la maquette
  Planning, 32 px avec le jeton) ; libellé et état par défaut du menu replié
  (GDC : « Replier », déplié ; maquette : « Réduire », replié).

### 4.4 Ce que la migration de GDC demandera (plus tard, pas maintenant)

1. Attendre la fusion de TEMPLATE-EPSS#1 et la publication de `0.1.0`.
2. Poste : jeton `read:packages` pour installer depuis GitHub Packages. Le jeton
   `gh` du poste n'a aujourd'hui que `admin:public_key, gist, read:org, repo`.
   Pour l'ajouter : `gh auth refresh -h github.com -s read:packages`. Pour la
   construction (Docker), se demander s'il faut vendoriser comme le socle
   (ADR-001 D16 d'APP-TEMPLATE) plutôt que demander le jeton dans l'image.
3. Remplacer `src/styles/tokens-erp.css` par `@it-unify/ui-epss/tokens.css`, et
   ajouter le preset au `tailwind.config.js`, avec
   `node_modules/@it-unify/ui-epss/dist/**/*.js` dans `content`.
4. Remplacer `src/components/layout/shell/*` par `@it-unify/ui-epss/coque`, en
   branchant `libelles`, `utilisateur`, `onDeconnexion`, `limiteErreur`,
   `avantContenu` et `useHubEntries`.
5. Remplacer, un par un, les composants `ui/` qui ont un équivalent.
6. Écrire l'ADR de migration côté GDC, qui renvoie à l'ADR-001 de
   TEMPLATE-EPSS et à l'ADR-047 de GDC.

## 5. Ce que le Planning attendra de GDC (ADR-001 d'APP-PLANNING, **proposé**)

Source : `APP-PLANNING/docs/adr/ADR-001-donnees-planning-et-modules-erp.md`,
relu contre le carnet de conception du Planning
(https://claude.ai/artifact/MHDtYossAju15FJ6q1Uujg). Rien à faire dans GDC
avant que cet ADR soit accepté.

- **Bases séparées** : le Planning a son propre projet Supabase
  (`yvuutsniduqqinkowqkc`). Aucun module n'écrit dans la base d'un autre.
- **GDC lit le Planning** par une Edge Function, avec un rôle Postgres qui n'a
  que `select` sur le schéma `api_v1` du Planning. Le navigateur de GDC
  n'appelle jamais le Planning.
- **Le Planning lit GDC** de la même façon : GDC exposera un schéma `api_v1`
  avec une vue minimale des intervenants (`aurion_individu_id`, existence de la
  fiche, nom affiché). Elle sert à l'anomalie « Intervenant sans fiche » et au
  rôle « intervenant », que le carnet fait donner par l'outil Intervenant.
- **« Mon planning »** : écran fourni par le Planning sous forme de composant
  React (paquet `@it-unify/planning-ecrans`), **monté dans l'espace
  intervenant de GDC**. GDC lui passe les données via son Edge Function,
  filtrées par l'`aurion_individu_id` de l'intervenant connecté. Repli prévu
  par le carnet : si le lot 1 n'est pas prêt le 11/01/2027, le lien WebAurion
  reste.
- **Contrats et paie** : GDC rattache contrat et état de paie à l'**UUID de
  l'affectation** du Planning (une ligne intervenant × intervention). **Pas de
  copie** des séances dans GDC : le Planning garde un historique daté et permet
  de lire une affectation « telle qu'elle était le jour J ». Le modèle des
  affectations est encore « proposé, à valider » dans le carnet.
- **Aurion** : le Planning devient le seul importateur des séances. Le client
  Aurion de GDC (identifiants en base, appel du favori, transformation) doit
  passer dans un paquet de TEMPLATE-EPSS avant que le Planning écrive son
  import. Les DPAE de GDC **gardent leur requête actuelle** jusqu'à leur
  bascule, qui fera l'objet d'un ADR chez GDC.

## 6. À faire dans la session GDC

- [ ] Prendre connaissance de la règle de gel de la coque (§4.1) et l'écrire
      dans l'`AGENTS.md` ou le `HANDOFF.md` de GDC.
- [ ] Relire TEMPLATE-EPSS#1 du point de vue de GDC : les écarts du §4.3
      sont-ils acceptables ? Trancher les deux points ouverts.
- [ ] Noter dans le `BACKLOG.md` de GDC : migration vers `@it-unify/ui-epss`
      (§4.4), schéma `api_v1` côté GDC et montage de « Mon planning » (§5),
      extraction du client Aurion (§5).
- [ ] Ne rien démarrer du §5 avant l'acceptation de l'ADR-001 d'APP-PLANNING.

## 7. Pour info

- Le socle d'APP-TEMPLATE annonce `boilerplate-kit@0.2.0` dans son squelette.
  Cette version ne publie pas `src/` et ne peut pas être vendorisée :
  APP-PLANNING utilise `0.3.0`. À remonter à APP-TEMPLATE si GDC rencontre le
  même cas.
- Réseau : TEMPLATE-EPSS n'a pas de base de données. Côté Planning, les
  migrations passent par `db-push.yml` sur le runner GitHub (pas de partage de
  connexion). Le chemin a été prouvé le 2026-11-19 : `link` réussi, run `plan`
  vert, « Remote database is up to date ».
