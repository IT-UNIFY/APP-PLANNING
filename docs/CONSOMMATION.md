# Relevé des jetons — APP-PLANNING

> Compagnon de `docs/TIMELOG.md` : le relevé de temps dit **combien de temps**,
> celui-ci dit **combien de jetons** Claude Code a consommés, par séance et par
> tâche. Les deux alimenteront FixTracker, tâche par tâche, quand le projet y
> sera créé (décision du 2026-11-20). La colonne `Tâche_ID` suit la même règle
> que le TIMELOG : UUID FixTracker entre backticks, ou `—`.
>
> **Ne jamais inventer un chiffre.** Il se lit dans les journaux de session :
>
> ```
> node scripts/releve-jetons.mjs AAAA-MM-JJ --detail
> ```
>
> Les séances sont découpées comme dans le TIMELOG (nouvelle séance après
> 30 min sans réponse du modèle), mais sur les réponses du modèle et non sur
> les messages : leurs bornes peuvent différer de quelques minutes. Les
> libellés reprennent ceux du TIMELOG pour que les deux se rapprochent.
>
> **Colonnes.** *Entrée* : jetons envoyés hors cache. *Cache écrit* et *cache
> lu* : contexte mis en cache puis relu à chaque échange (c'est l'essentiel du
> volume, facturé moins cher). *Sortie* : jetons produits. *Dont agents* : part
> de la sortie produite par les sous-agents.
>
> **Hors relevé** : les sessions cloud (ex. la coque `ui-epss`, TEMPLATE-EPSS#1,
> le 2026-11-19) et les sessions ouvertes dans un autre dossier.

## 2026-11-20

| Tâche | Tâche_ID | Début | Fin | Réponses | Entrée | Cache écrit | Cache lu | Sortie | Dont agents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Charte ERP EPSS : ui-epss vendorisé, coque et menu du lot 1 (PR #2, #3) | — | 08:09 | 08:26 | 41 | 86 | 361 577 | 15 129 451 | 33 543 | 0 |
| Merge de la PR #3, choix de la suite (modèle de données) | — | 09:11 | 09:18 | 9 | 22 | 6 128 | 3 714 128 | 3 948 | 0 |
| Modèle de données (lead-dev, arbitrages), schéma du lot 1 (PR #4, #5, #6), cadre d'autonomie | — | 10:30 | 12:13 | 251 | 542 | 1 325 602 | 62 376 373 | 310 972 | 232 269 |

> Séance encore ouverte à 12:13 : refaire le relevé en fin de journée.

## 2026-11-19

| Tâche | Tâche_ID | Début | Fin | Réponses | Entrée | Cache écrit | Cache lu | Sortie | Dont agents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cadrage, TEMPLATE-EPSS, instanciation, ADR-001, projet Supabase, handoff GDC | — | 16:23 | 17:21 | 147 | 336 | 292 593 | 34 884 201 | 118 877 | 0 |
