# Pourquoi ces permissions sont versionnées

Ce dépôt versionne son allowlist dans `.claude/settings.json`, et non dans
le `.claude/settings.local.json` gitignoré. Décision : ADR-001 D11 du dépôt
`APP-TEMPLATE`, arbitrée le 2026-09-08.

**Le motif.** Une allowlist locale repart de zéro à chaque clone. Chaque
personne re-subit les mêmes demandes d'autorisation sur `npm run build` ou
`npx tsc`. Ces entrées sont génériques et sans effet de bord : elles
appartiennent au dépôt, pas au poste.

## La règle à respecter avant d'ajouter une entrée

Une entrée dans un fichier **versionné** se propage à tous les clones et à
tous les contributeurs. Donc :

- **Jamais de joker sur une commande destructive ou sortante.** C'est
  pourquoi les entrées `supabase` sont resserrées :

  | Interdit | Retenu | Ce que le joker couvrait |
  | --- | --- | --- |
  | `npx supabase db *` | `db diff *`, `db lint` | `db reset` (destructeur) et `db push` (port DB direct — cf. la règle réseau d'`AGENTS.md`) |
  | `npx supabase functions *` | `functions list`, `functions download *` | `deploy` — une action sortante |
  | `npx supabase migration *` | `migration list`, `migration new *` | `repair` — réécrit l'historique |

- **Jamais un script nommé propre à ce dépôt.** Il va dans
  `settings.local.json`.
- **Jamais une commande qui écrit hors du dépôt.**

`settings.local.json` reste ce qu'il doit être : les exceptions d'un poste.
Voir `settings.local.json.example`.
