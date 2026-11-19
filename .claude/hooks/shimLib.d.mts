// Déclarations pour shimLib.mjs (hook runtime pur, exécuté par Node hors build).
// Permet aux tests TypeScript d'importer la logique sans `any` implicite.
export function hookTargetPath(target: string | undefined, home?: string): string;

export interface ShimAction {
  action: 'delegate' | 'noop';
  reason?: 'no-target' | 'target-absent';
  path?: string;
}

export function resolveShimAction(target: string | undefined, home?: string): ShimAction;
