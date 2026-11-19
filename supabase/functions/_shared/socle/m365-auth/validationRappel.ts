// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/validationRappel.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Contrôles du corps du retour OAuth, et de la garde par domaine.
// ----------------------------------------------------------------------
// Portage d'APP-FIX `m365-login-callback/validation.ts` (ADR-057).
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// Fichier distinct de `validation.ts`, qui valide l'ENREGISTREMENT d'un locataire :
// ce sont deux frontières différentes, avec deux appelants différents — l'une
// est franchie par un administrateur authentifié, l'autre par un visiteur
// anonyme qui revient de chez Microsoft.
//
// Sans import d'exécution, donc testable.

export interface CorpsRappel {
  code: string;
  redirect_uri: string;
  state: string;
}

export type ResultatCorpsRappel =
  | { ok: true; corps: CorpsRappel }
  | { ok: false; message: string; code: string };

/**
 * Contrôle la forme du corps posté par la page de retour.
 * @param brut corps JSON brut.
 */
export function validerCorpsRappel(brut: unknown): ResultatCorpsRappel {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return {
      ok: false,
      message: 'Corps de requête invalide.',
      code: 'corps_invalide',
    };
  }
  const objet = brut as Record<string, unknown>;

  const code = objet.code;
  if (typeof code !== 'string' || code.length === 0) {
    return {
      ok: false,
      message: 'Paramètre « code » manquant.',
      code: 'code_absent',
    };
  }
  const retour = objet.redirect_uri;
  if (typeof retour !== 'string' || retour.length === 0) {
    return {
      ok: false,
      message: 'Paramètre « redirect_uri » manquant.',
      code: 'redirect_uri_absent',
    };
  }
  const etat = objet.state;
  if (typeof etat !== 'string' || etat.length === 0) {
    return {
      ok: false,
      message: 'Paramètre « state » manquant.',
      code: 'state_absent',
    };
  }

  return { ok: true, corps: { code, redirect_uri: retour, state: etat } };
}

/**
 * Dit si l'adresse appartient à un domaine déclaré sur le locataire.
 *
 * ⚠️ FAIL-CLOSED : une liste VIDE n'autorise RIEN. C'est le défaut de la
 * colonne `m365_tenants.email_domains`, et c'est délibéré — un locataire
 * fraîchement créé ne doit ouvrir aucune connexion tant qu'un administrateur
 * n'a pas déclaré ses domaines. Inverser ce cas (« vide = tout ») ferait de
 * chaque création de locataire une ouverture immédiate à tout le répertoire
 * Microsoft.
 *
 * Le domaine est celui qui suit le DERNIER `@` : une partie locale citée peut
 * en contenir un (`"a@b"@exemple.fr`), et couper au premier laisserait passer
 * un domaine qui n'est pas le vrai.
 *
 * @param email adresse rendue par Microsoft Graph.
 * @param domaines domaines déclarés sur le locataire.
 */
export function domaineAutorise(email: string, domaines: string[]): boolean {
  if (domaines.length === 0) return false;
  const arobase = email.lastIndexOf('@');
  if (arobase < 0 || arobase === email.length - 1) return false;
  const domaine = email.slice(arobase + 1).trim().toLowerCase();
  if (domaine.length === 0) return false;
  return domaines.some((declare) => declare.trim().toLowerCase() === domaine);
}
