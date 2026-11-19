// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (m365-auth/nonceM365.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * Le `nonce` du parcours SSO — écrit à l'aller, relu au retour.
 *
 * Portage d'APP-FACTU `src/components/auth/m365/nonceM365.ts` (ADR-0109,
 * repris d'ADR-057 §2.10). Extrait vers le socle — ADR-001, Lot 3.
 *
 * À QUOI IL SERT. Il lie CE retour à CE départ, dans CET onglet. Sans lui,
 * une URL de retour interceptée (historique, journal de serveur mandataire,
 * lien recopié) pourrait être rejouée dans un autre navigateur. Le contrôle
 * est fait côté navigateur : le serveur n'a pas gardé trace de la valeur
 * émise. Un durcissement en base reste possible ; il n'est pas fait.
 *
 * ── CE QUI A CHANGÉ À L'EXTRACTION ────────────────────────────────────────
 * APP-FACTU appelait `sessionStorage` directement. Le module n'était alors
 * testable que dans un navigateur — le même défaut que `Deno.env` dans
 * `mintJwt`, et la même réponse : **l'appelant fournit son stockage**
 * (ADR-001 D4, contrainte 3). `stockageSession()` reste la mise en œuvre
 * évidente, et elle est fournie ici : l'inversion ne coûte rien à l'appelant
 * courant, et rend le contrôle anti-rejeu vérifiable hors navigateur.
 */

/**
 * Le stockage du nonce, vu par ce module. Trois opérations, rien d'autre.
 *
 * Aucune ne doit LEVER : voir `stockageSession()` pour la raison.
 */
export interface StockageNonce {
  lire(): string | null;
  ecrire(valeur: string): void;
  effacer(): void;
}

const CLE = 'm365.nonce';

/**
 * Le stockage évident : `sessionStorage`, à la portée de l'onglet.
 *
 * POURQUOI `sessionStorage` ET NON `localStorage`. La portée est l'onglet : le
 * nonce meurt avec lui. Un `localStorage` survivrait au parcours et traînerait
 * sur la machine sans rien protéger de plus.
 *
 * TOUT EST ENVELOPPÉ. Un navigateur en navigation privée, ou réglé pour
 * refuser le stockage, fait **LEVER** `sessionStorage` — pas seulement
 * renvoyer `null`. Sans ces `try`, la page de connexion tomberait en écran
 * blanc pour un simple réglage de confidentialité.
 */
export function stockageSession(): StockageNonce {
  return {
    lire() {
      try {
        return sessionStorage.getItem(CLE);
      } catch {
        return null;
      }
    },
    ecrire(valeur: string) {
      try {
        sessionStorage.setItem(CLE, valeur);
      } catch {
        // Stockage refusé : le contrôle anti-rejeu ne pourra pas se faire au
        // retour, et `verifierNonce` refusera. C'est le bon sens du refus —
        // mieux vaut une connexion qui échoue qu'un contrôle qu'on croit
        // actif.
      }
    },
    effacer() {
      try {
        sessionStorage.removeItem(CLE);
      } catch {
        // Rien à faire : la valeur mourra avec l'onglet.
      }
    },
  };
}

/**
 * Un nonce imprévisible.
 *
 * `crypto.getRandomValues` n'est pas injecté : il est présent dans les
 * navigateurs, sous Node depuis la 19 et sous Deno. Contrairement au
 * stockage, il ne rend le module intestable nulle part.
 */
export function fabriquerNonce(): string {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare le nonce reçu à celui posé au départ.
 *
 * FAIL-CLOSED : une valeur absente d'un côté ou de l'autre **REFUSE**. Un
 * `state` sans nonce, ou un stockage vidé entre-temps, ne doit pas valoir un
 * contrôle réussi.
 */
export function verifierNonce(
  recu: string | undefined,
  stockage: StockageNonce,
): boolean {
  const attendu = stockage.lire();
  if (!attendu || !recu) return false;
  return attendu === recu;
}
