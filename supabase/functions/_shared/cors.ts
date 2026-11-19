// Colle CORS du projet — posée par la recette `edge-kit` du socle.
//
// Le socle ne lit JAMAIS l'environnement (règle d'ADR-001, cf.
// `edge/mintJwt`). Ce fichier est le seul endroit du projet qui sait d'où
// viennent les origines autorisées. Le renommer, ou changer la variable, ne
// touche pas le socle.
//
// 🔴 FAIL-CLOSED. `ALLOWED_ORIGINS` absente ⇒ AUCUNE origine autorisée, et
// la réponse ne porte aucun `Access-Control-Allow-Origin`. Ce n'est pas une
// panne : c'est l'arbitrage MOA du 2026-09-09. L'ancien défaut « ouvert (*) »
// ne peut plus se produire par omission.
import {
  enTetesCors,
  originesDepuisListe,
  reponseJson,
  reponsePrevol,
  type ConfigCors,
} from './socle/edge/cors.ts';

const CONFIG: ConfigCors = {
  originesAutorisees: originesDepuisListe(Deno.env.get('ALLOWED_ORIGINS')),
  // Aucune règle de sous-domaine : choix fait à l'instanciation.
};

export const enTetes = (req?: Request) => enTetesCors(CONFIG, req);
export const prevol = (req: Request) => reponsePrevol(CONFIG, req);
export const json = (corps: unknown, statut = 200, req?: Request) =>
  reponseJson(CONFIG, corps, statut, req);
