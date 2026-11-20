# ADR-002 — Schéma du lot 1 : historique par trigger, `api_v1`, `lecteur_gdc`

- Statut : **accepté** (2026-11-20). Il met en œuvre l'ADR-001, encore
  « proposé » : seul le point « coût » y reste ouvert, et il ne change pas ce
  schéma.
- Décideur : Hakim ABDOUROIHAMANE.
- Met en œuvre : [ADR-001](ADR-001-donnees-planning-et-modules-erp.md) (D2, D3,
  D5, D6). Plan rédigé par `lead-dev`, arbitré par l'utilisateur le
  2026-11-20.

## Contexte

L'ADR-001 fixe le **quoi** : contrat de lecture `api_v1`, lecture de serveur à
serveur, affectations à UUID stable, pas de suppression, historique daté et
pas de copie chez le lecteur. Cet ADR fixe le **comment** pour la première
migration.

Faits mesurés le 2026-11-20 :

- La base distante (`yvuutsniduqqinkowqkc`) est vide. `supabase/migrations/`
  ne contenait que `.gitkeep`.
- Le code vendorisé du socle (`m365-login-callback`, `_shared/socle/`) appelle
  `profiles`, `m365_tenants`, `audit_log` et trois RPC M365. Aucune de ces
  tables n'existait.
- Le paquet `@it-unify/rbac` cité par `AGENTS.md` §9 ne livre aucun SQL.
- Le mode `plan` de `db-push.yml` ne faisait qu'un `db push --dry-run` : avec
  un projet unique, le premier passage réel du SQL aurait eu lieu en prod.
- Piège de vocabulaire (APP-GDC, `aurion_dpae_intake`) : l'« intervention »
  d'Aurion (`id.Intervention`) est une ligne **par individu**. Elle correspond
  à notre **affectation**. Notre **intervention** est la séance.

## Décisions

### D1 — Le modèle des affectations est validé

Une ligne par intervenant × intervention, avec un UUID stable. C'était le
préalable de l'ADR-001 (« Avant d'accepter », point 2). Validé par
l'utilisateur le 2026-11-20.

- `statut` suit le carnet : `prevu`, `ajoute`, `annule`, `remplace`, `retire`.
- `statut_aurion` garde la valeur brute d'Aurion (dont « réalisé »).
- `role` est facultatif : `principal`, `co_intervenant`, `soutien_interne`,
  `remplacant`.
- `remplacee_par` reste vide tant qu'Aurion ne donne pas le lien. **Rien n'est
  déduit** : un faux lien entrerait dans une preuve qui n'est jamais réécrite.
- Changer ces valeurs après la publication de `api_v1` demande un `api_v2`.

### D2 — L'historique est écrit par trigger, en ajout seul

- Un trigger `AFTER INSERT OR UPDATE` sur `interventions` et `affectations`
  copie la ligne dans `*_historique` **seulement si** une colonne suivie
  change. La preuve ne dépend donc pas du code de l'import, et elle restera
  valable quand la saisie arrivera au lot 2.
- Une mise à jour sans changement n'écrit rien et ne touche pas
  `updated_at` : le compteur « modifiées » de l'import reste exact.
- L'import passe son identifiant par `set_config('planning.import_id', …,
  true)`. ⚠️ Ce réglage ne vit que le temps d'une transaction, et chaque
  requête PostgREST est sa propre transaction : l'import doit donc écrire par
  **une seule RPC plpgsql** qui pose `planning.import_id` puis fait ses
  écritures. Un `rpc('set_config')` suivi d'un `.upsert()` donnerait
  `import_id = NULL` sur toutes les versions.
- Les tables d'historique refusent `UPDATE`, `DELETE` et `TRUNCATE`, par
  trigger (ce qui vaut aussi pour la `service_role`) et par `revoke` nominatif
  (`AGENTS.md` §4 bis). `DELETE` est aussi refusé sur `interventions` et
  `affectations`.
- Limite assumée : le propriétaire `postgres` peut désactiver un trigger.
- La date qui fait foi est l'**heure de transaction du Planning** (« ce que le
  Planning savait le jour J »). `aurion_maj_le` est gardé à titre
  d'information.

### D3 — L'état à une date est une vue

`api_v1.affectations_historique` calcule `valide_jusqua` avec `lead()`. Le
lecteur filtre sur `valide_depuis <= J` et `(valide_jusqua is null or
valide_jusqua > J)`. C'est une vue et non une fonction, parce que l'ADR-001
(D2) limite `api_v1` à des vues.

### D4 — `api_v1` : vues `security_invoker`, droits par colonne

Les vues `api_v1` sont `security_invoker = true`. Elles s'exécutent donc avec
les droits du lecteur, et la RLS des tables s'applique.

Conséquence : `lecteur_gdc` reçoit `select` **sur les seules colonnes
exposées** des tables sources, plus une politique RLS dédiée. Cela corrige
l'ADR-001, qui disait que le rôle technique ne reçoit aucun droit sur
`public`. L'autre option, des vues sans `security_invoker`, contournerait la
RLS, et l'outil de conseils de Supabase la signale comme un risque.

`api_v1` ne contient aucun nom de personne : GDC a les siens.

### D5 — `lecteur_gdc` : rôle sans connexion, lu par une Edge Function

- La migration crée `lecteur_gdc` en `NOLOGIN NOINHERIT`, sans mot de passe,
  et l'accorde à `authenticator`.
- GDC appelle une Edge Function du Planning avec une clé qui lui est propre.
  La fonction interroge `api_v1` avec `role=lecteur_gdc`.
- Il n'y a ni mot de passe Postgres ni secret de signature partagé entre les
  deux projets. Cette Edge Function n'est pas dans la première migration.

### D6 — Rôles applicatifs minimaux

Deux tables, `roles` et `user_roles`, avec `admin_planning` et
`lecteur_interventions`. Un retrait pose `revoque_le` et ne supprime pas la
ligne (maquette « Utilisateurs et accès »). Une fonction `a_role(text)`
(`security definer`, `search_path` vide) sert aux politiques RLS.

Aucune politique d'écriture pour `authenticated` : l'import, l'ajout de
personnes et les changements de rôle passent par des Edge Functions.

### D7 — Une répétition sur base jetable avant toute écriture distante

En mode `plan`, et avant tout `apply`, `db-push.yml` démarre une base jetable
sur le runner GitHub. Il y applique toutes les migrations, puis lance les
tests pgTAP de `supabase/tests/`. Un échec arrête le run avant toute écriture
sur le projet. La base jetable utilise les versions d'images du projet lié
(`supabase link` les note dans `supabase/.temp/`).

Une dernière migration d'assertions lève une exception si une table n'a pas de
RLS, si `anon` peut exécuter une fonction, ou si un historique accepte une
modification. **Une seule exception est admise et nommée** :
`m365_tenant_for_email`, que la page de connexion appelle avant toute session
(`docs/PREREQUIS-m365-auth.md` §3).

⚠️ **Limite de la répétition, mesurée au premier apply (2026-11-20, run
`44720952788`).** La base jetable a la même image que le projet, mais pas ses
objets propres. Le projet hébergé porte `public.rls_auto_enable()`, une
fonction de Supabase (déclencheur d'événement `ensure_rls`, qui active la RLS
des nouvelles tables), exécutable par `anon`. La répétition est passée,
l'assertion « anon n'exécute rien » a échoué en prod, et l'apply s'est arrêté
après la 7e migration : le garde-fou a joué son rôle. Correction :
l'assertion ignore les fonctions qui renvoient `trigger` ou `event_trigger`,
que personne ne peut appeler hors d'un déclencheur. La version corrigée a été
jouée en lecture seule sur la base réelle avant d'être poussée.

### D8 — L'import passe par une seule RPC, `importer_seances` (2026-11-20)

Ajout du 2026-11-20 (migration `20261120120000`), conséquence de la note de
D2 : `public.importer_seances(p_lignes jsonb, p_declenchement, p_lance_par)
returns uuid`, `security invoker`, exécutable par `service_role` seulement.
En une transaction : ligne `imports_aurion`, `planning.import_id`, mise à jour
des référentiels, des séances, des liens avec les groupes et des
affectations, retraits, anomalies, compteurs lus dans l'historique écrit par
cet import.

- Un seul import à la fois : verrou consultatif essayé sans attendre, refus
  en `55P03`. L'index unique « un seul en cours » ne suffit pas : la ligne
  `en_cours` n'est visible d'aucune autre session tant que la transaction
  n'est pas validée.
- Aucune table ni aucun type créé par la fonction : rien à traiter pour le
  déclencheur d'événement `ensure_rls` du projet (voir D7).
- Les règles fonctionnelles non tranchées sont **provisoires** et marquées
  dans le SQL : questions Q6 à Q14 de `docs/QUESTIONS.md`.

## Conséquences

- **Positives** : la preuve vit dans la base et non dans le code de l'import ;
  le SQL est exécuté avant la prod alors que le projet n'a pas de préprod ;
  les droits sont vérifiés par les tests pgTAP à chaque répétition. Sur la
  base réelle, la migration d'assertions ne tourne qu'une fois : une
  migration suivante n'y est vérifiée que par la répétition.
- **Négatives** : la répétition coûte des minutes d'Actions à chaque `plan`
  (non mesuré au moment de l'ADR) ; deux tables d'historique grossissent sans
  fin (c'est une preuve, on ne purge pas) ; les codes affichés `ITV-` et
  `AFF-` attendent la nomenclature V-12 du carnet.
- **Limites connues, notées au backlog** : un changement des groupes d'une
  séance (`intervention_groupes`) ne laisse pas de trace d'historique ;
  `public` est exposé par l'API du projet (défaut Supabase), donc un jeton
  `lecteur_gdc` **peut déjà** lire en direct les colonnes qui lui sont
  accordées dans `public` (REST et GraphQL). Ce ne sont que les colonnes déjà
  visibles dans `api_v1`, donc pas une fuite, mais la base n'impose pas « ne
  lisent jamais `public` » (ADR-001 D2) : c'est la discipline de l'Edge
  Function de lecture qui le fait ; `api_v1.changements` date à l'heure
  de transaction, donc un lecteur relit avec une marge.
- **Plus strict que le plan** : seul le trigger écrit l'historique (même la
  `service_role` ne peut pas y insérer) ; `audit_log` est aussi en ajout seul ;
  l'UUID d'une ligne ne change jamais ; une affectation ne change ni de séance
  ni de personne (un remplacement crée une nouvelle ligne).
- **Hors de cette migration** : identifiants Aurion en base et cron d'import,
  Edge Function de lecture pour GDC, lecture de l'`api_v1` de GDC (anomalie
  « Intervenant sans fiche »), règle de décompte des heures par affectation.

## Références

- ADR-001 de ce dépôt ; carnet de conception du Planning, section « Lot 1 ».
- `AGENTS.md` §3, §4 et §4 bis.
- APP-GDC : `supabase/migrations/20260615120000_aurion_dpae_intake_init.sql`
  (vocabulaire Aurion).
