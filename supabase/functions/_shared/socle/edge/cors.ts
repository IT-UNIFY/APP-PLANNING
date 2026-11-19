// ═══════════════════════════════════════════════════════════════════════
// GÉNÉRÉ — NE PAS ÉDITER.
//
// Recopié depuis @it-unify/boilerplate-kit@0.3.0 (edge/cors.ts) par
// scripts/vendorer-socle.mjs. Toute édition ici sera écrasée à la
// prochaine synchronisation, et fait ÉCHOUER `npm run verify` d'ici là.
//
// Pour corriger ce code : le corriger DANS LE SOCLE (APP-TEMPLATE),
// publier une version, puis `npm run socle:sync`.
// ═══════════════════════════════════════════════════════════════════════
/**
 * En-têtes CORS pour une Edge Function — **fail-closed par défaut**.
 *
 * POURQUOI CE MODULE EXISTE. Trois dépôts du parc portaient leur propre
 * `cors.ts`, et les deux conceptions étaient **incompatibles sur le défaut** :
 * APP-FIX retombait sur une origine connue quand sa configuration manquait,
 * APP-FACTU et APP-MSP répondaient `Access-Control-Allow-Origin: *`. Le socle
 * tranche (ADR-001, arbitrage MOA du 2026-09-09) : **jamais `*`**.
 *
 * ⭐ CE QUE « FAIL-CLOSED » VEUT DIRE ICI, PRÉCISÉMENT. Configuration vide,
 * origine absente, origine inconnue : la réponse ne porte **aucun**
 * `Access-Control-Allow-Origin`. Le navigateur refuse alors la lecture
 * cross-origin, et c'est le comportement voulu — une configuration oubliée
 * doit se voir en développement, pas ouvrir la production. L'ancien défaut
 * `*` d'APP-FACTU était l'objet d'une tâche ouverte ; il ne peut plus se
 * reproduire par omission.
 *
 * ⭐ POURQUOI LA CONFIGURATION EST INJECTÉE. Les deux copies lisaient
 * l'environnement elles-mêmes, sous deux noms de variables différents
 * (`ALLOWED_ORIGINS` d'un côté, `PUBLIC_APP_URL` + `PUBLIC_APP_ORIGINS` de
 * l'autre). Un socle qui choisirait un nom imposerait un renommage de secret
 * à un dépôt sur deux. Il n'en choisit aucun : l'appelant lit son
 * environnement et passe des chaînes. `originesDepuisListe` est là pour
 * découper la liste, sans jamais toucher à l'environnement.
 *
 * ⭐ CE QUI N'EST PAS ICI, ET C'EST VOULU. `getPublicAppUrl()` — présent dans
 * les deux copies — lit l'environnement pour bâtir des liens absolus. Ce n'est
 * pas du CORS, et les deux dépôts n'en tirent pas la valeur de la même
 * variable. Il reste chez eux.
 *
 * 🔴 PAS DE `Access-Control-Allow-Credentials`. L'authentification du parc
 * passe par un en-tête `Authorization: Bearer`, jamais par un cookie. Ajouter
 * cet en-tête ouvrirait un vecteur CSRF sans rien apporter. Ne pas l'ajouter
 * sans revalider ce choix — la remarque vient d'APP-FACTU et elle est juste.
 */

/** Méthodes annoncées par défaut. Les Edge du parc sont en POST + OPTIONS. */
export const METHODES_PAR_DEFAUT = 'POST, OPTIONS';

/** En-têtes de requête acceptés par défaut (Supabase + JSON). */
export const ENTETES_PAR_DEFAUT =
  'authorization, x-client-info, apikey, content-type';

/** Durée de mise en cache du pré-vol, en secondes. */
export const MAX_AGE_PAR_DEFAUT = 86_400;

export type ConfigCors = {
  /**
   * Origines autorisées, en clair (`https://app.exemple.fr`). Vide ⇒ aucune
   * origine n'est autorisée : c'est le défaut fail-closed, pas une erreur.
   */
  originesAutorisees?: readonly string[] | undefined;
  /**
   * Règle d'organisation **facultative et explicite** — par exemple
   * `/^https:\/\/([a-z0-9-]+\.)*exemple\.com$/i` pour accepter tout
   * sous-domaine HTTPS du domaine maison.
   *
   * ⚠️ APP-FIX portait cette règle **en dur et implicitement**, si bien
   * qu'aucune configuration ne la révélait. Ici elle est un paramètre : elle
   * n'existe que si l'appelant la passe, et elle se lit dans son code.
   */
  motifOrganisation?: RegExp | undefined;
  methodes?: string | undefined;
  entetes?: string | undefined;
  maxAgeSecondes?: number | undefined;
};

/**
 * Découpe une liste d'origines séparées par des virgules. Pure : ne lit pas
 * l'environnement. Les entrées vides et les espaces sont écartés.
 */
export function originesDepuisListe(valeur?: string | null): string[] {
  return (valeur ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function enTetesCommuns(config: ConfigCors): Record<string, string> {
  return {
    'Access-Control-Allow-Methods': config.methodes ?? METHODES_PAR_DEFAUT,
    'Access-Control-Allow-Headers': config.entetes ?? ENTETES_PAR_DEFAUT,
    'Access-Control-Max-Age': String(
      config.maxAgeSecondes ?? MAX_AGE_PAR_DEFAUT,
    ),
  };
}

/** Vrai si l'origine est explicitement autorisée par la configuration. */
export function origineAutorisee(
  config: ConfigCors,
  origine: string,
): boolean {
  if (!origine) return false;
  const liste = config.originesAutorisees ?? [];
  if (liste.includes(origine)) return true;
  return config.motifOrganisation?.test(origine) ?? false;
}

/**
 * En-têtes CORS d'une réponse.
 *
 * Deux modes, et le second est le seul qui juge une origine :
 *
 * - **sans `req`** — pour une fonction appelée sans navigateur (un trigger SQL
 *   par `pg_net`, un cron). On annonce l'origine **canonique**, c'est-à-dire
 *   la première de la liste. Liste vide ⇒ aucun `Allow-Origin`. Ce mode vient
 *   d'APP-FIX, qui en a un besoin réel ; il est conservé.
 * - **avec `req`** — on reflète l'origine de la requête **si** elle est
 *   autorisée, et on pose `Vary: Origin` puisque la réponse en dépend. Sinon,
 *   aucun `Allow-Origin`.
 */
export function enTetesCors(
  config: ConfigCors,
  req?: Request,
): Record<string, string> {
  const communs = enTetesCommuns(config);
  const liste = config.originesAutorisees ?? [];

  if (!req) {
    const canonique = liste[0];
    return canonique
      ? { ...communs, 'Access-Control-Allow-Origin': canonique }
      : { ...communs };
  }

  const origine = req.headers.get('Origin') ?? '';
  if (origineAutorisee(config, origine)) {
    return {
      ...communs,
      'Access-Control-Allow-Origin': origine,
      Vary: 'Origin',
    };
  }
  return { ...communs, Vary: 'Origin' };
}

/**
 * Réponse au pré-vol `OPTIONS`, ou `null` si la requête n'en est pas un.
 *
 * Le corps est vide et le statut `204` : un pré-vol n'a rien à dire. Les
 * copies d'origine renvoyaient `200` avec le corps `'ok'` — sans conséquence,
 * mais sans raison non plus.
 */
export function reponsePrevol(
  config: ConfigCors,
  req: Request,
): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: enTetesCors(config, req) });
}

/** Réponse JSON portant les en-têtes CORS. */
export function reponseJson(
  config: ConfigCors,
  corps: unknown,
  statut = 200,
  req?: Request,
): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: {
      ...enTetesCors(config, req),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
