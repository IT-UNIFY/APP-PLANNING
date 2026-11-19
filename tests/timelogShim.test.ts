// @vitest-environment node
import { describe, expect, it } from 'vitest';
// Les types viennent de `.claude/hooks/shimLib.d.mts`, posé à côté du .mjs.
import { hookTargetPath, resolveShimAction } from '../.claude/hooks/shimLib.mjs';

// Ce test garde le shim de capture du temps. Il ne vérifie pas que la capture
// FONCTIONNE — elle dépend d'une couche hors dépôt — mais qu'elle DÉGRADE
// silencieusement quand cette couche est absente. Un coéquipier sans la couche
// perso ne doit voir aucune erreur.
describe('shim timelog', () => {
  it('construit le chemin du hook générique sous ~/.claude/hooks', () => {
    expect(hookTargetPath('timelog-capture', '/home/x')).toBe(
      '/home/x/.claude/hooks/timelog-capture.mjs',
    );
  });

  it('ne fait rien quand aucune cible n\'est fournie', () => {
    expect(resolveShimAction(undefined).action).toBe('noop');
  });

  it('ne fait rien quand la cible est absente de la machine', () => {
    const r = resolveShimAction('timelog-capture', '/repertoire/inexistant');
    expect(r.action).toBe('noop');
    expect(r.reason).toBe('target-absent');
  });
});
