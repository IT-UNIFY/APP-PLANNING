# APP-PLANNING

Outil Planning de l'ERP EPSS — lot 1 : consultation des séances importées d'Aurion.

## Démarrer

```bash
npm install            # installe ET active la porte de vérification pre-push
cp .env.example .env   # puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5175
```

Sans `.env` renseigné, l'application affiche un écran nommant les variables
manquantes — pas un écran vide.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production (`tsc -b && vite build`) |
| `npm run verify` | **la porte** : lint + typecheck + test + build |
| `npm test` | suite Vitest |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, sans émission |
| `npm run format` | Prettier |
| `npm run gen:db-types` | régénère `src/types/database.ts` depuis Supabase |

## Vérification avant push

Ce dépôt n'a pas de CI GitHub : la porte est locale, dans
`.githooks/pre-push`. Elle s'active au `npm install`. Après un
`npm ci --ignore-scripts`, l'activer à la main :

```bash
git config core.hooksPath .githooks
```

## Structure

```
src/            front React — routes, composants, hooks, lib
supabase/       migrations et Edge Functions (Deno)
scripts/        outillage Node (admin, seeds, génération)
tests/          setup Vitest et tests transverses
docs/           HANDOFF · JOURNAL · TIMELOG · BACKLOG · adr/
.claude/        agents, hooks, skills, permissions versionnées
.githooks/      porte de vérification pre-push
```

## Où lire la suite

- `AGENTS.md` — les règles d'engagement, et le **pourquoi** de chaque
  garde-fou.
- `docs/HANDOFF.md` — l'état courant, les pièges d'environnement, l'étape
  suivante. **À lire en entier avant d'agir.**
- `docs/adr/` — les décisions déjà prises.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | clé anon — **publique par conception**, la sécurité vient de RLS |

⚠️ Jamais de clé `service_role` dans un `VITE_*` : le préfixe l'exposerait
dans le JavaScript livré au navigateur.
