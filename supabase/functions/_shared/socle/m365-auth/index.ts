// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/index.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * `@it-unify/boilerplate-kit/m365-auth` — connexion Microsoft 365 mutualisée.
 *
 * Socle : ADR-001, Lot 3. Base d'extraction : APP-FACTU
 * (`supabase/functions/_shared/m365/`), la seule copie du parc décomposée ET
 * testée des deux côtés — inventaire complet dans
 * `docs/lot3-inventaire-m365.md`. Chaque module garde sa ligne de provenance :
 * la chaîne réelle est APP-FIX → APP-FACTU → socle.
 *
 * ── ÉTAT ──────────────────────────────────────────────────────────────────
 * **Les deux faces sont portées** — 14 modules, 151 tests. Reste la recette de
 * câblage exigée par D18 : un module n'est fini que lorsqu'il fournit de quoi
 * se brancher dans un projet neuf.
 *
 * ⚠️ UN SEUL SOUS-CHEMIN POUR LES DEUX FACES, pour l'instant. Une Edge
 * Function qui importe ce barillet embarque aussi le code navigateur — inerte
 * (rien ne touche `sessionStorage` au chargement), mais présent dans le
 * paquet. Un découpage `…/m365-auth/navigateur` et `…/m365-auth/serveur`
 * reste à trancher ; voir `docs/lot3-inventaire-m365.md`.
 *
 * ── DÉPENDANCE DE PAIR ────────────────────────────────────────────────────
 * `@supabase/supabase-js` est déclaré en pair OPTIONNELLE : seuls
 * `chercherLocataireM365` et `terminerConnexionM365` en ont besoin, et
 * uniquement pour leurs TYPES — rien n'est émis à l'exécution. Un projet qui
 * n'utilise que la face serveur n'a pas à l'installer.
 *
 * ── ⚠️ LA POLITIQUE DE LIAISON EST UNE ENTRÉE OBLIGATOIRE (ADR-001 D17) ────
 * Face à une adresse inconnue au retour du SSO, le parc ne fait pas la même
 * chose, et c'est **délibéré** : APP-FIX refuse en 403 `user_not_provisioned`
 * (ADR-057 §2.3), APP-GDC (ADR-024) et APP-FACTU (ADR-0109 D6) créent le
 * compte. Ce paquet n'en décide pas.
 *
 * `DependancesRappelM365.politiqueLiaison` n'a **pas de valeur par défaut**, et
 * son type interdit de déclarer `creer_si_absent` sans fournir `creerCompte`.
 * Un défaut ferait de l'oubli du paramètre un choix silencieux — et un
 * changement de posture de sécurité ne doit jamais être un effet de bord
 * d'une montée de version.
 *
 * ── DÉPLOIEMENT — DEUX PIÈGES MESURÉS ─────────────────────────────────────
 * Une Edge Function qui importe ce sous-chemin **ne peut pas** être déployée
 * avec `--use-api` : le serveur de build de Supabase n'a pas d'accès au
 * registre privé et échoue sur un « does not exist » trompeur. Il faut Docker,
 * et un `.npmrc` **dans le dossier de la fonction**, jeton en clair.
 * Et Deno refuse toute version publiée depuis moins de 24 h : poser
 * `"minimumDependencyAge"` dans le `deno.json` du projet pour déployer une
 * version fraîche. Détail : ADR-001, points d'attention.
 */

// ── Le retour OAuth, de bout en bout ────────────────────────────────────────
export { traiterRappelConnexion } from './connexion.ts';
export type {
  DependancesRappelM365,
  EntreeCreationCompte,
  LocataireM365,
  PolitiqueLiaison,
} from './connexion.ts';

// ── Les étapes, utilisables séparément ──────────────────────────────────────
export { analyserEtat } from './etat.ts';
export type { EtatOauth, ResultatEtat } from './etat.ts';

export { echangerCodeAutorisation, PORTEE_OAUTH_M365 } from './echange.ts';
export type { EntreeEchange, ResultatEchange } from './echange.ts';

export { lireProfilGraph } from './graph.ts';
export type { ProfilGraph, ResultatGraph } from './graph.ts';

export { extraireTokenHash } from './lienMagique.ts';
export type { LienGenere, ResultatExtraction } from './lienMagique.ts';

// ── Administration des locataires ───────────────────────────────────────────
export { obtenirJetonApplicatif } from './entra.ts';
export type { IdentifiantsEntra, ResultatJeton } from './entra.ts';

export { validerEnregistrement, USAGES_M365 } from './validation.ts';
export type {
  DemandeEnregistrement,
  ResultatValidation,
  UsageM365,
} from './validation.ts';

export { choisirConfigurationEnregistree, choisirSaisieEnCours } from './identifiants.ts';

export { domaineAutorise, validerCorpsRappel } from './validationRappel.ts';
export type { CorpsRappel, ResultatCorpsRappel } from './validationRappel.ts';

// ── Face navigateur — l'aller ───────────────────────────────────────────────
// `PORTEE_OAUTH_M365` n'est PAS réexportée ici : elle l'est déjà depuis
// `echange.js` ci-dessus. C'est tout l'intérêt du socle — un seul littéral de
// portée pour l'aller et pour l'échange, donc plus de dérive possible entre
// les deux (APP-FACTU en tenait deux, plus un test pour les comparer).
export { construireEtat, construireUrlAuthM365 } from './construireUrlAuthM365.ts';
export type { EntreeUrlAuth, LocataireAiguille } from './construireUrlAuthM365.ts';

export { chercherLocataireM365 } from './locataireM365.ts';

export { fabriquerNonce, stockageSession, verifierNonce } from './nonceM365.ts';
export type { StockageNonce } from './nonceM365.ts';

// ── Face navigateur — le retour ─────────────────────────────────────────────
export { analyserEtatRetour } from './etatRetour.ts';
export type { EtatRetourM365 } from './etatRetour.ts';

export { terminerConnexionM365 } from './terminerConnexionM365.ts';
export type {
  DependancesRetourM365,
  EntreeRetourM365,
  ResultatRetourM365,
} from './terminerConnexionM365.ts';
