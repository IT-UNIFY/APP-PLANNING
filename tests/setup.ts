// Setup Vitest partagé, exécuté AVANT chaque fichier de test, dans son propre
// environnement.
//
// Tout est CONDITIONNEL au DOM : l'environnement par défaut du projet reste
// `node`, jsdom étant un opt-in PAR FICHIER via `// @vitest-environment jsdom`.
// Charger ceci pour les tests purs les ralentirait sans rien leur apporter.
if (typeof document !== 'undefined') {
  // Matchers `toBeInTheDocument`, `toHaveFocus`, etc.
  await import('@testing-library/jest-dom/vitest');

  // ⚠️ NETTOYAGE EXPLICITE, indispensable ici : l'auto-cleanup de
  // `@testing-library/react` s'accroche à un `afterEach` GLOBAL, or ce projet
  // n'active pas `globals` dans la config Vitest (imports explicites depuis
  // 'vitest'). Sans cette ligne, les composants montés s'accumulent d'un test
  // à l'autre et les requêtes échouent en « Found multiple elements » — trois
  // faux échecs au premier essai sur APP-FACTU, le 2026-08-03.
  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');
  afterEach(cleanup);
}
