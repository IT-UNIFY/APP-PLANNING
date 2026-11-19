// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/graph.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Lecture de l'identité de l'utilisateur : Microsoft Graph `GET /v1.0/me`.
// ----------------------------------------------------------------------
// Portage d'APP-FIX `m365-login-callback/graph.ts` (ADR-057). Sans import
// d'exécution, `fetch` injectable — donc testable.
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// POURQUOI GRAPH ET NON L'`id_token`. L'`id_token` porte bien un `email`, mais
// ce claim n'est pas toujours vérifié et peut être absent selon la
// configuration du locataire. Graph `/me` répond depuis le répertoire
// lui-même : c'est la source, pas une copie transportée par le navigateur.
//
// `mail` PUIS `userPrincipalName`, dans cet ordre. `mail` est nul sur un compte
// sans boîte aux lettres (compte de service, invité récent) ; l'UPN est
// toujours présent. Prendre l'UPN d'abord serait tentant pour la même raison,
// mais l'UPN peut être une adresse technique (`…@locataire.onmicrosoft.com`)
// alors que `mail` porte l'adresse que la personne connaît — et c'est celle-ci
// qui doit correspondre au compte de l'application.
//
// LE JETON N'EST JAMAIS JOURNALISÉ.

/** Champs retenus du profil Microsoft. Le reste n'est pas lu. */
export interface ProfilGraph {
  id: string;
  email: string;
  nomAffiche?: string;
}

export type ResultatGraph =
  | { ok: true; profil: ProfilGraph }
  | { ok: false; statut: number; message: string; code: string };

const DELAI_MS = 10_000;

/**
 * Lit le profil de l'utilisateur qui vient de s'authentifier.
 * @param jetonAcces jeton délégué rendu par l'échange du code.
 * @param fetchImpl injectable pour les tests.
 */
export async function lireProfilGraph(
  jetonAcces: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultatGraph> {
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
  let reponse: Response;
  try {
    reponse = await fetchImpl('https://graph.microsoft.com/v1.0/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${jetonAcces}` },
      signal: controleur.signal,
    });
  } catch (err) {
    const abandonne = (err as Error)?.name === 'AbortError';
    console.error('[m365-login-callback] Graph — panne réseau', { abandonne });
    return {
      ok: false,
      statut: 502,
      message: abandonne
        ? 'Microsoft Graph n’a pas répondu dans le délai imparti.'
        : 'Microsoft Graph est injoignable. Réessayez dans un instant.',
      code: abandonne ? 'graph_delai_depasse' : 'graph_reseau',
    };
  } finally {
    clearTimeout(minuterie);
  }

  if (!reponse.ok) {
    console.error('[m365-login-callback] Graph a refusé la lecture', {
      statut: reponse.status,
    });
    return {
      ok: false,
      statut: 502,
      message: 'Microsoft Graph a refusé la lecture du profil.',
      code: 'graph_refus',
    };
  }

  const donnees = await lireJson(reponse);
  const id = typeof donnees?.id === 'string' ? donnees.id : '';
  const boite = typeof donnees?.mail === 'string' ? donnees.mail : '';
  const upn = typeof donnees?.userPrincipalName === 'string'
    ? donnees.userPrincipalName
    : '';
  const email = (boite || upn).trim();

  if (!id) {
    console.error('[m365-login-callback] Graph sans identifiant');
    return {
      ok: false,
      statut: 502,
      message: 'Réponse inattendue de Microsoft Graph.',
      code: 'graph_sans_identifiant',
    };
  }
  if (!email) {
    return {
      ok: false,
      statut: 400,
      message: 'Aucune adresse de messagerie dans ce profil Microsoft 365.',
      code: 'graph_sans_adresse',
    };
  }

  const nomAffiche = typeof donnees?.displayName === 'string'
    ? donnees.displayName.trim()
    : '';
  return {
    ok: true,
    profil: {
      id,
      email,
      nomAffiche: nomAffiche.length > 0 ? nomAffiche : undefined,
    },
  };
}

async function lireJson(
  reponse: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const valeur = await reponse.json();
    return valeur && typeof valeur === 'object'
      ? (valeur as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
