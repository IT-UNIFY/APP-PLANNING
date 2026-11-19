// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/etatRetour.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Relecture, côté navigateur, du `state` rendu par Microsoft.
 *
 * ADR-0109. Le serveur relit ce même `state` de son côté
 * (`supabase/functions/_shared/m365/etat.ts`) — les deux lectures sont
 * volontairement SÉPARÉES : celle-ci ne sert qu'à deux usages locaux, le
 * contrôle du nonce et la destination de retour. Le serveur ne fait aucune
 * confiance à ce que le front en tire, et réciproquement.
 *
 * NE JAMAIS LEVER. Le `state` arrive d'une URL : il peut être tronqué,
 * réécrit, absent. Une exception ici laisserait la page de retour en écran
 * blanc, sans même le lien « revenir à l'écran de connexion ».
 */

export interface EtatRetourM365 {
  tenant_row_id?: string;
  nonce?: string;
  return_to?: string;
}

/** Décode le `state`, ou rend `null` si rien d'exploitable n'en sort. */
export function analyserEtatRetour(brut: string): EtatRetourM365 | null {
  try {
    const normalise = brut.replace(/-/g, '+').replace(/_/g, '/');
    const complete = normalise + '='.repeat((4 - (normalise.length % 4)) % 4);
    const analyse: unknown = JSON.parse(atob(complete));
    if (typeof analyse !== 'object' || analyse === null ||
        Array.isArray(analyse)) {
      return null;
    }
    const objet = analyse as Record<string, unknown>;
    const etat: EtatRetourM365 = {};
    if (typeof objet.tenant_row_id === 'string') {
      etat.tenant_row_id = objet.tenant_row_id;
    }
    if (typeof objet.nonce === 'string') etat.nonce = objet.nonce;
    // `return_to` sert à `navigate()`. On n'accepte QU'un chemin interne :
    // une valeur absolue (`https://…`) ou protocole-relative (`//…`) ferait
    // de la page de retour un tremplin de redirection ouverte, utilisable
    // dans un courriel d'hameçonnage.
    if (typeof objet.return_to === 'string' &&
        objet.return_to.startsWith('/') &&
        !objet.return_to.startsWith('//')) {
      etat.return_to = objet.return_to;
    }
    return etat;
  } catch {
    return null;
  }
}
