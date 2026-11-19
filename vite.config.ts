import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

// Tailwind CSS 4 — plugin Vite officiel, préféré à PostCSS. Pas de
// `tailwind.config.js` : la configuration est CSS-first, via les directives
// `@theme` / `@custom-variant` de `src/styles/global.css`.

// Métadonnées de build injectées au chargement de la config, pour un pied de
// page de version. Repli robuste : Git → variables d'environnement (build sans
// `.git`) → « inconnu ». Le build ne doit JAMAIS échouer faute de Git.
function calculerMetadonneesVersion(): {
  pr: string | null;
  sha: string;
  builtAt: string;
} {
  const builtAt = new Date().toISOString();
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const sujets = execSync('git log -30 --pretty=%s', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    const correspondance = sujets.match(/#(\d+)/);
    const pr = correspondance ? correspondance[1] : null;
    return { pr, sha, builtAt };
  } catch {
    const shaEnv = process.env.VITE_BUILD_SHA;
    const prEnv = process.env.VITE_BUILD_PR;
    if (shaEnv || prEnv) {
      return { pr: prEnv ?? null, sha: shaEnv ?? 'inconnu', builtAt };
    }
    return { pr: null, sha: 'inconnu', builtAt };
  }
}

export default defineConfig({
  // Alias du socle VENDORISÉ — doit rester en phase avec `paths` de
  // tsconfig.app.json. TypeScript résout par l'un, Vite par l'autre : les
  // désaccorder donne un build qui compile et un bundle qui casse.
  //
  // 🔴 `process.cwd()` ET NON `import.meta.url`, exactement comme dans
  // `vitest.config.ts`. Ce squelette n'installe pas `@types/node`, et
  // `tsconfig.node.json` ne charge pas la bibliothèque DOM : ni `URL` ni
  // `import.meta.url` n'y sont déclarés. La forme d'origine faisait échouer
  // `npm run verify` d'un projet NEUF sur
  // « TS2304 Cannot find name 'URL' » — mesuré le 2026-09-10 sur une
  // instanciation à blanc. Le piège était déjà connu et documenté dans
  // `vitest.config.ts` ; il n'avait pas été appliqué ici.
  resolve: {
    alias: { '@socle': `${process.cwd()}/supabase/functions/_shared/socle` },
  },
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(calculerMetadonneesVersion()),
  },
  server: {
    port: 5175,
  },
});
