# `edge-kit` — ce que la recette NE PEUT PAS faire

> Versé dans le `docs/HANDOFF.md` §5 du projet à l'instanciation, et ouvert en
> entrée de `docs/BACKLOG.md` tant que ces points ne sont pas posés.
>
> Contrairement à `m365-auth`, un manque ici ne casse pas une fonctionnalité :
> il **ferme** l'accès. C'est voulu, et c'est ce qui le rend déroutant — une
> application qui « ne répond plus » alors que rien n'est en panne.

## 1. `ALLOWED_ORIGINS` dans **chaque** environnement déployé

🔴 **Le point le plus coûteux du lot, et il ne se voit pas au déploiement.**

Le socle est **fail-closed** : variable absente ⇒ aucune origine autorisée ⇒
la réponse ne porte **aucun** `Access-Control-Allow-Origin` ⇒ le navigateur
refuse la lecture. La fonction, elle, répond `200` : les journaux serveur sont
verts, et seule la console du navigateur parle.

| Symptôme | Cause réelle |
| --- | --- |
| « Failed to fetch » / « CORS policy » côté navigateur, alors que la fonction répond 200 dans les journaux | `ALLOWED_ORIGINS` absente ou ne contenant pas l'origine du frontal |
| Marche en local, pas en préproduction | la variable a été posée sur un projet et pas l'autre — elle est **par environnement** |
| Marche puis cesse après un changement d'hôte | l'origine du frontal a changé ; la liste porte l'ancienne |

**Le contrôle qui tranche** — il n'a pas besoin du front :

```bash
curl -s -D- -o /dev/null -X OPTIONS "$URL_FONCTION" \
  -H "Origin: https://app.exemple.fr" \
  -H "Access-Control-Request-Method: POST" | grep -i 'access-control-allow-origin'
```

Une ligne ⇒ l'origine est acceptée. **Aucune ligne ⇒ elle ne l'est pas**, et
c'est la réponse à la question, pas une erreur de commande.

⚠️ **Ce comportement diffère de celui d'APP-FACTU et d'APP-MSP avant adoption**,
où l'absence de variable rendait `*`. Un projet qui adopte le socle **doit**
poser la variable, sinon il se ferme. C'est l'arbitrage MOA du 2026-09-09, et
il ferme une tâche ouverte (« CORS ouvert en production »).

## 2. `SUPABASE_ANON_KEY` comme secret de fonction

`clientAppelant` en a besoin : c'est par elle que le jeton de l'appelant est
vérifié **auprès de Supabase**. Sans elle, `lireAppelant` échoue en
`config_error` (500) — pas en 401, ce qui est le bon signal : ce n'est pas
l'appelant qui est en faute.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont posées d'office par la
plateforme sur une Edge Function ; l'`ANON_KEY`, non.

## 3. La table `audit_log`, et sa contrainte

`ecrireAudit` écrit dans `public.audit_log` les colonnes `actor_id`, `action`,
`table_name`, `row_id`, `before`, `after`. **La recette ne pose aucune
migration** — manque connu du format, dit dans `recettes/README.md`.

Deux points à ne pas rater :

- la contrainte `CHECK` sur `action` doit admettre les huit valeurs du type
  `ActionAudit` (`insert`, `update`, `delete`, `login`, `logout`, `grant`,
  `revoke`, `invite`). Une valeur refusée ne casse rien à l'exécution —
  `ecrireAudit` ne lève jamais — donc **la trace disparaît en silence** ;
- pour que la déduplication des connexions serve, il faut un **index unique**
  sur ce qui identifie une connexion (typiquement `actor_id` + la session).
  Sans lui, `identifiantSessionDuJwt` est calculé pour rien : c'est l'index
  qui refuse le doublon, la garde `23505` ne fait que le taire.

## 4. ✅ Plus de `.npmrc`, plus de jeton — le socle est VENDORISÉ

> **Ce paragraphe a changé de sens le 2026-09-10.** Ce qui suit décrit l'état
> actuel ; l'ancien, celui du registre, est conservé plus bas parce qu'il
> explique pourquoi les projets antérieurs portent ces fichiers.

Le code du socle est **recopié dans le dépôt** (ADR-001 **D16**, retranchée le
2026-09-09), sous `supabase/functions/_shared/socle/`. Les colles du projet
l'atteignent par **chemin relatif**. Conséquence directe :

| Avant (registre) | Maintenant (vendoring) |
| --- | --- |
| un `.npmrc` **par configuration Deno**, jeton **en clair** | **aucun** |
| `npm run verify` exigeait un jeton `read:packages` | **vérifie hors ligne** |
| entrées `npm:@it-unify/…` dans chaque carte d'imports | **aucune** |

`ajouter-module` inscrit les sous-chemins dans `socle.json` ; c'est
`npm run socle:sync` — geste de **mainteneur**, jamais de build — qui recopie
le code, et lui seul qui demande un jeton.

### 🔴 Ce qui reste obligatoire : les spécificateurs NUS

`edge/auth` importe `@supabase/supabase-js` en **type seulement**. Hors de
`node_modules` — là où le vendoring copie — **Deno ne résout aucun
spécificateur nu tout seul**, `import type` compris. Il faut donc une entrée
de carte :

```json
{ "imports": { "@supabase/supabase-js": "npm:@supabase/supabase-js@2" } }
```

⚠️ **Dans CHAQUE carte du dépôt, pas dans une seule.** Un projet en a
couramment **deux** : celle du déploiement (`supabase/functions/deno.json`) et
celle de la porte (`scripts/deno-check.json`), qui doit en plus résoudre les
dépendances des tests. Poser l'entrée dans une seule laisse l'autre rouge, sur
un message qui **affirme que l'entrée manque alors qu'elle existe** — dans
l'autre fichier. Mesuré chez APP-FACTU le 2026-09-10.

✅ **`npm run socle:sync` les découvre toutes et nomme celles qui manquent**,
fichier par fichier. Le squelette livre déjà la carte du déploiement avec
`@supabase/supabase-js` et `jose`.

### ⚠️ Un quatrième emplacement, hors des cartes : `tsconfig.app.json`

Si le **front** inclut le dossier du socle en entier, `tsc -b` compile des
sous-chemins qu'il n'importe jamais et casse sur « Cannot find module ». La
carte d'imports ne sauve pas ce cas : elle ne vaut que pour Deno. Forme
attendue — celle du squelette — `include: ["src", "tests"]`, l'alias
`@socle/*` suffisant à atteindre la copie. `socle:sync` avertit si le projet
en dévie.

<details><summary>L'état d'avant, conservé — le registre et ses deux règles</summary>

### Le `.npmrc`, une fois par configuration Deno

> Règle mesurée le 2026-09-08, et elle surprend tout le monde une fois.

**Deno cherche le `.npmrc` à côté du fichier de configuration qu'on lui
donne** — pas dans le répertoire courant, et `NPM_CONFIG_USERCONFIG` n'y change
rien. Les deux ont été essayés.

Il en faut donc autant que de configurations Deno : un par dossier de fonction
pour le déploiement, **et un à côté de la configuration de la porte de
vérification** si elle tourne depuis la racine. Chacun porte le jeton
`read:packages` **en clair** — la forme `${VARIABLE}` est ignorée en silence —
et tous sont à gitignorer.

⚠️ **Conséquence à assumer : la porte de vérification du projet exige un
jeton.** Un poste sans jeton `read:packages` ne peut plus vérifier le projet.
C'est le prix du registre privé, et il se paie chez chaque adoptant.

`"minimumDependencyAge": 0` dans **chaque** configuration Deno : sans lui,
publier une version du socle rend la vérification rouge pendant 24 h.

### La carte d'import : un sous-chemin à la fois, jamais par préfixe

> Mesuré le **2026-09-09**, à la deuxième adoption (APP-MSP). Coût : un cycle
> de porte rouge, et un message qui ne dit pas quoi faire.

La tentation est d'écrire **une** entrée de carte d'import pour tout le paquet :

```json
"imports": { "@it-unify/boilerplate-kit/": "npm:@it-unify/boilerplate-kit@0.2.0/" }
```

**Deno refuse**, et le message est aussi précis qu'inhabituel :

```
Failed to resolve the specifier "@it-unify/boilerplate-kit/edge/auth" as its
after-prefix portion "edge/auth" could not be URL-parsed relative to the URL
prefix "npm:@it-unify/boilerplate-kit@0.2.0/"
```

Une entrée **par préfixe** ne sait pas prolonger un spécificateur `npm:`.
Il faut donc **une entrée par sous-chemin** utilisé :

```json
"imports": {
  "@it-unify/boilerplate-kit/edge/cors":       "npm:@it-unify/boilerplate-kit@0.2.0/edge/cors",
  "@it-unify/boilerplate-kit/edge/auth":       "npm:@it-unify/boilerplate-kit@0.2.0/edge/auth",
  "@it-unify/boilerplate-kit/edge/validation": "npm:@it-unify/boilerplate-kit@0.2.0/edge/validation"
}
```

**Ce n'est pas seulement un contournement, c'est mieux** : le numéro de version
ne vit qu'**ici**, et pas dans chaque fichier qui importe. Une montée de version
se fait en un endroit par configuration Deno.

⚠️ **À répéter dans CHAQUE configuration Deno du projet** — celle des fonctions
et celle de la porte de vérification. Une carte incomplète ne se voit pas au
déploiement : elle se voit au `deno check`, ou pire, à l'exécution.


⚠️ **Ces deux règles restent vraies pour qui consomme par le registre** — mais
plus aucun dépôt du parc ne le fait depuis le 2026-09-10.

</details>

## 4 ter. 🔴 Le message d'erreur appartient à l'ADAPTATEUR, pas au socle

Mesuré chez APP-FACTU le 2026-09-10, en adoptant `edge/mint-jwt` — et trouvé
par **un test qui a rougi, et qui avait raison**.

Le socle ne lit **jamais** l'environnement : c'est la règle qui le garde
testable hors Deno, et elle ne bouge pas. Conséquence directe, et elle n'avait
pas été énoncée :

> **Un module qui prend sa configuration en argument gagne en testabilité,
> mais perd la capacité de dire QUOI CORRIGER.**

`mintJwt` lève « Aucune clé de signature fournie (`jwkEs256` ou
`secretHs256`) » : il nomme **ses paramètres**, que personne ne peut poser
depuis l'extérieur. Or l'appelant ne fait souvent que **journaliser** ce
message — c'est donc la seule phrase qu'un humain lira quand la fonction se
taira, et elle doit nommer les **variables d'environnement** du projet.

**La forme retenue** : l'adaptateur porte **sa propre garde**, avant d'appeler
le socle, et son message parle le vocabulaire de l'exploitant.

```ts
// Adaptateur du projet — c'est LUI qui lit l'environnement, donc lui qui sait
// nommer ce qui manque.
const secret = Deno.env.get('PROJECT_JWT_SECRET');
if (!secret) {
  throw new Error(
    "PROJECT_JWT_SECRET absent des secrets de la fonction. " +
    "Le poser : supabase secrets set PROJECT_JWT_SECRET=… --project-ref <ref>",
  );
}
return mintJwt({ secretHs256: secret, /* … */ });
```

⚠️ **Sans cette garde, la panne est muette** : le socle lève un message exact
mais inactionnable, l'appelant le journalise, et personne ne sait quel secret
poser. C'est écrit ici pour que chaque projet ne le redécouvre pas par un test
rouge — ou, pire, par une panne en production.

**Écart mesuré à l'adoption des trois premiers modules chez APP-FACTU**, pour
calibrer le vôtre :

| Module | Écart réel (hors commentaires) | Forme retenue |
| --- | --- | --- |
| `edge/securite` | **2 lignes** (un `!`) | import direct — le nom coïncide, aucun adaptateur |
| `edge/mint-jwt` | **98 lignes** — `djwt` → `jose` | adaptateur : il lit l'environnement que le socle refuse de lire |
| `edge/validation` | 43 lignes, **noms francisés** | adaptateur de renommage — 15 appelants intacts |

⚠️ **`edge/auth` est d'un autre ordre** : chez APP-FACTU, **55 fichiers**
importent `_shared/auth.ts`, et `HttpError` seul apparaît dans **57**. Même
patron d'adaptateur, mais à cette échelle il mérite son propre lot et sa
propre recette.

## 5. La recette de vérification

Dans l'ordre, parce que chaque étape dépend de la précédente :

1. **CORS fermé** — `ALLOWED_ORIGINS` vide, l'appel depuis le front doit
   **échouer** côté navigateur alors que la fonction répond. Si ça passe, la
   configuration n'est pas celle qu'on croit.
2. **CORS ouvert à la bonne origine** — variable posée, l'appel passe, et
   l'en-tête `Vary: Origin` est présent.
3. **Origine inconnue refusée** — le `curl` du §1 avec une origine étrangère
   ne rend **aucun** `Access-Control-Allow-Origin`. C'est le contrôle qui
   prouve qu'il n'y a plus de `*` nulle part.
4. **Appelant sans jeton** → `401 unauthenticated`, message « En-tête
   Authorization manquant ou invalide. »
5. **Appelant avec un jeton expiré** → `401 unauthenticated`, message
   « Session invalide ou expirée. » Les deux messages diffèrent exprès : ils ne
   se corrigent pas de la même façon.
6. **Audit** — après une action auditée, la ligne existe avec le **bon
   acteur** (celui du jeton, jamais `service_role`). Si `actor_id` porte
   l'identifiant du service, la fonction a audité avec le mauvais client.
7. **Déduplication** — deux connexions dans la même session ne produisent
   qu'**une** ligne `login`. Zéro ligne signale l'index unique manquant (§3),
   deux lignes signalent `identifiantSessionDuJwt` non branché.

## 6. Ce que ce module ne porte PAS

**`requirePermission` est absent, et c'est écrit dans le module.** Il lit
`profiles.cached_permissions`, dont la forme diffère entre APP-FIX (tableau de
`"module:action"`) et APP-FACTU / APP-MSP (objet `{module: {action: 'all' |
'own'}}`). **ADR-001 D19** a tranché le modèle — une permission est un booléen
— mais la reprise du cache d'APP-FACTU n'est pas faite. Il arrivera avec le
sous-chemin `rbac`, après cette reprise. En attendant, chaque projet garde son
propre lecteur de permissions.

**Vu à la deuxième adoption** : chez APP-MSP, `requirePermission`,
`CachedPermissions`, `adminClient` et le client de l'appelant sont restés dans
`_shared/auth.ts`, qui n'est plus qu'une colle nommée. C'est la forme normale
d'une adoption de ce module — pas un travail à moitié fait.

⚠️ **Et un piège qui vaut d'être nommé, parce qu'il casse en silence.** Le
contrat d'erreur du socle s'appelle `statut` / `charge`. Un projet qui lisait
`status` / `payload` est tenté d'écrire une **sous-classe** locale pour garder
ses noms. **Ne pas le faire** : `err instanceof HttpErreurLocale` serait
**faux** pour une erreur levée par le socle — et `lireAppelant` en lève — donc
un `catch` laisserait filer un 401 vers son repli 500. Un **alias**
(`export { ErreurHttp as HttpError }`) garde `instanceof` vrai des deux côtés ;
les accès aux propriétés se reprennent, et le type-checker les trouve tous.

**`getPublicAppUrl()` est absent.** Les deux copies d'origine l'exposaient
depuis leur `cors.ts`, mais ce n'est pas du CORS : c'est la construction de
liens absolus, et les deux dépôts n'en tirent pas la valeur de la même
variable. Il reste chez le projet.
