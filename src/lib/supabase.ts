import { createClient } from '@supabase/supabase-js';

// ⭐ LE CLIENT SUPABASE UNIQUE DU PROJET.
//
// Ne jamais en instancier un second dans `src/**`. Deux clients = deux
// sessions, deux rafraîchissements de jeton, et des déconnexions aléatoires
// impossibles à reproduire.
//
// La clé anon est PUBLIQUE par conception : la sécurité vient des politiques
// RLS, pas du secret de la clé. La clé `service_role`, elle, ne doit jamais
// franchir la frontière du navigateur — elle reste dans `scripts/**` et
// `supabase/functions/**`.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Config absente → on le dit à l'écran. Sans ce garde, l'application démarre
// et échoue à la première requête, sur un écran vide qui n'explique rien.
export const missingSupabaseEnv = [
  url ? null : 'VITE_SUPABASE_URL',
  anonKey ? null : 'VITE_SUPABASE_ANON_KEY',
].filter((v): v is string => v !== null);

export const isSupabaseConfigured = missingSupabaseEnv.length === 0;

export const supabase = createClient(url ?? '', anonKey ?? '');
