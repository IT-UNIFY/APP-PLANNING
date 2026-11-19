// Déclarations ambiantes minimales pour typer `vite.config.ts` (métadonnées de
// version) SANS dépendre de `@types/node`. L'ajouter régénérerait
// `package-lock.json` — piège plateforme Windows ↔ Linux pour un `npm ci`.
// Portée : `tsconfig.node.json` uniquement. Le runtime réel est Node au moment
// du build ; on ne type ici que le strict nécessaire.
declare module 'node:child_process' {
  export function execSync(
    command: string,
    options?: { stdio?: unknown },
  ): { toString(): string };
}

declare const process: {
  env: Record<string, string | undefined>;
  // `cwd()` sert aux alias `@socle` de `vite.config.ts` ET de
  // `vitest.config.ts` — la seule forme qui compile sans `@types/node`.
  cwd(): string;
};
