# ADR-001 — Données du Planning : une base propre, une API de lecture pour les autres modules

- Statut : **proposé** (2026-11-19). Il passe à « accepté » quand les points
  de la section « Avant d'accepter » sont faits.
- Décideur : Hakim ABDOUROIHAMANE
- Portée : APP-PLANNING (module Planning) et APP-GDC (module Intervenant).
  D1, D2, D4 et D6 valent pour tous les modules de l'ERP EPSS. Au troisième
  module qui les applique (l'outil Enquêtes et « Mes questionnaires » sont le
  prochain cas connu), elles passent dans `docs/adr/` du dépôt TEMPLATE-EPSS,
  et cet ADR y renvoie.

## Contexte (mesuré le 2026-11-19)

### Ce que le carnet de conception décide

Source : [Carnet de conception : Planning](https://claude.ai/artifact/MHDtYossAju15FJ6q1Uujg),
lu le 2026-11-19 (rév. 41). Le carnet « fait foi sur ce que l'outil fait ».

- **Principes de l'ERP** (section « Objet ») : chaque outil possède ses
  données, et les autres les lisent sans copie ; une fonction n'existe que dans
  un seul outil ; un outil fonctionne seul. Le journal des décisions ajoute :
  un seul propriétaire par donnée.
- **Lot 1** (décidé le 19/11/2026, visé pour janvier 2027) : consultation en
  lecture seule des séances saisies dans Aurion. Un seul sens, d'Aurion vers le
  Planning. Le lot 1 utilise **la même base, le même modèle et les mêmes
  identifiants stables que l'outil complet** ; le code Aurion est gardé comme
  ancien code.
- **Un seul import** : il se fait dans le Planning, qui devient propriétaire des
  séances. À terme, les DPAE liront le Planning. Pour la première livraison,
  les DPAE gardent leur requête vers Aurion (double requête provisoire,
  décidée le 19/11/2026). La requête Aurion du lot 1 est écrite par l'EPSS, à
  partir de celle des DPAE.
- **« Mon planning »** (validé le 19/11/2026) : écran fourni par le Planning et
  affiché dans l'espace intervenant, sans changer d'outil ni d'onglet, sans
  nouvelle connexion. C'est le même principe que « Mes questionnaires »,
  fourni par l'outil Enquêtes. Si le lot 1 n'est pas prêt à l'ouverture de
  l'outil Intervenant (11/01/2027), « Mon planning » garde le lien vers
  WebAurion.
- **Contrats et avenants** : la gestionnaire RH les traite dans l'outil
  Intervenant, qui lit les interventions du Planning.
- **Affectations** (proposé le 19/11/2026, à valider) : sous chaque
  intervention, une ligne par intervenant, avec son propre identifiant stable
  et son statut (prévu, ajouté, annulé, remplacé, retiré), avec la date du
  changement. Le Planning possède l'intervention et ses affectations. L'outil
  Intervenant rattache à l'identifiant de l'affectation le contrat et l'état de
  paie.
- **Droits** : chaque outil gère ses propres droits ; l'outil SI ne les
  attribuera que plus tard. Les rôles du lot 1 sont : administrateur du
  Planning, lecteur des interventions, et intervenant, **donné par l'outil
  Intervenant**.
- **Données de référence** : les statuts et la grille des tarifs appartiennent
  à l'outil Intervenant, et le Planning les lit. Deux questions restent
  ouvertes dans le carnet : où tenir la hiérarchie des groupes (Planning, ou
  référentiel du CRM en attendant), et où vit la confirmation de
  l'intervention (Planning ou outil Intervenant).

### Ce que GDC a déjà (branche `pre-prod-test`, lue le 2026-11-19)

- Les identifiants Aurion en base, modifiables depuis l'administration
  (ADR-021 de GDC).
- L'import depuis un favori Aurion, par cron et à la demande (ADR-020,
  ADR-034), dans 11 Edge Functions qui parlent à Aurion.
- La clé `aurion_individu_id` sur `aurion_dpae_intake` et
  `aurion_dpae_dossiers`, avec une contrainte unique
  `(aurion_individu_id, intervention_date)` : une DPAE par journée (ADR-045).
- 177 fichiers de migration, appliqués par son propre chemin.
- Aucun mécanisme d'écran fourni par un autre outil n'existe encore :
  « Mes questionnaires » est noté hors périmètre dans l'ADR-047 de GDC.

## Problème

Le carnet fixe le **quoi** : chaque outil possède ses données, les autres les
lisent sans copie, et « Mon planning » est fourni par le Planning sans
reconnexion. Il reste à fixer le **comment**, sans :

1. deux chemins d'écriture du même schéma (`AGENTS.md` §4 ; APP-FIX, ADR-029 :
   une divergence d'historique de migrations a gelé sa prod pendant trois
   mois) ;
2. un couplage de déploiement, où une migration d'un module casse l'autre ;
3. une perte de preuve : un contrat ou une DPAE doit rester justifiable même si
   la séance change ensuite, **sans** que l'outil Intervenant en garde une
   copie.

## Décisions

### D1 — Un projet Supabase par module, propriétaire de ses données

Le Planning a son propre projet Supabase (préprod + prod). Il est le **seul à
écrire** les interventions et les affectations. GDC reste le seul à écrire les
intervenants, les contrats, l'état de paie et les DPAE. **Aucun module n'écrit
dans la base d'un autre.** C'est la traduction technique des principes du
carnet : un propriétaire par donnée, un outil qui fonctionne seul.

### D2 — Le contrat de lecture est un schéma `api_v1`, versionné

Le Planning expose ses données aux autres modules par un schéma `api_v1` qui
ne contient que des **vues en lecture seule**. Les autres modules ne lisent
jamais les tables du schéma `public`.

- Vues prévues pour le lot 1 : `api_v1.interventions`, `api_v1.affectations`,
  `api_v1.affectations_intervenant` (filtrée par `aurion_individu_id`, pour
  « Mon planning » et les contrats), `api_v1.changements` (flux par
  `updated_at`, retraits compris).
- Une colonne retirée ou un sens qui change = `api_v1` gelé et nouveau
  `api_v2`. Ajouter une colonne ne demande pas de nouvelle version.
- Chaque vue porte un `comment on view` qui dit son sens et ses clés.

### D3 — Lecture de serveur à serveur, avec une identité technique

GDC lit `api_v1` depuis une **Edge Function**, avec une identité technique
propre à GDC : un rôle Postgres dédié qui n'a que `select` sur `api_v1`, et
**pas** la `service_role` du Planning. Le navigateur de GDC n'appelle jamais
le Planning directement.

Le sens inverse suit la même règle. Le Planning lit dans un schéma `api_v1` de
GDC une vue minimale des intervenants (`aurion_individu_id`, existence de la
fiche, nom affiché). Elle sert à deux choses : l'anomalie « Intervenant sans
fiche » et le rôle « intervenant », que le carnet fait donner par l'outil
Intervenant.

### D4 — « Mon planning » : un écran fourni par le Planning, monté dans GDC

Le carnet demande un écran fourni par le Planning, affiché dans l'espace
intervenant sans changer d'onglet ni se reconnecter. Mise en œuvre :

- Le Planning publie l'écran sous forme de **composant React dans un paquet
  npm** (`@it-unify/planning-ecrans`, construit dans ce dépôt). Il utilise la
  charte `@it-unify/ui-epss`.
- GDC monte ce composant dans son espace intervenant. Le composant ne connaît
  pas le Planning : il reçoit une fonction de chargement des données.
- GDC fournit ces données par sa propre Edge Function, qui applique D3. Elle
  filtre par l'`aurion_individu_id` de l'intervenant connecté, lu dans **son**
  identité vérifiée, jamais dans un paramètre envoyé par le navigateur.
- L'intervenant n'a donc **aucun compte dans le Planning** au lot 1. C'est
  cohérent avec `POLITIQUE_LIAISON=refuser` du module `m365-auth`, qui ne vaut
  que pour les salariés.
- Une nouvelle version de l'écran arrive dans GDC par une montée de version du
  paquet. C'est le prix de « sans nouvelle connexion » sans SSO entre projets.

Ce mécanisme est le premier de son genre dans l'ERP. « Mes questionnaires »
(outil Enquêtes) devra suivre le même modèle, ou en justifier un autre.

### D5 — Les clés, et rien ne s'efface

- **Personne** : l'ID de la fiche individu Aurion (`aurion_individu_id`, texte,
  même nom et même type que chez GDC).
- **Intervention** et **affectation** (une ligne intervenant × intervention) :
  chacune a un UUID du Planning qui ne change jamais. L'identifiant et le code
  Aurion sont gardés comme anciens codes, et on peut chercher par eux. Le
  format affiché des identifiants attend la nomenclature des codes (V-12 du
  carnet).
- **Pas de suppression physique.** Une séance retirée d'Aurion passe à l'état
  « retirée » (carnet). Chaque ligne a un `updated_at`, et `api_v1.changements`
  permet à un lecteur de se mettre à jour par étapes.

### D6 — Pas de copie chez le lecteur : le Planning garde l'historique daté

Le carnet dit : « les autres les lisent sans copie ». L'outil Intervenant
garde donc seulement **l'UUID de l'affectation**, à côté de ses propres
données (contrat, état de paie, DPAE).

En échange, le Planning garantit la preuve :

- chaque changement d'une affectation (statut, intervenant remplacé, date,
  horaires) est **enregistré avec sa date** dans une table d'historique, qui
  n'est jamais réécrite ;
- `api_v1` permet de lire **l'état d'une affectation à une date donnée**. Un
  contrat ou une DPAE se justifie ainsi par « l'affectation X telle qu'elle
  était le jour J ».

### D7 — Un seul import Aurion, un client Aurion partagé

- Le Planning est le **seul importateur des séances** (carnet). La requête
  Aurion est écrite par l'EPSS ; le Planning lit son résultat.
- Le code client Aurion de GDC (lecture des identifiants, appel du favori,
  transformation) passe dans un paquet partagé du dépôt TEMPLATE-EPSS : un
  sous-chemin serveur de `@it-unify/ui-epss`, ou un paquet frère si la
  séparation entre front et serveur le demande. Il suit les contraintes Deno de
  l'ADR-001 d'APP-TEMPLATE (D4) : JS compilé, aucun import par URL, aucune
  lecture de l'environnement dans le paquet.
- GDC garde son import DPAE actuel jusqu'à la bascule des DPAE sur le Planning
  (carnet). Cette bascule fera l'objet de son propre ADR, chez GDC.
- Les identifiants Aurion du Planning sont stockés dans **sa** base, selon le
  modèle de l'ADR-021 de GDC. Pas de partage de secret entre projets.

## Conséquences

**Positives**

- Les principes du carnet ont une traduction technique vérifiable : un
  chemin d'écriture du schéma par dépôt, aucune écriture croisée, aucune copie.
- Une migration du Planning ne peut casser GDC que si elle touche `api_v1`, et
  `api_v1` est versionné.
- La frontière se teste comme un contrat : vues `api_v1` et composant
  « Mon planning ».
- Le même modèle sert à l'outil Enquêtes et aux modules suivants.

**Négatives**

- Pas de jointure SQL entre modules. Tout croisement passe par une Edge
  Function, avec un aller-retour réseau. Sans copie (D6), l'écran des contrats
  de GDC dépend de la disponibilité du Planning.
- Un projet Supabase de plus (deux avec la préprod). Coût **non mesuré** : voir
  « Avant d'accepter ».
- Deux identités techniques à gérer (GDC → Planning, Planning → GDC), avec la
  rotation de leurs secrets.
- Une nouvelle version de « Mon planning » demande une montée de version dans
  GDC (D4).

**Points d'attention**

- Les vues `api_v1` s'exécutent avec les droits du lecteur
  (`security_invoker = true`). Le rôle technique ne reçoit aucun droit sur
  `public`.
- `api_v1` n'expose aucune donnée personnelle dont le lecteur n'a pas besoin.
- La table d'historique de D6 grossit sans fin : à surveiller, pas à purger
  (c'est une preuve).

## Avant d'accepter

1. **Coût** : vérifier l'offre Supabase de l'organisation et le nombre de
   projets déjà utilisés, puis noter le coût mensuel ajouté.
2. **Affectations** : le modèle est « proposé, à valider » dans le carnet. Il
   doit être validé avant la première migration, car D2, D5 et D6 en
   dépendent.
3. **Questions ouvertes du carnet qui touchent cet ADR** : où vit la
   confirmation de l'intervention (Planning ou outil Intervenant), et où se
   tient la hiérarchie des groupes. Aucune ne bloque le lot 1 : il importe les
   groupes « tels que dans Aurion », sans arborescence.

## Alternatives écartées

- **Une base commune, un schéma par module** (un seul projet Supabase pour
  l'ERP). Écartée : deux dépôts qui appliquent leurs migrations au même projet
  se gênent. `supabase db push` refuse de pousser quand la base contient des
  versions de migration absentes du dépôt local. Il faudrait des réparations
  d'historique en continu, ou un dossier de migrations commun aux deux dépôts.
  Les déploiements seraient aussi couplés. Elle reste envisageable si l'ERP
  passe un jour à un seul dépôt.
- **L'outil Intervenant garde une copie des séances qu'il utilise comme
  preuve.** Proposée dans la première version de cet ADR, puis écartée après
  lecture du carnet : elle contredit « les autres les lisent sans copie ».
  L'historique daté du Planning (D6) remplit le même besoin.
- **« Mon planning » dans une iframe servie par le Planning**, avec une
  connexion Microsoft 365 silencieuse. Écartée pour le lot 1 : elle donne un
  compte Planning à chaque intervenant, dépend des cookies tiers entre deux
  domaines et ajoute un SSO entre projets. Le paquet de D4 suffit.
- **GDC dessine lui-même « Mon planning »** à partir de l'API. Écartée : le
  carnet dit que l'écran est fourni par le Planning, et une fonction n'existe
  que dans un seul outil.
- **Le Planning écrit directement dans la base de GDC** (réplication par push).
  Écartée : deux écrivains sur les mêmes tables.
- **Chaque module importe Aurion de son côté.** Écartée par le carnet (« un
  seul import ») et par l'ADR-001 d'APP-TEMPLATE (copies qui divergent).

## Hors périmètre

- La bascule des DPAE sur le Planning (ADR à venir chez GDC).
- Le lot 2 (Planning complet : catalogue, salles, calendriers) et ses données
  de référence.
- La publication dans l'agenda Microsoft 365 (lot 2, selon le carnet).

## Références

- Carnet de conception : Planning,
  https://claude.ai/artifact/MHDtYossAju15FJ6q1Uujg (rév. 41) : sections
  « Objet », « Lot 1 », « Journal des décisions », « Questions ouvertes ».
- Maquette Planning lot 1 : `mockups/maquette-planning/`,
  https://claude.ai/artifact/Mo76MtNVbCFSe3gouryR37
- APP-GDC (`pre-prod-test`) : ADR-020, ADR-021, ADR-034, ADR-045, ADR-047.
- APP-FIX : ADR-029 (chemin unique de migration).
- APP-TEMPLATE : ADR-001 (paquets partagés, contraintes Deno D4).
- TEMPLATE-EPSS : ADR-001 (paquet `@it-unify/ui-epss`).
