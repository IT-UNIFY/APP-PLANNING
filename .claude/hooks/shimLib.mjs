// Logique pure du shim de câblage timelog, extraite pour être
// testable (Vitest, cf. tests/timelogShim.test.ts). Décide, sans autre effet de
// bord que la lecture d'existence de fichier, s'il faut déléguer au hook
// générique `~/.claude/hooks/<cible>.mjs` (couche perso multi-projets, hors
// dépôt) ou ne rien faire. Ne lance jamais de sous-processus : c'est le rôle du
// shim exécutable qui consomme cette décision.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Chemin absolu du hook générique correspondant à une cible (« timelog-capture »,
// « timelog-check », …), sous le `~/.claude/hooks/` de la machine.
export function hookTargetPath(target, home = homedir()) {
  return join(home, '.claude', 'hooks', `${target}.mjs`);
}

// Décide l'action du shim : `delegate` si la cible existe, sinon `noop`
// (cible absente ou non fournie) — dégradation silencieuse voulue.
export function resolveShimAction(target, home = homedir()) {
  if (!target) return { action: 'noop', reason: 'no-target' };
  const path = hookTargetPath(target, home);
  if (!existsSync(path)) return { action: 'noop', reason: 'target-absent', path };
  return { action: 'delegate', path };
}
