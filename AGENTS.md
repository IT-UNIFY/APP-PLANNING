# AGENTS.md — APP-PLANNING

Règles d'engagement de ce dépôt. À lire avant d'écrire une ligne.

Ce fichier porte le **pourquoi** de chaque garde-fou, pas seulement la
commande. Un garde-fou dont la raison n'est écrite nulle part se fait retirer
par le prochain lecteur, qui constate à raison qu'il ne comprend pas à quoi il
sert.

Squelette instancié depuis `IT-UNIFY/APP-TEMPLATE`. Les décisions communes au
parc vivent dans le `docs/adr/` de ce dépôt-là, pas ici.

---

## 1. Le projet

Outil Planning de l'ERP EPSS — lot 1 : consultation des séances importées d'Aurion.

Projet Supabase : `yvuutsniduqqinkowqkc` (projet unique du lot 1, https://yvuutsniduqqinkowqkc.supabase.co).

## 2. La pile

- **Front** : React 19 · Vite · TypeScript strict · Tailwind CSS 4.
- **Tailwind 4 est CSS-first** : le thème est dans `src/styles/global.css`,
  sous `@theme`. **Il n'y a pas de `tailwind.config.js`** — ne pas en créer un.
- **Routage** : `react-router-dom`. Les URL restent partageables et ajoutables
  aux favoris. Ne pas régresser vers un state machine `activeView`.
- **Backend** : Supabase — Postgres, Auth, Storage, Edge Functions (Deno).

## 3. Les règles dures

| Règle | Pourquoi |
| --- | --- |
| **Un seul client Supabase** — `src/lib/supabase.ts` | Deux clients = deux sessions et deux rafraîchissements de jeton = des déconnexions aléatoires irreproductibles. |
| **`service_role` confiné à `scripts/**` et `supabase/functions/**`** | Cette clé contourne RLS. Dans le bundle du navigateur, elle est lisible par tout le monde. |
| **Pas de `console.*` hors `src/lib/logger.ts`** | Un `console.log` oublié part en production et peut y afficher des données personnelles. Le wrapper rend les points de journalisation trouvables en un grep. |
| **Pas de `any`** | Le type perdu ne revient jamais tout seul. ESLint le refuse. |
| **RLS activée dès la migration qui crée la table** | Une table sans RLS est ouverte. L'oubli ne se voit pas à l'écran. |
| **Une requête écrite deux fois devient un hook** | Sinon la troisième copie divergera, comme partout ailleurs. |
| **Jamais d'URL ni de clé Supabase en dur dans du SQL** | Les triggers les lisent depuis une table de config. Une clé dans une migration est versionnée pour toujours. |

## 4. Un seul chemin d'écriture du schéma

**Chemin unique : le workflow `.github/workflows/db-push.yml`** (repris
d'APP-FIX, ADR-029 option C). Toute évolution de schéma = un fichier sous
`supabase/migrations/**`, appliqué par ce workflow :

```bash
gh workflow run db-push.yml -f mode=plan  -f project=preprod   # dry-run
gh workflow run db-push.yml -f mode=apply -f project=preprod
```

Un push sur `main` qui touche `supabase/migrations/**` applique en **prod**.

**Interdits** : `apply_migration` par MCP, `supabase db push` depuis le poste,
SQL DDL dans le tableau de bord. Le port DB s'ouvre depuis le runner GitHub :
aucun partage de connexion n'est nécessaire.

Projet unique pour le lot 1 : `prod` et `preprod` visent tous deux `yvuutsniduqqinkowqkc`,
avec le secret `SUPABASE_DB_PASSWORD` (posé le 2026-11-19).
Le secret `SUPABASE_ACCESS_TOKEN` est posé aussi (2026-11-19).
⚠️ GitHub ne lance à la main (`workflow_dispatch`) qu'un workflow présent sur
`main`. Chemin prouvé le 2026-11-19 : run `plan` vert, « Remote database is up
to date ». ⚠️ Le filtre `paths` voit aussi `supabase/migrations/.gitkeep` :
tout push sur `main` qui touche ce dossier lance un run `apply`.

## 4 bis. 🔴 Après tout `drop`+`create` de fonction SQL, relire les droits

Mesuré chez APP-FACTU le 2026-09-10 (ADR-0116 §5), et transmis ici parce que
le piège n'est pas propre à eux.

Changer la **signature** d'une fonction impose un `drop function` — et le
`drop` emporte les droits. Les reposer ne suffit pas : **les *default
privileges* du projet Supabase réattribuent `execute` d'office** au `create`
suivant.

Sonde falsifiable, deux ordres :

```sql
create function public.zz_sonde() returns int language sql stable
  as $$ select 1 $$;
select grantee, privilege_type from information_schema.routine_privileges
 where routine_schema='public' and routine_name='zz_sonde';
-- PUBLIC, anon, authenticated, postgres, service_role  ← tous EXECUTE
drop function public.zz_sonde();
```

Deux conséquences, et la première surprend :

- **`revoke all … from public` ne retire PAS le droit d'`anon`.** C'est un
  grant **nominatif**, pas un héritage de `PUBLIC`. Il faut viser `anon`
  **nommément**. Chez APP-FACTU, une fonction a porté un `execute` pour `anon`
  qu'elle n'avait **jamais eu**, entre le `create` et le `revoke` correctif.
- **Un `grant … to service_role` écrit à la main est redondant.** Si une
  convention dit « `service_role` jamais référencé », l'écrire la contredit
  **sans rien changer** à l'état effectif.

> **Réflexe à graver** : après tout `drop`+`create`, **relire**
> `information_schema.routine_privileges` et comparer à l'état d'avant. Une
> surface élargie par inadvertance ne se voit pas autrement — aucune erreur,
> aucun avertissement, juste un droit de plus.

C'est la symétrie exacte de la garde-colonne (`revoke all` puis
`grant select (cols)`) : dans les deux cas, un `grant` explicite **ajoute**
sans jamais retirer ce que le défaut a posé.

## 4 ter. 🔴 Un mot de passe dans un fichier suivi n'est pas un secret

Même de recette. Même en préproduction. Même « connu de l'équipe ».

Constaté le 2026-09-10 sur **deux** dépôts du parc dont l'un avait copié le
script de l'autre : `scripts/seed-test-accounts.mjs` portait des valeurs
littérales, donc présentes dans **l'historique Git** — lisibles par quiconque
a un clone, des mois avant toute autre fuite. Chez APP-GDC, **15 comptes sur
16 s'ouvraient encore** avec les valeurs de l'historique, `admin` et
`superadmin` compris.

Un script de seed doit donc :

1. **n'avoir aucun défaut en dur** et **refuser de tourner** sans la variable
   d'environnement. Un repli silencieux ramène le défaut au premier oubli ;
2. **porter une rotation explicite** (`--rotate`). ⚠️ Un seed est
   généralement *idempotent* — il ne touche pas au mot de passe d'un compte
   existant, pour ne pas casser une session de recette. Conséquence
   contre-intuitive : **changer la constante ne tourne rien du tout**, et on
   croit avoir corrigé ;
3. **ne rien écrire en clair dans la console** — une sortie de terminal finit
   dans un journal de session, une capture, un ticket. Le récap va dans un
   fichier **gitignoré**, et lui seul ;
4. se prouver par une **contre-épreuve d'authentification**, jamais par une
   relecture du code : l'ancienne valeur doit rendre **400**, la nouvelle
   **200**, sur **chaque** compte.

⚠️ **Un `429` n'est pas un `400`.** Le point `/auth/v1/token` limite le débit ;
une contre-épreuve trop rapide rend des `429` qui ne prouvent **rien** — ni que
la valeur ouvre, ni qu'elle n'ouvre plus. Espacer les tentatives, et compter
les `429` à part.

## 5. ⚠️ Réseau — avant toute opération sur la base distante

Le réseau normal de l'utilisateur **bloque TCP 5432 et 6543** (Postgres direct
et pooler). Le blocage est **silencieux** : aucun ICMP ne revient, donc un blocage
ressemble à un simple délai d'attente. TCP 443 est ouvert, donc REST/PostgREST
et les API de gestion fonctionnent.

**Avant** un `supabase db push`, `db pull/reset`, `migration list --linked`,
un `psql`/`pg_dump` distant, ou des tests d'intégration pointés sur la base
liée, **depuis ce poste** : avertir l'utilisateur, lui demander de basculer en
partage de connexion mobile, et **attendre sa confirmation**.

**Après** l'opération : lui dire explicitement qu'il peut revenir sur son
réseau normal.

**Exception** — une opération qui tourne sur un runner CI ouvre le port depuis
le runner, pas depuis ce poste. La règle ne s'applique pas, et demander le
partage de connexion serait faux. Voir §4 pour savoir quel chemin ce dépôt
utilise.

Pré-vérification possible :
`timeout 12 bash -c "echo > /dev/tcp/<hôte-db>/<port>"`.

## 6. Porte de vérification

**Ce dépôt n'a pas de CI GitHub ACTIVE.** La vérification est locale — mais le
workflow existe, **livré inerte**, et son déclencheur d'activation est nommé :
voir §6 ter.

**Pourquoi.** L'org est au forfait gratuit : 2 000 minutes d'Actions par mois,
partagées entre ~22 dépôts privés, facturées à la minute entamée par job et
par exécution. Le pool a été épuisé en juillet 2026. Sur un dépôt à un seul
contributeur, un contrôle distant n'ajoute aucune valeur de revue.

```
npm run verify     # lint + typecheck + test + build
```

La porte est `.githooks/pre-push`. Elle s'active automatiquement au
`npm install`, via le script `prepare`. Après un `npm ci --ignore-scripts`,
le `prepare` est sauté — la lancer à la main :

```
git config core.hooksPath .githooks
```

**Un hook jamais activé échoue silencieusement.** C'est le pire défaut d'une
porte de vérification, d'où l'automatisation *et* cette ligne écrite.

**Deux trous, à dire plutôt qu'à masquer** : `git push --no-verify` la
contourne, et rien ne vérifie le **résultat de la fusion** — seulement la
branche poussée.

⚠️ **Remettre une CI GitHub** quand un second contributeur pousse sur ce
dépôt, ou quand la revue doit avoir lieu ailleurs que sur le poste de
l'auteur. À deux, les deux trous ci-dessus cessent d'être théoriques. Moins
cher que la CI complète : `paths-ignore` sur `docs/**` et `*.md`, plus
`concurrency` avec `cancel-in-progress`.

**Si ce dépôt a des Edge Functions**, ajouter `check:edge` au `verify` :
Vitest transpile les modules Edge **sans vérifier leurs types**. Une commande
absente se **retire** du `verify` — elle ne se transforme jamais en `|| true`.

## 6 bis. Ne jamais supprimer `package-lock.json`

Le lock est versionné, et ce n'est pas une préférence. `vitest@4` fait planter
la résolution de pairs de `npm@10.9.8` (`Cannot read properties of null
(reading 'edgesOut')`, dans `arborist`) — mesuré le 2026-09-08, reproduit avec
`vitest` seul dans un `package.json` nu.

Avec le lock, `npm install` passe. Sans lui, le dépôt n'est pas installable
tant qu'on n'a pas retrouvé le contournement (`npm install
--legacy-peer-deps`, puis `npm install`).

Procédure de régénération : voir `INSTANCIATION.md` §5 — ou, si ce fichier a
été supprimé, ces trois lignes suffisent.

## 6 ter. Quand rallumer la CI GitHub

`.github/workflows/verify.yml.exemple` est **livré inerte** : GitHub ignore
tout ce qui n'est pas `.yml`/`.yaml` dans `.github/workflows/`. L'activer :

```
git mv .github/workflows/verify.yml.exemple .github/workflows/verify.yml
```

🔴 **Le déclencheur est nommé, pas laissé au flair.** Activez-le quand — et
seulement quand :

- un **deuxième contributeur** pousse réellement sur ce dépôt ; ou
- la revue doit avoir lieu **ailleurs que sur la machine de l'auteur**.

Avant cela, la CI vérifie une revue qui n'a pas lieu, et consomme un quota
partagé entre ~22 dépôts. Arbitrage : APP-TEMPLATE ADR-001 **D14**, rendu le
2026-09-10 (option 2, CI minimale).

**Ce qu'elle ferme, et que la porte locale ne peut pas** : le contournement
par `--no-verify`, et surtout le **résultat de la fusion** — la porte locale
ne voit que la branche poussée. Le fichier porte le reste du raisonnement, y
compris les quatre économies de quota à ne pas défaire en « l'améliorant ».

## 7. Tests

L'environnement par défaut est `node`. jsdom est un **opt-in par fichier**,
via `// @vitest-environment jsdom` en tête. Le mettre globalement ralentirait
tous les tests purs, à chaque push.

⚠️ **`include` dans `vitest.config.ts` est une liste blanche.** Un test posé
dans un dossier absent de cette liste **n'est jamais collecté** — il passe
pour vert alors qu'il ne tourne pas. Piège déjà payé sur APP-FACTU le
2026-09-01. Après avoir ajouté un test dans un nouveau dossier, vérifier qu'il
a bien **tourné** : le nombre de tests exécutés doit monter.

## 8. Definition of Done — un quatuor, pas un livrable

Un incrément n'est pas terminé sans **les quatre** :

1. `npm run verify` vert ;
2. `docs/JOURNAL.md` — entrée datée, **avec sa ligne `**Tâches** :`** ;
3. `docs/HANDOFF.md` — état des modules et étape suivante à jour ;
4. `docs/TIMELOG.md` — rollup depuis le journal brut de capture.

**Le TIMELOG est celui qu'on oublie**, parce qu'il vient en dernier et que la
capture est silencieuse. « Ai-je fait le rollup ? » est un point de contrôle
explicite, pas une bonne intention.

```
node ~/.claude/hooks/timelog-rollup.mjs <projectKey> [AAAA-MM-JJ]
```

Ne **jamais** inventer une durée : elle se dérive du journal brut. Si une
séance est encore ouverte (plusieurs PR dans une séance ininterrompue), faire
le rollup **en fin de séance**, le même jour — mais ne pas le reporter au
lendemain.

Si le projet livre un **guide utilisateur**, un changement visible par
l'utilisateur met à jour son chapitre **dans le même incrément**, écrit depuis
les libellés réels lus dans les sources. Un chapitre périmé est un bloqueur
pour le relecteur.

## 9. Ce qui ne doit pas être réécrit ici

Le socle commun du parc vient de paquets versionnés, pas d'une copie :

- `@it-unify/m365-auth` — SSO Microsoft 365, aller et retour ;
- `@it-unify/edge-kit` — CORS, garde d'auth, frappe de JWT, validation, audit ;
- `@it-unify/rbac` — `roles` / `permissions` / `role_permissions` /
  `user_roles`.

Si vous vous apprêtez à coller ici un fichier venu d'un autre dépôt du parc,
c'est le signal qu'il appartient au paquet. Motif mesuré : ces modules étaient
recopiés trois à quatre fois, et les copies avaient divergé sans que personne
le sache. Voir `APP-TEMPLATE` ADR-001.

## 10. Agents

Six agents sous `.claude/agents/`. Passer par `lead-dev` pour tout travail
non trivial : plusieurs couches, décision d'architecture, question ouverte, ou
infrastructure partagée. Aller direct pour une édition d'un seul fichier avec
une consigne claire, une correction de libellé, une question ciblée, ou une
action locale réversible.
