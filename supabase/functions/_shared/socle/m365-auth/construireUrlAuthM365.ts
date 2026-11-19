// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/construireUrlAuthM365.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Construction de l'URL d'autorisation Microsoft 365 (aller du flux OAuth).
 *
 * Portage d'APP-FIX `buildM365AuthUrl.ts` (ADR-057), via APP-FACTU (ADR-0109).
 * Extrait vers le socle — ADR-001, Lot 3.
 *
 * Module PUR — ni DOM, ni `sessionStorage`, ni horloge : le `nonce` est
 * injecté. C'est ce qui rend l'URL vérifiable caractère par caractère dans un
 * test, et cette URL est exactement ce que Microsoft compare.
 */

/** Ce que la RPC `m365_tenant_for_email` rend pour une adresse. */
export interface LocataireAiguille {
  tenant_row_id: string;
  tenant_id: string;
  client_id: string;
}

export interface EntreeUrlAuth {
  locataire: LocataireAiguille;
  email: string;
  nonce: string;
  uriRetour: string;
  /** Chemin applicatif où revenir après connexion. */
  retourVers?: string;
}

const BASE_AUTORISATION = 'https://login.microsoftonline.com';

/**
 * ⭐ UNE SEULE PORTÉE POUR L'ALLER ET POUR L'ÉCHANGE.
 *
 * Entra n'accorde à l'échange que ce qui a été présenté ICI, à l'écran de
 * consentement : toute divergence sort en `AADSTS65001`, que Microsoft remonte
 * sous `invalid_grant` — donc sous un message qui parle de code expiré et
 * n'évoque jamais un consentement manquant. Piège de diagnostic coûteux.
 *
 * APP-FACTU tenait DEUX littéraux — un par côté — et un test qui vérifiait
 * leur égalité. Le socle supprime le second littéral : ce module réexporte
 * celui de l'échange. La dérive devient structurellement impossible, et le
 * test qui la surveillait n'a plus d'objet.
 *
 * `User.Read` y est nécessaire : le serveur appelle Graph `/me` pour l'adresse
 * et l'identifiant Microsoft.
 */
export { PORTEE_OAUTH_M365 } from './echange.ts';
import { PORTEE_OAUTH_M365 } from './echange.ts';

/**
 * Sérialise le `state` : un objet JSON encodé en base64.
 *
 * LE `state` N'A AUCUNE AUTORITÉ. Il traverse le navigateur de l'utilisateur,
 * donc il est lisible et modifiable. Substituer le `tenant_row_id` ne donne
 * rien : l'échange du code, côté serveur, est épinglé au locataire ET à sa
 * clé secrète Vault. Le `nonce` sert au contrôle anti-rejeu, fait au retour
 * contre `sessionStorage`.
 */
export function construireEtat(
  entree: Pick<EntreeUrlAuth, 'locataire' | 'nonce' | 'retourVers'>,
): string {
  const charge = {
    tenant_row_id: entree.locataire.tenant_row_id,
    nonce: entree.nonce,
    ...(entree.retourVers ? { return_to: entree.retourVers } : {}),
  };
  // `btoa` ne prend pas l'UTF-8, mais les champs sont des uuid et un chemin
  // applicatif — de l'ASCII. Le serveur décode en UTF-8 strict de son côté.
  return btoa(JSON.stringify(charge));
}

/** L'URL vers laquelle envoyer le navigateur. */
export function construireUrlAuthM365(entree: EntreeUrlAuth): string {
  const parametres = new URLSearchParams({
    client_id: entree.locataire.client_id,
    response_type: 'code',
    redirect_uri: entree.uriRetour,
    response_mode: 'query',
    scope: PORTEE_OAUTH_M365,
    // `select_account` : sans lui, Microsoft reconnecte en silence le compte
    // déjà ouvert dans le navigateur — y compris quand ce n'est pas celui que
    // la personne vient de saisir.
    prompt: 'select_account',
    login_hint: entree.email,
    state: construireEtat(entree),
  });
  return `${BASE_AUTORISATION}/${entree.locataire.tenant_id}` +
    `/oauth2/v2.0/authorize?${parametres.toString()}`;
}
