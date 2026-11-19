# `m365-auth` — ce que la recette NE PEUT PAS faire

> Versé dans le `docs/HANDOFF.md` §5 du projet à l'instanciation, et ouvert en
> entrée de `docs/BACKLOG.md` tant que ces points ne sont pas posés.
>
> **Tant qu'ils manquent, la connexion Microsoft 365 ne fonctionne pas.** Le
> code est en place et les fichiers sont posés : c'est exactement la situation
> qu'ADR-001 D18 appelle « un projet qui a l'air prêt et ne l'est pas ».

## 1. L'inscription d'application Entra

À faire dans le portail Entra du locataire, par un administrateur.

- **URI de retour** de type **Web** (pas SPA — l'échange du code se fait côté
  serveur), exactement la valeur de `M365_REDIRECT_URI`. **Au caractère près** :
  toute différence sort en `AADSTS50011`.
- **Consentement administrateur délégué** sur
  `openid`, `email`, `profile`, **`User.Read`**.
  `User.Read` n'est pas optionnel : le serveur appelle Graph `/me` pour
  l'adresse et l'identifiant Microsoft.
- Une **clé secrète client**, à poser en Vault (§2). Noter sa date
  d'expiration : une clé Entra expire, et le symptôme est une connexion qui
  cesse de fonctionner du jour au lendemain.

⚠️ **Le piège le plus coûteux du lot.** Si la portée présentée à l'autorisation
diffère de celle envoyée à l'échange, Entra répond `AADSTS65001`, que Microsoft
remonte sous `invalid_grant` — **un message qui parle de code expiré et
n'évoque jamais un consentement manquant**. Le socle supprime la cause côté
code (un seul littéral de portée) ; il ne peut rien contre un consentement
absent côté Entra.

## 2. Les clés secrètes

| Secret | Où | Note |
| --- | --- | --- |
| Clé cliente Entra, par locataire | **Vault**, jamais dans une table | Le code la lit par RPC, ne la rend jamais au navigateur |
| Jeton `read:packages` | `.npmrc` du dossier de la fonction | **En clair** — la forme `${VARIABLE}` est ignorée en silence par Deno |
| `SUPABASE_SERVICE_ROLE_KEY` | secret de la fonction | Sert à lire le Vault et administrer les comptes |
| `ALLOWED_ORIGINS` | secret de la fonction | Sans lui, le CORS de la fonction refuse tout — c'est voulu |

## 3. Les tables et leurs droits

La recette **ne pose aucune migration** — c'est un manque connu du format, dit
dans `recettes/README.md`. À écrire à la main, d'après le schéma d'APP-FACTU :

- **`m365_tenants`** — `id`, `tenant_id`, `client_id`, `purpose` (tableau, doit
  contenir `login`), `email_domains` (tableau).
- **la RPC d'aiguillage** — rend le triplet pour une adresse, exécutable par
  `anon` : la question se pose **avant** toute session. Elle ne doit rendre un
  locataire que si le domaine est déclaré **ET** la clé posée **ET** `login`
  dans `purpose`.
- **la RPC de lecture du secret** — `service_role` uniquement.
- **`profiles.is_active`** et **`profiles.sso_provider`**.

⚠️ **`email_domains` est la garde qui protège réellement**, et elle est **vide
par défaut**, donc fail-closed. Deux conséquences à connaître :

- tant qu'elle est vide, personne ne se connecte par SSO — c'est normal ;
- **la vider referme le SSO d'un locataire : c'est le geste d'urgence.**

## 4. Le déploiement de la fonction

```bash
cd supabase/functions/m365-login-callback   # le .npmrc doit être ICI
supabase functions deploy m365-login-callback --project-ref <ref>
```

- **Docker est requis.** `--use-api` est interdit : l'assembleur côté serveur
  n'a pas le `.npmrc` et échoue sur « npm package … does not exist », message
  qui ne dit pas la vraie cause.
- **Une version du socle publiée depuis moins de 24 h** ne se déploie qu'avec
  le `deno.json` posé par la recette (`minimumDependencyAge`).

## 4 bis. La porte de vérification du projet a BESOIN d'un accès au registre

**Trouvé à la première adoption réelle, le 2026-09-08.** Un projet qui
type-vérifie ses Edge Functions depuis la racine — par exemple
`deno check --config scripts/deno-check.json` — **ne verra pas** le `.npmrc`
posé dans le dossier de la fonction. Le critère n'est ni le répertoire courant
ni `NPM_CONFIG_USERCONFIG` (les deux ont été essayés) : **Deno cherche le
`.npmrc` à côté du fichier de configuration qu'on lui donne**.

Deux gestes, donc, pour chaque configuration Deno du projet :

1. un `.npmrc` **à côté d'elle**, jeton **en clair**, gitignoré ;
2. `"minimumDependencyAge": 0` **dedans** — sinon publier une version du socle
   rend la vérification du projet rouge pendant 24 h.

⚠️ **Conséquence à assumer : la porte de vérification exige désormais un jeton.**
Un poste sans jeton `read:packages` ne peut plus vérifier le projet. C'est le
prix du registre privé, et il se paie chez chaque adoptant.

## 5. La recette de vérification

Dans l'ordre, parce que chaque étape dépend de la précédente :

1. `email_domains` vide → la connexion doit **refuser**. Si elle passe, la
   garde n'est pas branchée.
2. Domaine déclaré, adresse connue → session ouverte.
3. Domaine déclaré, **adresse inconnue** → le résultat dépend de la posture
   choisie (ADR-001 D17) : `politique.ts` en variante « refuser » doit rendre
   **403**, en variante « créer » doit créer le compte. **Vérifier que c'est
   bien la posture voulue** — c'est le seul contrôle que personne d'autre ne
   fera à votre place.
4. Retirer `login` de `purpose` → refus. C'est le coupe-circuit par locataire.
