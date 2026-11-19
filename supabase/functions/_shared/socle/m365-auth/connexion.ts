// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/connexion.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Orchestration du retour OAuth Microsoft 365 — la connexion elle-même.
// ----------------------------------------------------------------------
// Portage d'APP-FIX `m365-login-callback/handle.ts` (ADR-057), adapté aux
// décisions d'ADR-0109, puis rendu neutre pour le socle (D17 : la politique de
// liaison n'est plus câblée, elle est demandée).
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// Fonction PURE : toutes les entrées/sorties passent par
// `dependances`, donc le déroulé se teste sous Vitest sans Deno, sans réseau
// et sans base.
//
// DÉROULÉ, ET CE QUE CHAQUE ÉTAPE GARANTIT :
//   1. corps          → `code`, `redirect_uri`, `state` bien présents.
//   2. `state`        → le locataire visé. Le `state` n'a AUCUNE autorité : il
//                       traverse le navigateur (cf. `etat.ts`).
//   3. locataire      → la ligne existe, et `login` figure dans `purpose`.
//                       Retirer `login` est le coupe-circuit du locataire.
//   4. clé secrète    → lue dans Vault, jamais dans la table, jamais rendue.
//   5. échange        → ⭐ LA VRAIE PREUVE. Le code n'est échangeable qu'avec
//                       la clé secrète de CE locataire. Tout ce qui précède
//                       pouvait être forgé par le navigateur ; ceci, non.
//   6. Graph `/me`    → l'adresse vient du répertoire Microsoft, pas du
//                       navigateur.
//   7. domaine        → l'adresse appartient à un domaine déclaré sur le
//                       locataire. Liste vide = refus (fail-closed).
//   8. compte         → lié s'il existe ; sinon, CE QUE L'APPLICATION A DIT.
//   9. marquage       → marquage SSO du profil.
//  10. lien magique   → jeton rendu au front, qui appelle `verifyOtp`.
//
// ⚠️ L'ÉTAPE 8 N'A PAS DE COMPORTEMENT PAR DÉFAUT — ADR-001 D17.
// Face à une adresse inconnue, le parc ne fait pas la même chose, et c'est
// délibéré : APP-FIX refuse en 403 `user_not_provisioned` (allowlist stricte,
// ADR-057 §2.3) ; APP-GDC (ADR-024) et APP-FACTU (ADR-0109 D6, arbitrage MOA
// du 2026-09-02) créent le compte.
//
// Ce module ne tranche pas. `dependances.politiqueLiaison` est une entrée
// OBLIGATOIRE, et le type interdit de dire « crée » sans fournir de quoi
// créer. Un défaut ferait de l'oubli du paramètre un choix silencieux — et
// un changement de posture de sécurité ne doit jamais être un effet de bord
// d'une montée de version.
//
// CE QUE LA POSTURE « CRÉER » COÛTE, et que l'application doit peser avant de
// la choisir : toute personne du locataire dont le domaine est déclaré à
// l'étape 7 obtient un compte. Chez APP-FACTU, ce compte porte le rôle
// `viewer` et ses 16 droits, dont la lecture et l'export des clients et de la
// facturation.
//
// CE QUI TIENT LIEU DE GARDE, du coup, c'est l'étape 7 — la liste des domaines
// déclarés sur le locataire, vide par défaut, donc fail-closed. **Vider cette
// liste referme le SSO du locataire : c'est le geste d'urgence.** L'application
// peut poser une seconde garde globale à l'INSERT ; ce module ne la connaît
// pas et n'en dépend pas.
//
// LE RÔLE N'EST PAS POSÉ ICI, et ne doit pas l'être. C'est à l'implémentation
// de `creerCompte` de le faire — deux endroits qui posent un rôle finissent
// par ne plus dire la même chose.
//
// UN COMPTE DÉSACTIVÉ NE PASSE PAS. `lireProfil` rend `{ actif }` ; un compte
// inactif est refusé ici, avant qu'aucune session ne soit émise. Laisser
// ouvrir une session pour la refuser à l'écran suivant donne un message
// incompréhensible.
//
// LES MESSAGES D'ERREUR SONT AVARES. Cette fonction répond à un visiteur
// anonyme : elle ne doit dire ni si une adresse est connue, ni ce qui est
// configuré. Le détail va aux journaux.

import { analyserEtat } from './etat.ts';
import type { EntreeEchange, ResultatEchange } from './echange.ts';
import type { ResultatGraph } from './graph.ts';
import { extraireTokenHash, type LienGenere } from './lienMagique.ts';
import { domaineAutorise, validerCorpsRappel } from './validationRappel.ts';

/** Configuration du locataire, réduite à ce que le déroulé lit. */
export interface LocataireM365 {
  id: string;
  tenant_id: string;
  client_id: string;
  purpose: string[];
  email_domains: string[];
}

export interface EntreeCreationCompte {
  email: string;
  nomAffiche?: string;
  identifiantAzure: string;
}

/** Toutes les entrées/sorties du déroulé, injectées par `index.ts`. */
/**
 * Posture de l'application face à une adresse inconnue au retour du SSO
 * (ADR-001 D17). Il n'y a pas de valeur par défaut : l'application choisit.
 *
 * - `refuser_si_absent` — la personne doit avoir été provisionnée. Posture
 *   d'APP-FIX : un outil interne ne s'ouvre pas à tout un locataire.
 * - `creer_si_absent` — le compte est créé. Postures d'APP-GDC et d'APP-FACTU.
 *   La garde qui reste est alors la liste de domaines de l'étape 7.
 *
 * L'union porte `creerCompte` dans la seule branche qui en a besoin : on ne
 * peut pas déclarer la création sans fournir de quoi créer, ni fournir de quoi
 * créer sans le déclarer.
 */
export type PolitiqueLiaison =
  | { mode: 'refuser_si_absent' }
  | {
      mode: 'creer_si_absent';
      creerCompte(entree: EntreeCreationCompte): Promise<
        | { ok: true; userId: string }
        | { ok: false; statut: number; message: string; code: string }
      >;
    };

export interface DependancesRappelM365 {
  chargerLocataire(idLigne: string): Promise<
    | { ok: true; locataire: LocataireM365 }
    | { ok: false; statut: number; message: string; code: string }
  >;
  lireCleSecrete(idLigne: string): Promise<
    { ok: true; cle: string } | { ok: false; code: string }
  >;
  echangerCode(entree: EntreeEchange): Promise<ResultatEchange>;
  lireProfilGraph(jetonAcces: string): Promise<ResultatGraph>;
  /** uuid `auth.users` pour l'adresse, ou `null`. Insensible à la casse. */
  trouverCompteParEmail(email: string): Promise<string | null>;
  /** `{ actif }`, ou `null` si aucun profil n'est lisible. */
  lireProfil(userId: string): Promise<{ actif: boolean } | null>;
  /**
   * Que faire d'une adresse inconnue. **Obligatoire, sans valeur par
   * défaut** (ADR-001 D17). Le type interdit `creer_si_absent` sans
   * `creerCompte`.
   */
  politiqueLiaison: PolitiqueLiaison;
  majMetadonneesUtilisateur(
    userId: string,
    identifiantAzure: string,
  ): Promise<{ ok: true } | { ok: false; code: string }>;
  marquerProfilSso(
    userId: string,
  ): Promise<{ ok: true } | { ok: false; code: string }>;
  genererLienMagique(email: string): Promise<
    { ok: true; donnees: LienGenere } | { ok: false; code: string }
  >;
}

type EntetesCors = Record<string, string>;

const ETIQUETTE = 'm365-login-callback';

/**
 * Traite le retour OAuth et rend le jeton d'ouverture de session.
 * @param req requête POST de la page de retour.
 * @param entetesCors en-têtes CORS calculés par `index.ts` (le module CORS lit
 *   `Deno.env` au chargement : l'importer ici casserait les tests Vitest).
 * @param dependances accès réseau, base et administration Supabase.
 */
export async function traiterRappelConnexion(
  req: Request,
  entetesCors: EntetesCors,
  dependances: DependancesRappelM365,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesCors });
  }
  if (req.method !== 'POST') {
    return refus(entetesCors, 405, 'methode_non_autorisee', 'Méthode non ' +
      'autorisée.');
  }

  // 1. Corps.
  const corpsBrut = await lireCorpsJson(req);
  const corps = validerCorpsRappel(corpsBrut);
  if (!corps.ok) {
    return refus(entetesCors, 400, corps.code, corps.message);
  }

  // 2. `state` → locataire visé.
  const etat = analyserEtat(corps.corps.state);
  if (!etat.ok) {
    console.error(`[${ETIQUETTE}] state illisible`, { motif: etat.motif });
    return refus(entetesCors, 400, 'state_invalide', 'Paramètre « state » ' +
      'invalide. Recommencez la connexion.');
  }
  const idLigne = etat.etat.tenant_row_id;

  // 3. Locataire + coupe-circuit `purpose`.
  const chargement = await dependances.chargerLocataire(idLigne);
  if (!chargement.ok) {
    return refus(
      entetesCors,
      chargement.statut,
      chargement.code,
      chargement.message,
    );
  }
  const locataire = chargement.locataire;
  if (!locataire.purpose.includes('login')) {
    console.error(`[${ETIQUETTE}] purpose sans login`, { locataire: idLigne });
    return refus(entetesCors, 403, 'locataire_connexion_desactivee',
      'La connexion Microsoft 365 n’est pas autorisée pour ce locataire.');
  }

  // 4. Clé secrète en Vault.
  const secret = await dependances.lireCleSecrete(idLigne);
  if (!secret.ok) {
    console.error(`[${ETIQUETTE}] clé secrète illisible`, {
      code: secret.code,
      locataire: idLigne,
    });
    return refus(entetesCors, 500, 'configuration_incomplete',
      'Configuration Microsoft 365 incomplète. Prévenez votre ' +
        'administrateur.');
  }

  // 5. Échange du code — la seule étape qu'un navigateur ne peut pas forger.
  const echange = await dependances.echangerCode({
    tenant_id: locataire.tenant_id,
    client_id: locataire.client_id,
    client_secret: secret.cle,
    code: corps.corps.code,
    redirect_uri: corps.corps.redirect_uri,
  });
  if (!echange.ok) {
    return refus(entetesCors, echange.statut, echange.code, echange.message);
  }

  // 6. Identité, lue chez Microsoft.
  const graph = await dependances.lireProfilGraph(echange.jetonAcces);
  if (!graph.ok) {
    return refus(entetesCors, graph.statut, graph.code, graph.message);
  }
  const email = graph.profil.email;

  // 7. Garde par domaine du locataire (fail-closed).
  if (!domaineAutorise(email, locataire.email_domains)) {
    console.error(`[${ETIQUETTE}] domaine non déclaré`, {
      locataire: idLigne,
    });
    return refus(entetesCors, 403, 'domaine_non_autorise',
      'Ce domaine de messagerie n’est pas autorisé pour ce locataire.');
  }

  // 8. Lier le compte — ou créer / refuser, selon D17.
  const compte = await lierOuCreer(dependances, email, graph.profil);
  if (!compte.ok) {
    return refus(entetesCors, compte.statut, compte.code, compte.message);
  }
  const userId = compte.userId;

  // 9. Marquage SSO. Idempotent : réécrire la même valeur ne change rien.
  const marquage = await dependances.marquerProfilSso(userId);
  if (!marquage.ok) {
    console.error(`[${ETIQUETTE}] marquage SSO en échec`, {
      code: marquage.code,
      utilisateur: userId,
    });
    return refus(entetesCors, 500, 'marquage_sso_impossible',
      'Impossible de finaliser la connexion. Réessayez dans un instant.');
  }

  // 10. Lien magique → `verifyOtp` côté front.
  const lien = await dependances.genererLienMagique(email);
  if (!lien.ok) {
    console.error(`[${ETIQUETTE}] lien magique en échec`, { code: lien.code });
    return refus(entetesCors, 500, 'session_impossible',
      'Impossible d’ouvrir la session. Réessayez dans un instant.');
  }
  const jeton = extraireTokenHash(lien.donnees);
  if (!jeton.ok) {
    console.error(`[${ETIQUETTE}] lien magique sans jeton`, {
      motif: jeton.motif,
    });
    return refus(entetesCors, 500, 'session_impossible',
      'Impossible d’ouvrir la session. Réessayez dans un instant.');
  }

  return reponseJson(entetesCors, 200, {
    success: true,
    verifyToken: jeton.tokenHash,
    tokenType: 'magiclink',
    email,
    userId,
    compteCree: compte.cree,
  });
}

// ---------------------------------------------------------------------
// Étape 8 — lier un compte existant, ou en créer un.
// ---------------------------------------------------------------------

type ResultatCompte =
  | { ok: true; userId: string; cree: boolean }
  | { ok: false; statut: number; message: string; code: string };

async function lierOuCreer(
  dependances: DependancesRappelM365,
  email: string,
  profil: { id: string; nomAffiche?: string },
): Promise<ResultatCompte> {
  const existant = await dependances.trouverCompteParEmail(email);

  if (!existant) {
    const politique = dependances.politiqueLiaison;

    if (politique.mode === 'refuser_si_absent') {
      // Le message ne dit PAS que l'adresse est inconnue — cette fonction
      // répond à un visiteur anonyme, et confirmer l'existence d'un compte
      // renseignerait un attaquant. Le motif précis va au journal.
      console.warn(`[${ETIQUETTE}] adresse non provisionnée`, {
        politique: politique.mode,
      });
      return {
        ok: false,
        statut: 403,
        message: 'Ce compte n’est pas utilisable. Contactez votre ' +
          'administrateur.',
        code: 'user_not_provisioned',
      };
    }

    // Création. Ce module ne pose ni profil ni rôle : c'est à
    // l'implémentation de `creerCompte` de le faire.
    const creation = await politique.creerCompte({
      email,
      nomAffiche: profil.nomAffiche,
      identifiantAzure: profil.id,
    });
    if (!creation.ok) return creation;
    console.log(`[${ETIQUETTE}] compte créé par SSO`, {
      utilisateur: creation.userId,
    });
    return { ok: true, userId: creation.userId, cree: true };
  }

  // Compte connu : on refuse avant d'émettre quoi que ce soit s'il est coupé.
  const etatProfil = await dependances.lireProfil(existant);
  if (etatProfil === null) {
    // Fail-closed : un compte `auth.users` sans profil lisible est un état
    // incohérent. Ouvrir une session ici donnerait un utilisateur sans droits
    // et sans explication ; on refuse, et le journal porte le cas.
    console.error(`[${ETIQUETTE}] profil illisible pour un compte existant`, {
      utilisateur: existant,
    });
    return {
      ok: false,
      statut: 403,
      message: 'Ce compte n’est pas utilisable. Contactez votre ' +
        'administrateur.',
      code: 'profil_illisible',
    };
  }
  if (!etatProfil.actif) {
    console.warn(`[${ETIQUETTE}] compte désactivé`, { utilisateur: existant });
    return {
      ok: false,
      statut: 403,
      message: 'Ce compte est désactivé. Contactez votre administrateur.',
      code: 'compte_desactive',
    };
  }

  const maj = await dependances.majMetadonneesUtilisateur(existant, profil.id);
  if (!maj.ok) {
    console.error(`[${ETIQUETTE}] mise à jour des métadonnées en échec`, {
      code: maj.code,
      utilisateur: existant,
    });
    return {
      ok: false,
      statut: 500,
      message: 'Impossible de mettre à jour le compte.',
      code: maj.code || 'maj_compte_impossible',
    };
  }
  return { ok: true, userId: existant, cree: false };
}

// ---------------------------------------------------------------------
// Réponses HTTP (le module CORS n'est pas importable ici — cf. en-tête).
// ---------------------------------------------------------------------

function reponseJson(
  entetesCors: EntetesCors,
  statut: number,
  corps: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: {
      ...entetesCors,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function refus(
  entetesCors: EntetesCors,
  statut: number,
  code: string,
  message: string,
): Response {
  return reponseJson(entetesCors, statut, { error: code, message });
}

async function lireCorpsJson(req: Request): Promise<unknown> {
  try {
    const texte = await req.text();
    if (!texte) return null;
    return JSON.parse(texte);
  } catch {
    return null;
  }
}
