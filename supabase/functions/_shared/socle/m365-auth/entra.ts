// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/entra.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
// Jambe « jeton » du SSO Microsoft 365 — `client_credentials` vers Entra ID.
// ----------------------------------------------------------------------
// Portage d'APP-FIX (ADR-064 D5).
// Extrait vers le socle depuis APP-FACTU `_shared/m365/` — ADR-001, Lot 3.
//
// Deux appelants s'en servent : l'essai de connexion d'un locataire ET le
// rappel OAuth. C'est ce qui en fait un module à part, et non un détail
// d'implémentation de l'un des deux.
//
// AUCUN import d'exécution — le module n'utilise que `fetch`, global chez Deno
// comme sous Vitest. C'est ce qui rend le mappage d'erreurs testable, et ce
// mappage est la seule partie qui mérite des tests.
//
// CE QUE L'ESSAI PROUVE : le locataire existe, l'application y est inscrite, la
// clé secrète est valide et non expirée.
//
// CE QU'IL NE PROUVE PAS : rien de l'adresse de retour déclarée côté Azure.
// Celle-ci ne se contrôle que dans le parcours `authorization_code`, APRÈS la
// saisie du compte (`AADSTS50011`). Une page Microsoft qui s'affiche ne prouve
// donc presque rien. Le message rendu à l'utilisateur le dit explicitement.
//
// LE MAPPAGE VIENT D'UNE MESURE, pas d'une recopie : APP-GDC citait
// `AADSTS90002` pour le locataire introuvable ; la mesure d'APP-FIX du
// 2026-08-31 donne `AADSTS900021`. Les deux existent — `90002` pour un
// locataire NOMMÉ inexistant, `900021` pour un GUID inconnu. Notre champ étant
// un uuid, c'est `900021` qu'on rencontre ; les deux sont reconnus.
//
// SÉCURITÉ : la clé secrète n'est JAMAIS journalisée, et elle est masquée dans
// la description renvoyée par Microsoft (qui peut la recopier telle quelle).

/** Trio d'identifiants à essayer auprès d'Entra. */
export interface IdentifiantsEntra {
  tenant_id: string;
  client_id: string;
  client_secret: string;
}

/** Résultat de l'essai : un jeton, ou une panne classée et traduite. */
export type ResultatJeton =
  | { ok: true; jeton: string }
  | { ok: false; statut: number; message: string; code: string };

/** `fetch` sans borne peut tenir jusqu'à l'expiration Supabase (~150 s). */
const DELAI_MS = 10_000;

/**
 * Demande un jeton applicatif à Entra ID.
 * @param identifiants locataire, application et clé secrète.
 * @returns `{ok:true, jeton}` ou une panne classée (statut HTTP + code FR).
 */
export async function obtenirJetonApplicatif(
  identifiants: IdentifiantsEntra,
): Promise<ResultatJeton> {
  const url = `https://login.microsoftonline.com/${identifiants.tenant_id}` +
    '/oauth2/v2.0/token';
  const formulaire = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: identifiants.client_id,
    client_secret: identifiants.client_secret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formulaire.toString(),
      signal: controleur.signal,
    });
  } catch (err) {
    const abandonne = (err as Error)?.name === 'AbortError';
    // Aucun identifiant, aucune clé : seul le nom de la panne.
    console.error('[m365-entra] jeton — panne réseau', { abandonne });
    return {
      ok: false,
      statut: 502,
      message: abandonne
        ? 'Microsoft 365 n’a pas répondu dans le délai imparti.'
        : 'Microsoft 365 est injoignable. Réessayez dans un instant.',
      code: abandonne ? 'delai_depasse' : 'reseau',
    };
  } finally {
    clearTimeout(minuterie);
  }

  const donnees = await lireJson(reponse);

  if (reponse.ok) {
    const jeton = typeof donnees?.access_token === 'string'
      ? donnees.access_token
      : null;
    if (!jeton) {
      return {
        ok: false,
        statut: 502,
        message: 'Réponse inattendue de Microsoft 365.',
        code: 'reponse_inattendue',
      };
    }
    return { ok: true, jeton };
  }

  const erreur = typeof donnees?.error === 'string' ? donnees.error : '';
  const description = typeof donnees?.error_description === 'string'
    ? donnees.error_description
    : '';

  // Les codes AADSTS d'abord : ils désignent UNE panne. Le champ `error`
  // ensuite, par famille — stable mais plus large.
  //
  // ⚠️ `invalid_request` n'est PAS traité comme « locataire introuvable » :
  // c'est l'erreur OAuth générique du paramètre manquant ou malformé. Le faux
  // positif serait peu probable (les deux identifiants sont validés en uuid en
  // amont) mais le message aurait été affirmatif et faux. Il retombe donc sur
  // le cas générique, qui rend la description de Microsoft : moins précis,
  // mais vrai.
  if (contient(description, ['AADSTS900021', 'AADSTS90002'])) {
    return {
      ok: false,
      statut: 404,
      message: 'Locataire Microsoft 365 introuvable. Vérifiez son identifiant.',
      code: 'locataire_introuvable',
    };
  }
  if (contient(description, ['AADSTS700016']) ||
      erreur === 'unauthorized_client') {
    return {
      ok: false,
      statut: 401,
      message: 'Cette application n’est pas inscrite dans ce locataire.',
      code: 'application_inconnue',
    };
  }
  if (contient(description, ['AADSTS7000215']) || erreur === 'invalid_client') {
    return {
      ok: false,
      statut: 401,
      message: 'Clé secrète invalide ou expirée.',
      code: 'cle_secrete_invalide',
    };
  }

  // Cas non classé : on rend la description de Microsoft, tronquée — mais
  // JAMAIS la clé secrète, que Microsoft peut y avoir recopiée.
  const descriptionSure = description
    .split(identifiants.client_secret)
    .join('[clé masquée]');
  return {
    ok: false,
    statut: 400,
    message: descriptionSure
      ? `Microsoft 365 : ${descriptionSure.slice(0, 200)}`
      : 'Échec d’authentification auprès de Microsoft 365.',
    code: erreur || 'erreur_inconnue',
  };
}

function contient(description: string, codes: readonly string[]): boolean {
  return codes.some((code) => description.includes(code));
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
