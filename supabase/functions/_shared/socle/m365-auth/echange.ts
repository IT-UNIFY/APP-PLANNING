// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/echange.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Échange du `code` OAuth contre un jeton utilisateur délégué.
// ----------------------------------------------------------------------
// Portage d'APP-FIX `m365-login-callback/tokenExchange.ts` (ADR-057).
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
// Deuxième jambe du SSO, à côté de `entra.ts` — et à ne pas confondre avec
// elle :
//
//   * `entra.ts` fait `client_credentials` : l'APPLICATION s'authentifie
//     auprès d'Entra, sans utilisateur. C'est l'essai de connexion.
//   * ce module fait `authorization_code` : un UTILISATEUR vient de saisir son
//     compte chez Microsoft, et le code reçu est échangé contre un jeton qui
//     parle en son nom. C'est la connexion elle-même.
//
// AUCUN import d'exécution, et `fetch` injectable — c'est ce qui rend le
// classement des pannes testable sous Vitest.
//
// ⭐ LA PORTÉE DOIT ÊTRE IDENTIQUE À CELLE DE L'ALLER. Entra n'accorde à
// l'échange que ce qui a été présenté à l'écran de consentement. Toute
// divergence sort en `AADSTS65001`, que Microsoft remonte sous le code
// `invalid_grant` — donc sous un message qui parle de code expiré et ne dit
// jamais qu'il manque un consentement. Le front construit l'URL d'autorisation
// avec la MÊME chaîne ; un test comparera les deux littéraux au moment du lot
// front.
//
// `offline_access` est volontairement ABSENT. Il produirait un jeton de
// rafraîchissement que rien ici ne lit, et sur un locataire qui restreint le
// consentement utilisateur, chaque permission superflue est un motif de refus
// de plus. Mesure d'APP-FIX du 2026-08-27.
//
// `redirect_uri` DOIT être au caractère près celui de l'aller. Il n'est pas
// construit ici : le front l'envoie dans le corps, précisément pour qu'une
// seule expression le fabrique des deux côtés (`AADSTS50011`).
//
// LA CLÉ SECRÈTE N'EST JAMAIS JOURNALISÉE, et la description rendue par
// Microsoft est tronquée avant d'aller dans les journaux.

/** Portée demandée à l'aller ET à l'échange. Les deux doivent coïncider. */
export const PORTEE_OAUTH_M365 = 'openid email profile User.Read';

/** `fetch` sans borne peut tenir jusqu'à l'expiration Supabase (~150 s). */
const DELAI_MS = 10_000;

export interface EntreeEchange {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri: string;
}

export type ResultatEchange =
  | { ok: true; jetonAcces: string; jetonIdentite: string }
  | { ok: false; statut: number; message: string; code: string };

/**
 * Échange le code d'autorisation contre un jeton d'accès délégué.
 * @param entree locataire, application, clé secrète, code et adresse de retour.
 * @param fetchImpl injectable pour les tests.
 * @returns les deux jetons, ou une panne classée (statut HTTP + code FR).
 */
export async function echangerCodeAutorisation(
  entree: EntreeEchange,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultatEchange> {
  const url = `https://login.microsoftonline.com/${entree.tenant_id}` +
    '/oauth2/v2.0/token';
  const formulaire = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: entree.client_id,
    client_secret: entree.client_secret,
    code: entree.code,
    redirect_uri: entree.redirect_uri,
    scope: PORTEE_OAUTH_M365,
  });

  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
  let reponse: Response;
  try {
    reponse = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formulaire.toString(),
      signal: controleur.signal,
    });
  } catch (err) {
    const abandonne = (err as Error)?.name === 'AbortError';
    console.error('[m365-login-callback] échange — panne réseau', {
      abandonne,
    });
    return {
      ok: false,
      statut: 502,
      message: abandonne
        ? 'Microsoft 365 n’a pas répondu dans le délai imparti.'
        : 'Microsoft 365 est injoignable. Réessayez dans un instant.',
      code: abandonne ? 'echange_delai_depasse' : 'echange_reseau',
    };
  } finally {
    clearTimeout(minuterie);
  }

  const donnees = await lireJson(reponse);

  if (reponse.ok) {
    const jetonAcces = typeof donnees?.access_token === 'string'
      ? donnees.access_token
      : '';
    const jetonIdentite = typeof donnees?.id_token === 'string'
      ? donnees.id_token
      : '';
    if (!jetonAcces) {
      console.error('[m365-login-callback] échange sans access_token');
      return {
        ok: false,
        statut: 502,
        message: 'Réponse inattendue de Microsoft 365.',
        code: 'echange_sans_jeton_acces',
      };
    }
    if (!jetonIdentite) {
      // `openid` est demandé dans la portée : Entra DOIT rendre un `id_token`.
      // Son absence signale une configuration qui n'est pas celle qu'on croit
      // — on refuse plutôt que de continuer sur une hypothèse.
      console.error('[m365-login-callback] échange sans id_token');
      return {
        ok: false,
        statut: 502,
        message: 'Réponse inattendue de Microsoft 365.',
        code: 'echange_sans_jeton_identite',
      };
    }
    return { ok: true, jetonAcces, jetonIdentite };
  }

  const erreur = typeof donnees?.error === 'string' ? donnees.error : '';
  const description = typeof donnees?.error_description === 'string'
    ? donnees.error_description
    : '';
  console.error('[m365-login-callback] échange refusé', {
    statut: reponse.status,
    erreur,
    extrait: description.slice(0, 200),
  });

  // Le message rendu à l'utilisateur reste générique : la description de
  // Microsoft cite parfois des identifiants, et l'écran de connexion est
  // public. Le détail va aux journaux, ci-dessus.
  if (erreur === 'invalid_grant') {
    return {
      ok: false,
      statut: 401,
      message: 'Code d’autorisation invalide ou expiré. Recommencez la ' +
        'connexion.',
      code: 'echange_code_invalide',
    };
  }
  if (erreur === 'invalid_client' || erreur === 'unauthorized_client') {
    return {
      ok: false,
      statut: 401,
      message: 'Configuration Microsoft 365 invalide. Prévenez votre ' +
        'administrateur.',
      code: 'echange_configuration_invalide',
    };
  }
  return {
    ok: false,
    statut: 401,
    message: 'Échec d’authentification auprès de Microsoft 365.',
    code: 'echange_refuse',
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
