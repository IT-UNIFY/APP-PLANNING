// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/identifiants.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Choix des identifiants à essayer (essai de connexion M365).
// ----------------------------------------------------------------------
// Portage d'APP-FIX (ADR-064 lot 2). Sans import d'exécution, donc testable.
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// Deux modes, et le premier gagne :
//   - « saisie en cours » : le corps porte `tenant_id`, `client_id` et
//     `client_secret`. C'est le cas du bouton « Tester » AVANT
//     d'enregistrer — tout l'intérêt de l'exercice, puisqu'il évite d'écrire
//     une configuration fausse ;
//   - « configuration enregistrée » : le corps porte `id` seul, la clé est
//     relue dans Vault côté serveur.

import type { IdentifiantsEntra } from './entra.ts';

/** uuid v1-v5, casse indifférente. */
const MOTIF_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extrait un trio complet du corps, ou `null` si le corps ne le porte pas.
 * Les deux uuid sont normalisés en minuscules ; la clé n'est jamais touchée.
 */
export function choisirSaisieEnCours(
  corps: unknown,
): IdentifiantsEntra | null {
  if (typeof corps !== 'object' || corps === null) return null;
  const brut = corps as Record<string, unknown>;
  const locataire = brut.tenant_id;
  const application = brut.client_id;
  const cle = brut.client_secret;
  if (typeof locataire !== 'string' || typeof application !== 'string' ||
      typeof cle !== 'string') {
    return null;
  }
  if (!MOTIF_UUID.test(locataire) || !MOTIF_UUID.test(application)) return null;
  if (cle.length < 8 || cle.length > 512) return null;
  return {
    tenant_id: locataire.toLowerCase(),
    client_id: application.toLowerCase(),
    client_secret: cle,
  };
}

/** Extrait l'identifiant d'une configuration enregistrée, ou `null`. */
export function choisirConfigurationEnregistree(corps: unknown): string | null {
  if (typeof corps !== 'object' || corps === null) return null;
  const brut = corps as Record<string, unknown>;
  return typeof brut.id === 'string' && MOTIF_UUID.test(brut.id)
    ? brut.id
    : null;
}
