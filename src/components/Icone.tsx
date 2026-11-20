// Icônes du Planning : tracés de la maquette du lot 1 (grille 24 × 24,
// `mockups/maquette-planning/project/Menu.dc.html` et `L1NavParam.dc.html`).
// La coque de `@it-unify/ui-epss` reçoit les icônes en `ReactNode` : elle ne
// dépend d'aucune bibliothèque d'icônes.

/** Tracé du pictogramme du module (logo du bandeau) : voir `navigation.tsx`.
    Littéral, pour que Fast Refresh accepte l'export à côté du composant. */
export const TRACE_PLANNING = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3M13 14h3';

const TRACES = {
  interv: 'M8 7a3 3 0 1 0 0 .01M3 20c0-3 2.2-5 5-5s5 2 5 5M14 8h7M14 12h7M14 16h5',
  parametres: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
  personnes: 'M5 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M2 21c0-4 3-6 7-6s7 2 7 6',
  technique:
    'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  calendrier: TRACE_PLANNING,
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 18 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
