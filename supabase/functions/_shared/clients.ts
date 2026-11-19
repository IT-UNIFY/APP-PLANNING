// Fabriques de clients Supabase — posées par la recette `edge-kit`.
//
// ⭐ POURQUOI CE FICHIER EXISTE, ALORS QUE LE SOCLE PORTE LA BORDURE.
// Le socle n'importe `@supabase/supabase-js` qu'en TYPE et ne lit jamais
// l'environnement : il reste ainsi testable hors Deno et non couplé à un
// runtime. Créer un client demande les deux. Ces cinq lignes de colle sont
// donc, volontairement, chez le projet — c'est le prix de la règle, et il est
// petit.
//
// 🔴 `clientAdmin()` PORTE LE `service_role`. Il ne sert qu'à VÉRIFIER un
// droit et à écrire l'audit. La visibilité des données doit rester tranchée
// par la RLS, donc sous le JWT de l'appelant — d'où `clientAppelant`. Un
// SELECT métier fait avec `clientAdmin` contourne la RLS en silence.
import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2';
import { ErreurHttp } from './socle/edge/auth.ts';

function variableObligatoire(nom: string): string {
  const valeur = Deno.env.get(nom);
  if (!valeur) {
    throw new ErreurHttp(
      500,
      'config_error',
      `Variable d'environnement manquante : ${nom}`,
    );
  }
  return valeur;
}

/** Client `service_role` — vérification de droit et audit UNIQUEMENT. */
export function clientAdmin(): SupabaseClient {
  return createClient(
    variableObligatoire('SUPABASE_URL'),
    variableObligatoire('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Client agissant sous l'identité de l'appelant. À passer à `lireAppelant`,
 * et à utiliser pour toute lecture métier afin que la RLS s'applique.
 */
export function clientAppelant(enteteAuthorization: string): SupabaseClient {
  return createClient(
    variableObligatoire('SUPABASE_URL'),
    variableObligatoire('SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: enteteAuthorization } },
    },
  );
}
