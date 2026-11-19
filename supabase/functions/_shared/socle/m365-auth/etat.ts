// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/etat.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Lecture du paramètre `state` du retour OAuth Microsoft 365.
 *
 * Extrait d'APP-FACTU `supabase/functions/_shared/m365/etat.ts`, lui-même
 * portage d'APP-FIX `m365-login-callback/state.ts` (ADR-057). Socle : ADR-001,
 * Lot 3.
 *
 * Module PUR : aucune entrée/sortie, aucun accès au réseau, à la base ou à
 * l'environnement. Il ne connaît que des chaînes.
 *
 * ── CE QUE `state` PORTE, ET CE QU'IL NE PROUVE PAS ───────────────────────
 * Le front y scelle le `tenant_row_id` du locataire choisi par la RPC
 * d'aiguillage, plus un `nonce`. Le paramètre traverse le navigateur de la
 * personne : il est **LISIBLE et MODIFIABLE**. Il ne porte donc **aucune
 * autorité**. Un `tenant_row_id` substitué ne donne rien — l'échange du code
 * qui suit est épinglé au locataire ET à la clé secrète Vault de CE
 * locataire, que l'attaquant n'a pas.
 *
 * ── LE `nonce` N'EST PAS COMPARÉ ICI ──────────────────────────────────────
 * Il est vérifié côté navigateur, dans `sessionStorage`, contre le rejeu
 * d'une URL de retour. On l'expose sans le comparer : le serveur n'a pas
 * gardé trace de la valeur émise. Un durcissement (nonce en base, à usage
 * unique) reste possible ; il n'est pas fait.
 *
 * `expected_email` est exposé pour un contrôle défensif futur — pas comparé
 * non plus. Aucun de ces deux champs n'est requis.
 *
 * ── TOLÉRANCE base64 / base64url ──────────────────────────────────────────
 * Le front encode avec `btoa` (base64 standard), mais la valeur traverse une
 * query string : un intermédiaire peut la rendre en base64url (`-` et `_`),
 * et le remplissage `=` peut sauter. On accepte les deux formes — refuser un
 * retour valable pour un caractère de remplissage donnerait une panne de
 * connexion sans cause lisible.
 */

const MOTIF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contenu du `state`, après décodage et contrôle de forme. */
export interface EtatOauth {
  tenant_row_id: string;
  nonce?: string;
  return_to?: string;
  expected_email?: string;
}

export type ResultatEtat =
  | { ok: true; etat: EtatOauth }
  | { ok: false; motif: string };

/**
 * Décode le `state` (JSON encodé en base64) et contrôle sa forme.
 *
 * Chaque forme cassée rend un motif **distinct** : sans cela, une panne de
 * connexion se présente comme « state invalide » et rien ne dit laquelle des
 * causes s'est produite. Les motifs sont destinés aux journaux, jamais à la
 * réponse rendue au visiteur.
 *
 * @param brut la valeur reçue dans le corps de la requête.
 * @returns l'état lu, ou un motif de refus.
 */
export function analyserEtat(brut: unknown): ResultatEtat {
  if (typeof brut !== 'string' || brut.length === 0) {
    return { ok: false, motif: 'etat_absent' };
  }

  let json: string;
  try {
    json = decoderBase64Json(brut);
  } catch {
    return { ok: false, motif: 'etat_pas_base64' };
  }

  let analyse: unknown;
  try {
    analyse = JSON.parse(json);
  } catch {
    return { ok: false, motif: 'etat_pas_json' };
  }
  if (typeof analyse !== 'object' || analyse === null || Array.isArray(analyse)) {
    return { ok: false, motif: 'etat_pas_objet' };
  }
  const objet = analyse as Record<string, unknown>;

  const idLigne = objet.tenant_row_id;
  if (typeof idLigne !== 'string' || !MOTIF_UUID.test(idLigne)) {
    return { ok: false, motif: 'etat_tenant_row_id_invalide' };
  }

  const etat: EtatOauth = { tenant_row_id: idLigne.toLowerCase() };
  if (typeof objet.nonce === 'string' && objet.nonce.length > 0) {
    etat.nonce = objet.nonce;
  }
  if (typeof objet.return_to === 'string' && objet.return_to.length > 0) {
    etat.return_to = objet.return_to;
  }
  if (typeof objet.expected_email === 'string' && objet.expected_email.length > 0) {
    etat.expected_email = objet.expected_email;
  }
  return { ok: true, etat };
}

function decoderBase64Json(brut: string): string {
  const normalise = brut.replace(/-/g, '+').replace(/_/g, '/');
  const complete = normalise + '='.repeat((4 - (normalise.length % 4)) % 4);
  const binaire = atob(complete);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) {
    octets[i] = binaire.charCodeAt(i);
  }
  // `fatal: true` : un contenu qui n'est pas de l'UTF-8 valable doit sortir en
  // « pas base64 » plutôt que produire des caractères de remplacement, qui
  // feraient ensuite échouer `JSON.parse` sous un motif trompeur.
  return new TextDecoder('utf-8', { fatal: true }).decode(octets);
}
