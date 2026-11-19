// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (edge/auth.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Bordure d'une Edge Function : erreur HTTP, identification de l'appelant,
 * étiquette de session, écriture d'audit.
 *
 * Porté depuis `_shared/auth.ts` d'APP-MSP, qui est un **superset propre**
 * de celui d'APP-FACTU (229 lignes contre 189) : `diff` ne rend que des
 * ajouts, aucune modification. Les deux apports d'APP-MSP entrent donc ici,
 * et **corrigent APP-FACTU au passage** — à annoncer, pas à glisser :
 *
 * 1. `identifiantSessionDuJwt` — sans lui, les traces d'audit `login` ne sont
 *    pas dédupliquées et chaque rafraîchissement de jeton produit une ligne ;
 * 2. la garde `23505` de `ecrireAudit` — sans elle, une écriture concurrente
 *    sur un index de déduplication fait du bruit dans les journaux.
 *
 * ⚠️ CE QUI N'EST PAS ICI, ET QUAND IL ARRIVERA.
 *
 * **`requirePermission` est absent.** Il lit `profiles.cached_permissions`, et
 * les deux dépôts n'en ont pas la même forme : un **tableau** de chaînes
 * `"module:action"` chez APP-FIX, un **objet** `{module: {action: 'all' |
 * 'own'}}` chez APP-FACTU et APP-MSP. **ADR-001 D19** a tranché le modèle —
 * une permission est un booléen, celui d'APP-FIX — mais la reprise du cache
 * d'APP-FACTU n'est pas faite. Publier ici un lecteur de permissions
 * obligerait à choisir une forme que la moitié du parc ne porte pas encore.
 * Il arrivera avec le sous-chemin `rbac`, **après** cette reprise.
 *
 * **`clientAdmin()` est absent, et ce n'est pas un oubli.** La copie d'origine
 * appelait `createClient` et `Deno.env.get`. Le socle n'importe
 * `@supabase/supabase-js` qu'en **type** — pair optionnelle, aucun import à
 * l'exécution — et ne lit jamais l'environnement : c'est la règle posée par
 * `edge/mintJwt`. Créer le client est cinq lignes de colle propres à chaque
 * application ; les garder chez elle évite de coupler le socle à un runtime.
 * `lireAppelant` reçoit donc une **fabrique**, et garde la seule chose qui
 * mérite d'être partagée : la règle de vérification et le contrat d'erreur.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Erreur portant un statut HTTP et une charge utile JSON `{ error, message }`.
 *
 * ⭐ POURQUOI UNE EXCEPTION, ALORS QUE `m365-auth` REND DES UNIONS
 * DISCRIMINÉES. Les deux conventions ne servent pas la même chose. Une
 * fonction de **décision** rend son verdict en valeur, pour que l'appelant
 * traite chaque cas (c'est D17). Une **bordure** est levée ici et attrapée une
 * seule fois, au bord de la fonction, où elle devient une réponse. Les
 * fonctions Edge du parc portent déjà ce `catch` ; le contrat est conservé au
 * lieu d'être réinventé.
 */
export class ErreurHttp extends Error {
  readonly statut: number;
  readonly charge: Record<string, unknown>;
  constructor(
    statut: number,
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ErreurHttp';
    this.statut = statut;
    this.charge = { error: code, message, ...extra };
  }
}

/**
 * Fabrique d'un client Supabase agissant **sous l'identité de l'appelant** :
 * elle reçoit l'en-tête `Authorization` tel quel et rend un client qui le
 * porte. Fournie par l'application, en trois lignes.
 */
export type FabriqueClientAppelant = (
  enteteAuthorization: string,
) => SupabaseClient;

/**
 * Vérifie le jeton présenté par l'appelant et rend l'utilisateur.
 *
 * 🔴 LA RÈGLE D'OR, ET C'EST TOUT L'INTÉRÊT DE PARTAGER CETTE FONCTION : le
 * jeton est validé **auprès de Supabase** par `auth.getUser()`. On ne fait
 * jamais confiance à un `sub` décodé localement. Un décodage local est
 * falsifiable par quiconque sait forger un JWT non signé ; seul le serveur
 * d'authentification peut dire qu'un jeton est authentique.
 *
 * Les deux refus portent des codes **distincts** parce qu'ils ne se corrigent
 * pas de la même manière : en-tête absent ou mal formé (l'appelant a oublié de
 * l'envoyer) contre jeton rejeté (la session a expiré).
 */
export async function lireAppelant(
  req: Request,
  fabrique: FabriqueClientAppelant,
): Promise<User> {
  const entete = req.headers.get('Authorization') ?? '';
  if (!entete.toLowerCase().startsWith('bearer ')) {
    throw new ErreurHttp(
      401,
      'unauthenticated',
      "En-tête Authorization manquant ou invalide.",
    );
  }

  const client = fabrique(entete);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    throw new ErreurHttp(
      401,
      'unauthenticated',
      'Session invalide ou expirée.',
    );
  }
  return data.user;
}

/**
 * Identifiant de **session** porté par le jeton de l'appelant (claim
 * `session_id` de GoTrue), ou `null` s'il est absent ou illisible.
 *
 * ⚠️ POURQUOI ON NE REVÉRIFIE PAS LA SIGNATURE ICI. Cette fonction n'est
 * appelée qu'**après** `lireAppelant`, qui a déjà fait valider le jeton. On ne
 * relit donc la charge utile qu'à titre d'**étiquette** — jamais pour décider
 * d'une autorisation. Utilisée ainsi, elle est sûre ; utilisée pour autoriser,
 * elle serait un trou béant.
 *
 * À QUOI ÇA SERT : dédupliquer les traces d'audit `login`. Une session vaut
 * une connexion, et les rafraîchissements de jeton (environ toutes les heures)
 * la conservent — ils ne doivent donc pas produire une ligne de plus.
 *
 * FAIL-SAFE ASSUMÉ : en cas d'absence ou d'échec de décodage, rend `null`, et
 * l'appelant audite alors comme avant. Une trace en trop vaut mieux qu'une
 * trace manquante.
 */
export function identifiantSessionDuJwt(req: Request): string | null {
  try {
    const entete = req.headers.get('Authorization') ?? '';
    const jeton = entete.slice(7).trim();
    const charge = jeton.split('.')[1];
    if (!charge) return null;
    const b64 = charge.replace(/-/g, '+').replace(/_/g, '/');
    const complete = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(complete)) as { session_id?: unknown };
    return typeof claims.session_id === 'string' && claims.session_id
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

/** Actions admises par la contrainte `audit_log.action` du parc. */
export type ActionAudit =
  | 'insert'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'grant'
  | 'revoke'
  | 'invite';

export type LigneAudit = {
  /** Acteur RÉEL, jamais le `service_role`. `null` pour un acte système. */
  acteurId: string | null;
  action: ActionAudit;
  nomTable: string;
  ligneId?: string | null | undefined;
  avant?: Record<string, unknown> | null | undefined;
  apres?: Record<string, unknown> | null | undefined;
};

/**
 * Écrit une ligne d'audit avec l'acteur réel.
 *
 * ⭐ ELLE NE LÈVE JAMAIS. Un audit qui échoue ne doit pas faire échouer
 * l'action auditée — sinon une table d'audit saturée met l'application à
 * l'arrêt. L'échec est journalisé, et **sans la charge utile** : `avant` et
 * `apres` peuvent contenir des données personnelles.
 *
 * ⭐ LE CAS `23505` EST SILENCIEUX, ET C'EST VOULU. Une violation d'unicité
 * signifie qu'une trace équivalente existe déjà, posée par un appel
 * concurrent — c'est exactement ce que produisent les index de déduplication
 * (une seule ligne `login` par session). Le comportement attendu, donc pas un
 * incident, donc pas de bruit. Apport d'APP-MSP ; APP-FACTU ne l'avait pas.
 */
export async function ecrireAudit(
  clientAdmin: SupabaseClient,
  ligne: LigneAudit,
): Promise<void> {
  const { error } = await clientAdmin.from('audit_log').insert({
    actor_id: ligne.acteurId,
    action: ligne.action,
    table_name: ligne.nomTable,
    row_id: ligne.ligneId ?? null,
    before: ligne.avant ?? null,
    after: ligne.apres ?? null,
  });
  if (!error) return;
  if (error.code === '23505') return;
  console.error('écriture audit_log en échec', {
    table: ligne.nomTable,
    code: error.code,
  });
}
