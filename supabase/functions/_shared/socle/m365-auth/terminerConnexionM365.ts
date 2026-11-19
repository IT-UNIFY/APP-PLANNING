// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/terminerConnexionM365.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Le retour : poster le code à l'Edge, puis ouvrir la session.
 *
 * Portage d'APP-FACTU (ADR-0109). Extrait vers le socle — ADR-001, Lot 3.
 *
 * ⚠️ DEUX LIENS COUPÉS À L'EXTRACTION. Le client Supabase n'a plus de valeur
 * par défaut, et le lecteur de message d'erreur d'Edge Function est injecté :
 * c'est un utilitaire générique qui rejoindra `edge-kit` au Lot 5, et le socle
 * n'anticipe pas un sous-chemin qui n'existe pas encore.
 *
 * Deux temps, et l'ordre compte :
 *   1. `m365-login-callback` échange le code chez Microsoft et rend un jeton
 *      de lien magique. Elle est publique — au retour OAuth il n'y a pas
 *      encore de session ;
 *   2. `verifyOtp` transforme ce jeton en session Supabase. C'est SUPABASE qui
 *      émet la session, avec sa rotation et sa révocation : on ne fabrique
 *      aucun jeton à la main.
 *
 * ⚠️ `redirect_uri` DOIT être au caractère près celui de l'aller — d'où
 * `uriRetourM365`, un seul endroit qui la construit. Le serveur la renvoie
 * telle quelle à Microsoft, qui refuse en `AADSTS50011` à la moindre
 * différence.
 *
 * LE JETON N'EST NI JOURNALISÉ NI STOCKÉ : il ouvre une session à lui seul.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const FONCTION = 'm365-login-callback';

export interface EntreeRetourM365 {
  code: string;
  state: string;
  uriRetour: string;
}

/** Ce que l'appelant fournit. Rien n'a de valeur par défaut. */
export interface DependancesRetourM365 {
  client: SupabaseClient;
  /**
   * Extrait le message métier d'une erreur d'Edge Function, ou rend `null`.
   *
   * POURQUOI C'EST INJECTÉ. Sur un statut non-2xx, le SDK Supabase rend une
   * erreur dont le `.message` est générique (« non-2xx status code ») ; le
   * vrai message, déjà rédigé et déjà avare en détail, vit dans le corps de la
   * réponse. Le lire est un utilitaire générique, qui rejoindra `edge-kit` au
   * Lot 5. En attendant, l'appelant fournit le sien — le socle n'invente pas
   * un sous-chemin qui n'existe pas.
   */
  lireMessageEdge(erreur: unknown): Promise<string | null>;
}

export type ResultatRetourM365 =
  | { ok: true; email: string; compteCree: boolean }
  | { ok: false; message: string };

interface ReponseEdge {
  verifyToken?: unknown;
  email?: unknown;
  compteCree?: unknown;
}

/**
 * Termine le parcours : échange côté serveur, puis ouverture de session.
 * @param entree code et `state` lus dans l'URL de retour, adresse de retour.
 * @param dependances client Supabase et lecteur de message d'erreur.
 */
export async function terminerConnexionM365(
  entree: EntreeRetourM365,
  dependances: DependancesRetourM365,
): Promise<ResultatRetourM365> {
  const { client, lireMessageEdge } = dependances;
  let reponse: ReponseEdge | null;
  try {
    const { data, error } = await client.functions.invoke<ReponseEdge>(
      FONCTION,
      {
        body: {
          code: entree.code,
          state: entree.state,
          redirect_uri: entree.uriRetour,
        },
      },
    );
    if (error) {
      // Nos Edge rendent `{ error, message }`, `message` déjà rédigé en
      // français et déjà avare en détail (la page est publique). On le
      // préfère au message générique du SDK, qui ne dit que « non-2xx ».
      const message = await lireMessageEdge(error);
      return {
        ok: false,
        message: message ??
          'La connexion Microsoft 365 a échoué. Réessayez ou utilisez ' +
            'votre mot de passe.',
      };
    }
    reponse = data ?? null;
  } catch {
    return {
      ok: false,
      message: 'Connexion impossible : vérifiez votre accès internet, puis ' +
        'réessayez.',
    };
  }

  const jeton = reponse?.verifyToken;
  const email = reponse?.email;
  if (typeof jeton !== 'string' || jeton.length === 0 ||
      typeof email !== 'string' || email.length === 0) {
    return {
      ok: false,
      message: 'Réponse inattendue du serveur. Réessayez la connexion.',
    };
  }

  const { error: erreurSession } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: jeton,
  });
  if (erreurSession) {
    // Cas réel : le jeton a expiré entre l'émission et l'appel (onglet laissé
    // ouvert). Le message le dit, plutôt que de parler d'un « OTP invalide »
    // que personne ne relie à Microsoft.
    console.warn('[m365] ouverture de session refusée');
    return {
      ok: false,
      message: 'La session n’a pas pu être ouverte. Recommencez la ' +
        'connexion.',
    };
  }

  return { ok: true, email, compteCree: reponse?.compteCree === true };
}
