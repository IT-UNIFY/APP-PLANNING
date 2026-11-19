// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (edge/validation.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Validation d'entrée minimale pour une Edge Function — e-mail, UUID,
 * tableau de chaînes, corps JSON.
 *
 * Porté depuis `_shared/validation.ts` d'APP-FACTU et d'APP-MSP, qui en
 * portaient deux copies **identiques à l'octet** (33 lignes chacune). C'est le
 * module le plus simple du lot, et le seul dont le portage ne demandait aucun
 * arbitrage.
 *
 * ⭐ POURQUOI `ErreurValidation` EST UNE CLASSE ET GARDE `__validation`.
 * La copie d'origine levait un `Error` marqué d'une propriété
 * `__validation: true`, et **huit fonctions Edge d'APP-FACTU testent ce
 * marqueur** dans leur `catch` pour répondre 422. Le supprimer casserait ces
 * huit fonctions en silence — le `catch` compilerait toujours. Le socle en
 * fait donc une vraie classe *et* conserve le marqueur : `instanceof` marche
 * pour le neuf, le marqueur marche pour l'existant.
 */

const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOTIF_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Longueur maximale d'une adresse e-mail (RFC 5321). */
export const LONGUEUR_MAX_EMAIL = 254;

/**
 * Corps de requête illisible. Porte `__validation: true` pour rester
 * compatible avec les `catch` qui l'attendent — voir l'en-tête du module.
 */
export class ErreurValidation extends Error {
  readonly __validation = true as const;
  constructor(message = 'Corps JSON invalide.') {
    super(message);
    this.name = 'ErreurValidation';
  }
}

export function estEmail(valeur: unknown): valeur is string {
  return (
    typeof valeur === 'string' &&
    valeur.length <= LONGUEUR_MAX_EMAIL &&
    MOTIF_EMAIL.test(valeur)
  );
}

export function estUuid(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && MOTIF_UUID.test(valeur);
}

export function estTableauDeChaines(valeur: unknown): valeur is string[] {
  return (
    Array.isArray(valeur) && valeur.every((v) => typeof v === 'string')
  );
}

/**
 * Lit le corps JSON d'une requête. Lève `ErreurValidation` si le corps n'est
 * pas du JSON — jamais l'erreur brute du runtime, dont le message varie d'une
 * plateforme à l'autre et fuiterait dans une réponse.
 */
export async function lireJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErreurValidation();
  }
}
