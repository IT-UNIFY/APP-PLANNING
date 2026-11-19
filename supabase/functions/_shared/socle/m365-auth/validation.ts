// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/validation.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Validation d'une demande d'enregistrement de locataire M365.
// ----------------------------------------------------------------------
// Portage d'APP-FIX (ADR-064 lot 2). Sans import d'exécution, donc testable.
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// PRINCIPE : refuser TÔT, côté serveur, avant toute écriture. Le front valide
// aussi, mais un front n'est pas une frontière de confiance.
//
// LA RÈGLE QUI COMPTE : à la CRÉATION, la clé secrète est obligatoire. Un
// locataire sans clé ne peut pas servir de connexion — et la RPC d'aiguillage
// filtre justement sur `secret_is_set`. Permettre la création sans clé
// fabriquerait une ligne inerte qui ressemble à une configuration valable.
// À la MISE À JOUR, la clé est optionnelle : on modifie des domaines sans
// avoir à ressaisir un secret que le navigateur n'a jamais reçu.

/** Usages reconnus. `login` est le seul aujourd'hui. */
export type UsageM365 = 'login';
export const USAGES_M365: readonly UsageM365[] = ['login'];

/** Demande normalisée : uuid en minuscules, domaines dédoublonnés. */
export interface DemandeEnregistrement {
  id?: string;
  display_name: string;
  tenant_id: string;
  client_id: string;
  client_secret?: string;
  email_domains?: string[];
  purpose?: UsageM365[];
}

export type ResultatValidation =
  | { ok: true; demande: DemandeEnregistrement }
  | { ok: false; statut: number; message: string };

const MOTIF_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOTIF_DOMAINE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_DOMAINES = 50;
const MIN_CLE_SECRETE = 8;
const MAX_CLE_SECRETE = 512;

/**
 * Valide et normalise le corps d'une demande d'enregistrement.
 * @param corps corps JSON brut.
 * @returns la demande normalisée, ou un refus 400 avec un message FR.
 */
export function validerEnregistrement(corps: unknown): ResultatValidation {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return refus('Corps de requête invalide.');
  }
  const brut = corps as Record<string, unknown>;

  let id: string | undefined;
  if (brut.id !== undefined && brut.id !== null && brut.id !== '') {
    if (typeof brut.id !== 'string' || !MOTIF_UUID.test(brut.id)) {
      return refus('Identifiant de configuration invalide.');
    }
    id = brut.id;
  }
  const estCreation = id === undefined;

  const display_name = typeof brut.display_name === 'string'
    ? brut.display_name.trim()
    : '';
  if (display_name.length < 1 || display_name.length > 120) {
    return refus('Libellé requis (1 à 120 caractères).');
  }
  if (typeof brut.tenant_id !== 'string' || !MOTIF_UUID.test(brut.tenant_id)) {
    return refus('Identifiant de locataire invalide (c’est un UUID).');
  }
  if (typeof brut.client_id !== 'string' || !MOTIF_UUID.test(brut.client_id)) {
    return refus('Identifiant d’application invalide (c’est un UUID).');
  }

  let client_secret: string | undefined;
  const cleFournie = brut.client_secret !== undefined &&
    brut.client_secret !== null && brut.client_secret !== '';
  if (cleFournie) {
    if (typeof brut.client_secret !== 'string') {
      return refus('Clé secrète invalide.');
    }
    if (brut.client_secret.length < MIN_CLE_SECRETE) {
      return refus(
        `Clé secrète trop courte (${MIN_CLE_SECRETE} caractères minimum).`,
      );
    }
    if (brut.client_secret.length > MAX_CLE_SECRETE) {
      return refus(
        `Clé secrète trop longue (${MAX_CLE_SECRETE} caractères maximum).`,
      );
    }
    client_secret = brut.client_secret;
  } else if (estCreation) {
    return refus('Clé secrète requise à la création : un locataire sans clé ' +
      'ne peut pas servir de connexion.');
  }

  let email_domains: string[] | undefined;
  if (brut.email_domains !== undefined && brut.email_domains !== null) {
    const normalises = normaliserDomaines(brut.email_domains);
    if (!normalises.ok) return refus(normalises.message);
    email_domains = normalises.valeur;
  }

  let purpose: UsageM365[] | undefined;
  if (brut.purpose !== undefined && brut.purpose !== null) {
    const normalises = normaliserUsages(brut.purpose);
    if (!normalises.ok) return refus(normalises.message);
    purpose = normalises.valeur;
  }

  return {
    ok: true,
    demande: {
      id,
      display_name,
      tenant_id: brut.tenant_id.toLowerCase(),
      client_id: brut.client_id.toLowerCase(),
      client_secret,
      email_domains,
      purpose,
    },
  };
}

type Normalisation<T> = { ok: true; valeur: T } | { ok: false; message: string };

function normaliserDomaines(brut: unknown): Normalisation<string[]> {
  if (!Array.isArray(brut)) {
    return { ok: false, message: 'Liste de domaines invalide.' };
  }
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const entree of brut) {
    if (typeof entree !== 'string') {
      return { ok: false, message: 'Liste de domaines invalide.' };
    }
    const domaine = entree.trim().toLowerCase();
    if (domaine === '') continue;
    if (!MOTIF_DOMAINE.test(domaine)) {
      return { ok: false, message: `Domaine invalide : ${entree.trim()}` };
    }
    if (vus.has(domaine)) continue;
    vus.add(domaine);
    sortie.push(domaine);
    if (sortie.length > MAX_DOMAINES) {
      return {
        ok: false,
        message: `Trop de domaines (${MAX_DOMAINES} maximum).`,
      };
    }
  }
  return { ok: true, valeur: sortie };
}

function normaliserUsages(brut: unknown): Normalisation<UsageM365[]> {
  if (!Array.isArray(brut)) {
    return { ok: false, message: 'Usages invalides.' };
  }
  const vus = new Set<string>();
  const sortie: UsageM365[] = [];
  for (const entree of brut) {
    if (typeof entree !== 'string' ||
        !USAGES_M365.includes(entree as UsageM365)) {
      return {
        ok: false,
        message: `Usage inconnu. Seul « ${USAGES_M365.join(', ')} » est ` +
          'reconnu ici.',
      };
    }
    if (vus.has(entree)) continue;
    vus.add(entree);
    sortie.push(entree as UsageM365);
  }
  return { ok: true, valeur: sortie };
}

function refus(message: string): ResultatValidation {
  return { ok: false, statut: 400, message };
}
