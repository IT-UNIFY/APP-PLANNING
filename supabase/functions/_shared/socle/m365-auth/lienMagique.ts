// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/lienMagique.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Extraction du jeton d'un lien magique Supabase.
// ----------------------------------------------------------------------
// Portage d'APP-FIX `m365-login-callback/magicLink.ts` (ADR-057).
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// COMMENT LA SESSION EST OUVERTE. Une fois Microsoft satisfait, il reste à
// ouvrir une session SUPABASE. On ne fabrique pas de JWT à la main : le
// serveur demande à Supabase un lien magique pour l'adresse
// (`auth.admin.generateLink`), en extrait le jeton, et le rend au front qui
// appelle `verifyOtp`. La session est donc émise par Supabase, avec sa
// rotation et sa révocation habituelles.
//
// LE PIÈGE DE NOMMAGE, et c'est tout l'objet de ce module : le SDK expose la
// propriété sous le nom `hashed_token`, alors que le paramètre attendu par
// `verifyOtp` côté navigateur s'appelle `token_hash`. Les deux désignent la
// même valeur. Un repli lit le paramètre `token_hash` (ou `token`) de
// `action_link` au cas où le SDK changerait de forme — sans ce repli, une
// montée de version casserait la connexion sans rien dire.
//
// LE JETON N'EST JAMAIS JOURNALISÉ : il ouvre une session à lui seul.

/** Forme minimale rendue par `auth.admin.generateLink`. */
export interface LienGenere {
  properties?: {
    hashed_token?: unknown;
    action_link?: unknown;
  } | null;
}

export type ResultatExtraction =
  | { ok: true; tokenHash: string }
  | { ok: false; motif: string };

/**
 * Extrait le jeton à passer à `verifyOtp`.
 * @param donnees réponse de `auth.admin.generateLink`.
 */
export function extraireTokenHash(
  donnees: LienGenere | null,
): ResultatExtraction {
  if (!donnees || !donnees.properties) {
    return { ok: false, motif: 'lien_vide' };
  }

  const hache = donnees.properties.hashed_token;
  if (typeof hache === 'string' && hache.length > 0) {
    return { ok: true, tokenHash: hache };
  }

  const lien = donnees.properties.action_link;
  if (typeof lien === 'string' && lien.length > 0) {
    try {
      const url = new URL(lien);
      const parametre = url.searchParams.get('token_hash') ??
        url.searchParams.get('token');
      if (parametre && parametre.length > 0) {
        return { ok: true, tokenHash: parametre };
      }
    } catch {
      // URL malformée : on retombe sur le motif générique ci-dessous.
    }
  }
  return { ok: false, motif: 'lien_sans_jeton' };
}
