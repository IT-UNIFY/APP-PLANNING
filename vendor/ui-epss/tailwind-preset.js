// Preset Tailwind v3 de la charte ERP EPSS. Repris du `tailwind.config.js`
// d'APP-GDC (pre-prod-test, ADR-047), sans les jetons historiques propres à
// GDC (`surface`, `ink`, `border`, `epss-*`).
//
// Usage (consommateur) :
//   import erp from '@it-unify/ui-epss/tailwind-preset';
//   export default { presets: [erp], content: [...] };
// et `import '@it-unify/ui-epss/tokens.css'` dans le point d'entrée,
// avec `data-module="<id>"` sur <html>.
const rgb = (token) => `rgb(var(${token}) / <alpha-value>)`;
const erp = (name) => rgb(`--erp-${name}-rgb`);
const etat = (name) => ({
  DEFAULT: erp(`etat-${name}`),
  fond: erp(`etat-${name}-fond`),
  filet: erp(`etat-${name}-filet`),
});
// Taille et interligne passent par des variables : un projet qui grossit
// l'échelle (GDC : maquette + 1 px) redéfinit `--erp-fs-*` / `--erp-lh-*`.
const taille = (nom, fontWeight, letterSpacing) => [
  `var(--erp-fs-${nom})`,
  { lineHeight: `var(--erp-lh-${nom})`, fontWeight, ...(letterSpacing && { letterSpacing }) },
];

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        encre: erp('encre'),
        gris: { texte: erp('gris-texte'), discret: erp('gris-discret') },
        'contour-champ': erp('contour-champ'),
        filet: erp('filet'),
        fond: erp('fond'),
        carte: erp('carte'),
        module: {
          principale: erp('module-principale'),
          accent: erp('module-accent'),
          action: erp('module-action'),
          'action-survol': erp('module-action-survol'),
          'fond-clair': erp('module-fond-clair'),
          foncee: erp('module-foncee'),
        },
        etat: {
          erreur: etat('erreur'),
          avertissement: etat('avertissement'),
          succes: etat('succes'),
          info: etat('info'),
        },
      },
      fontFamily: { erp: 'var(--erp-font-sans)' },
      fontSize: {
        'titre-page': taille('titre-page', '800', '-0.5px'),
        'titre-section': taille('titre-section', '700'),
        'titre-carte': taille('titre-carte', '700'),
        texte: taille('texte', '400'),
        'texte-petit': taille('texte-petit', '400'),
        libelle: taille('libelle', '700', '0.6px'),
        bouton: taille('bouton', '600'),
      },
      borderRadius: {
        champ: 'var(--erp-radius-sm)',
        bouton: 'var(--erp-radius-md)',
        carte: 'var(--erp-radius-lg)',
        logo: 'var(--erp-radius-logo)',
      },
    },
  },
};
