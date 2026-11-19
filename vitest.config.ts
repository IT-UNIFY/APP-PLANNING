import { defineConfig } from 'vitest/config';

// Environnement `node` PAR DÉFAUT ; jsdom en OPT-IN PAR FICHIER, via
// `// @vitest-environment jsdom` en tête du fichier de test.
//
// POURQUOI. Mettre jsdom globalement ralentit tous les tests purs (helpers,
// calculs, parseurs) sans rien leur apporter. Le coût se paie à chaque
// exécution de la suite, donc à chaque push.
//
// ⚠️ `include` est une LISTE BLANCHE : un test posé dans un dossier absent de
// cette liste n'est JAMAIS collecté — il passe pour vert alors qu'il ne tourne
// pas. Piège déjà payé sur APP-FACTU le 2026-09-01, et une seconde fois le
// 2026-09-09 sous une autre forme (voir `exclude` ci-dessous). À élargir dès
// qu'un nouveau dossier porte des tests.
export default defineConfig({
  // 🔴 TROISIÈME emplacement de l'alias `@socle`, et le PIRE à oublier.
  // Signalé par APP-FACTU le 2026-09-09 : sans lui, le build reste VERT et
  // seuls les tests virent au rouge sur « Failed to resolve import "@socle/…" ».
  // Le lecteur conclut que ses tests sont cassés, pas que sa configuration est
  // incomplète. Chez eux, la moitié des fichiers touchant `@socle` sont des
  // fichiers de test.
  //
  // Les trois emplacements, et ils doivent rester d'accord : `vite.config.ts`
  // (le build), CE fichier (les tests), `tsconfig.app.json` (les types).
  //
  // ⚠️ `process.cwd()` et NON `import.meta.url` : ce squelette n'installe pas
  // `@types/node`, donc `node:url` ne compile pas. Remarque d'APP-FACTU, qui
  // l'a rencontrée.
  resolve: {
    alias: { '@socle': `${process.cwd()}/supabase/functions/_shared/socle` },
  },
  test: {
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      // Outillage de dépôt PUR (dérivation de listes, analyse de sorties CLI).
      'scripts/**/*.test.ts',
      // Modules Edge PURS, exécutables sous Deno ET sous node.
      'supabase/functions/_shared/**/*.test.ts',
    ],
    // ⚠️ NE PAS AJOUTER ICI UNE EXCLUSION AU DOIGT MOUILLÉ.
    //
    // Un test qui utilise l'API `Deno.test` ne peut pas tourner sous Vitest :
    // le global `Deno` n'y est pas, et le fichier échoue en « Deno is not
    // defined ». La réaction naturelle est de l'exclure. C'est exactement le
    // geste qui l'orpheline : exclu d'ici et lancé par rien, il passe pour
    // vert sans jamais s'exécuter.
    //
    // 🔴 MESURÉ CHEZ APP-FACTU LE 2026-09-09 : 25 fichiers dans ce cas, dont
    // un test d'injection de prompt et un test d'assainissement HTML — des
    // défenses de sécurité qui n'avaient JAMAIS tourné, et deux tests rouges
    // depuis des semaines. La configuration y affirmait « ils tournent sous
    // `deno test` » ; aucune commande de ce nom n'existait.
    //
    // ⭐ LA RÈGLE DE CE DÉPÔT, et les deux moitiés sont nécessaires :
    //   1. un test qui utilise `Deno.test` se NOMME `*.deno.test.ts`, ce qui
    //      l'exclut d'ici par le motif ci-dessous — pas de faux échec ;
    //   2. `npm run test:edge` l'EXÉCUTE, en dérivant la liste du CONTENU
    //      (« le fichier contient `Deno.test` »), jamais d'une liste écrite à
    //      la main. Les deux commandes sont dans `verify`.
    //
    // La dérivation par le contenu est volontairement plus large que la
    // convention de nom : un fichier mal nommé échoue bruyamment ici ET tourne
    // dans `test:edge`. La redondance est le filet — elle signale le renommage
    // au lieu de laisser un trou.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.deno.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
