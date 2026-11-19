/**
 * Retour OAuth Microsoft 365 — câblage du sous-chemin `m365-auth` du socle,
 * VENDORISÉ sous `_shared/socle/` et atteint par chemin relatif.
 *
 * Posé par la recette du socle (ADR-001, Lot 3). Ce fichier ne contient AUCUNE
 * logique de connexion : elle est dans le paquet, testée là-bas. Ici, on ne
 * fait que **fournir les accès** dont le paquet a besoin.
 *
 * ⚠️ CE FICHIER EST À RELIRE, PAS À DÉPLOYER TEL QUEL. Les noms de RPC et de
 * colonnes ci-dessous sont ceux d'APP-FACTU. Si votre schéma diffère, adaptez —
 * le paquet ne connaît que la forme des réponses, pas vos tables.
 *
 * ✅ DÉPLOIEMENT : plus aucune contrainte de registre depuis le 2026-09-10.
 * Le socle est VENDORISÉ (ADR-001 D16) — le code vit sous
 * `_shared/socle/`, atteint ci-dessous par chemin relatif. Cette fonction ne
 * tire donc plus rien de `npm.pkg.github.com` : ni `.npmrc`, ni jeton, et
 * `--use-api` redevient possible.
 *
 * ⚠️ `--use-api` garde ses DEUX défauts propres, sans rapport avec le socle :
 * il ignore `static_files` (500 silencieux à l'exécution) et ne joint pas la
 * carte d'imports (400 franc à l'empaquetage). `scripts/deploy-edge.mjs` du
 * squelette porte les garde-fous.
 */

import {
  traiterRappelConnexion,
  echangerCodeAutorisation,
  lireProfilGraph,
  type DependancesRappelM365,
} from '../_shared/socle/m365-auth/index.ts';
// Spécificateur NU, résolu par `supabase/functions/deno.json`. Hors de
// `node_modules` — là où le vendoring copie — Deno n'en résout aucun tout
// seul, `import type` compris (ADR-001, B23).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// La posture choisie à l'instanciation. `politique.ts` est l'une des deux
// variantes de la recette — elles exposent la même signature, donc ce câblage
// ne change pas selon le choix.
import { creerPolitique } from './politique.ts';

const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  // `service_role` : nécessaire pour lire le secret Vault et administrer les
  // comptes. Il ne touche JAMAIS le chemin de données — le paquet rend un
  // lien magique, et c'est Supabase qui émet la session.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

/**
 * Les accès que le paquet demande. Chaque méthode est un point de contact avec
 * VOTRE schéma : c'est la seule chose que la mutualisation ne peut pas faire à
 * votre place.
 */
const dependances: DependancesRappelM365 = {
  async chargerLocataire(idLigne) {
    const { data, error } = await admin
      .from('m365_tenants')
      .select('id, tenant_id, client_id, purpose, email_domains')
      .eq('id', idLigne)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, statut: 404, code: 'locataire_introuvable',
        message: 'Connexion Microsoft 365 indisponible.' };
    }
    return { ok: true, locataire: data };
  },

  async lireCleSecrete(idLigne) {
    // Le secret vit en Vault, jamais dans la table, et n'est jamais rendu au
    // navigateur. Adapter au nom de votre RPC de lecture.
    const { data, error } = await admin.rpc('m365_tenant_secret', { p_id: idLigne });
    if (error || typeof data !== 'string' || data.length === 0) {
      return { ok: false, code: 'secret_illisible' };
    }
    return { ok: true, cle: data };
  },

  // Ces deux-là viennent du paquet : rien à écrire.
  echangerCode: echangerCodeAutorisation,
  lireProfilGraph,

  async trouverCompteParEmail(email) {
    const { data } = await admin.rpc('find_auth_user_by_email', { p_email: email });
    return typeof data === 'string' ? data : null;
  },

  async lireProfil(userId) {
    const { data, error } = await admin
      .from('profiles').select('is_active').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    return { actif: data.is_active === true };
  },

  // ⚠️ ADR-001 D17 — CE CHOIX N'A PAS DE VALEUR PAR DÉFAUT.
  // Il a été fait à l'instanciation et vit dans `politique.ts`, à côté.
  // En changer n'est pas un réglage : c'est changer la posture de sécurité
  // de l'application. Lire l'en-tête de ce fichier avant d'y toucher.
  politiqueLiaison: creerPolitique(admin),

  async majMetadonneesUtilisateur(userId, identifiantAzure) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { azure_ad_id: identifiantAzure, sso_provider: 'azure' },
    });
    return error ? { ok: false, code: 'metadonnees_impossibles' } : { ok: true };
  },

  async marquerProfilSso(userId) {
    const { error } = await admin
      .from('profiles').update({ sso_provider: 'azure' }).eq('id', userId);
    return error ? { ok: false, code: 'marquage_profil_impossible' } : { ok: true };
  },

  async genererLienMagique(email) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink', email,
    });
    if (error || !data) return { ok: false, code: 'lien_impossible' };
    return { ok: true, donnees: data as never };
  },
};

Deno.serve((req) =>
  traiterRappelConnexion(req, enTetesCors(req), dependances)
);

/**
 * CORS. Volontairement laissé ici et non dans le paquet : la liste des
 * origines autorisées est propre à chaque application, et une valeur par
 * défaut permissive (`*`) sur une fonction d'authentification serait un
 * cadeau empoisonné.
 */
function enTetesCors(req: Request): Record<string, string> {
  const origines = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  const origine = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': origines.includes(origine) ? origine : 'null',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
