/**
 * Politique de liaison : REFUSER une adresse inconnue.
 *
 * Choisi à l'instanciation (ADR-001 D17). Posture d'un outil interne : la
 * personne doit avoir été provisionnée par un administrateur. Une adresse
 * Microsoft valide, dans un domaine déclaré, ne suffit pas à entrer.
 *
 * Pour changer de posture, remplacer ce fichier par la variante « créer » —
 * et mesurer d'abord ce que cela ouvre. Ce n'est pas un réglage.
 */
import type { PolitiqueLiaison } from '../_shared/socle/m365-auth/index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Même signature que la variante « créer », pour que le câblage soit
// identique dans les deux cas : `index.ts` n'a pas à savoir laquelle est là.
// Le client n'est pas utilisé — refuser ne demande aucun accès.
export function creerPolitique(_admin: SupabaseClient): PolitiqueLiaison {
  return { mode: 'refuser_si_absent' };
}
