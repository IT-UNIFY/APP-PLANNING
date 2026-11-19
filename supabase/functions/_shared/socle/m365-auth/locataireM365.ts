// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/locataireM365.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * L'aiguillage : quelle inscription Microsoft sert cette adresse ?
 *
 * Portage d'APP-FACTU (ADR-0109). Extrait vers le socle — ADR-001, Lot 3.
 *
 * ⚠️ CE QUI A CHANGÉ À L'EXTRACTION. Le client Supabase n'a plus de valeur par
 * défaut : APP-FACTU y branchait son singleton. Un socle qui embarquerait le
 * singleton d'une application ne serait plus un socle.
 *
 * La RPC `m365_tenant_for_email` est exécutable par `anon` — il le
 * faut, la question se pose AVANT toute session. Elle ne rend un locataire que
 * si le domaine est déclaré ET que la clé secrète est posée ET que `login`
 * figure dans `purpose` : les trois gardes vivent en base, pas ici.
 *
 * ⚠️ CE QUE CETTE FONCTION RÉVÈLE, ET CE QU'ELLE NE RÉVÈLE PAS. Elle dit si un
 * DOMAINE est raccordé à Microsoft — pas si un COMPTE existe. C'est
 * volontaire : sans elle, l'écran devrait proposer les deux chemins à
 * l'aveugle. Elle ne doit jamais servir à autre chose, et surtout pas à dire
 * « cette adresse est connue » ; l'écran de connexion resterait sinon un
 * oracle d'énumération.
 *
 * UNE PANNE VAUT « AUCUN LOCATAIRE ». Le parcours retombe alors sur le mot de
 * passe, qui reste le recours inconditionnel (ADR-0109 D7). L'inverse — se
 * bloquer sur une erreur — enfermerait tout le monde dehors pour une lecture
 * qui échoue.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocataireAiguille } from './construireUrlAuthM365.ts';

export async function chercherLocataireM365(
  email: string,
  client: SupabaseClient,
): Promise<LocataireAiguille | null> {
  const adresse = email.trim();
  if (adresse.length === 0) return null;

  try {
    const { data, error } = await client.rpc('m365_tenant_for_email', {
      p_email: adresse,
    });
    if (error) {
      console.warn('[m365] aiguillage indisponible', { code: error.code });
      return null;
    }
    // La RPC rend un ensemble (`returns table`) : zéro ou une ligne.
    const ligne = Array.isArray(data) ? data[0] : data;
    if (!ligne) return null;

    const brut = ligne as Record<string, unknown>;
    const rowId = brut.tenant_row_id;
    const tenantId = brut.tenant_id;
    const clientId = brut.client_id;
    if (typeof rowId !== 'string' || typeof tenantId !== 'string' ||
        typeof clientId !== 'string') {
      return null;
    }
    return {
      tenant_row_id: rowId,
      tenant_id: tenantId,
      client_id: clientId,
    };
  } catch {
    return null;
  }
}
