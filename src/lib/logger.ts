// Le SEUL endroit du front autorisé à appeler `console.*` (cf.
// `eslint.config.js`, règle `no-console`).
//
// POURQUOI UN WRAPPER. Un `console.log` oublié dans un composant part en
// production et peut y afficher des données personnelles dans la console du
// navigateur. Passer par ici rend les points de journalisation repérables en
// un grep, et permet de les couper ou de les router plus tard sans toucher aux
// appelants.

const enDeveloppement = import.meta.env.DEV;

export const logger = {
  debug(...args: unknown[]) {
    if (enDeveloppement) console.debug(...args);
  },
  info(...args: unknown[]) {
    if (enDeveloppement) console.info(...args);
  },
  // Avertissements et erreurs passent AUSSI en production : ce sont eux qu'on
  // veut voir dans un rapport d'incident.
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
};
