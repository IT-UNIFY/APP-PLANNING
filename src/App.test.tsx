// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

function rendre(chemin: string) {
  return render(
    <MemoryRouter initialEntries={[chemin]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App — coque ERP EPSS du lot 1', () => {
  it('ouvre sur « Interventions » depuis la racine', () => {
    rendre('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Interventions' })).toBeInTheDocument();
  });

  it('porte le menu du lot 1 : Interventions et Paramètres, sans « Mon planning »', () => {
    rendre('/interventions');
    const menu = screen.getAllByRole('navigation', { name: /menu principal/i })[0];
    expect(within(menu).getByRole('link', { name: /Interventions/ })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: /Paramètres/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /Mon planning/ })).toBeNull();
  });

  it('garde « Paramètres » actif sur une rubrique des paramètres', () => {
    rendre('/parametres/import');
    expect(screen.getByRole('heading', { level: 1, name: 'Import Aurion' })).toBeInTheDocument();
    const menu = screen.getAllByRole('navigation', { name: /menu principal/i })[0];
    expect(within(menu).getByRole('link', { name: /Paramètres/ })).toHaveAttribute('aria-current', 'page');
  });

  it('redirige /parametres vers « Utilisateurs et accès »', () => {
    rendre('/parametres');
    expect(screen.getByRole('heading', { level: 1, name: 'Utilisateurs et accès' })).toBeInTheDocument();
  });

  it('affiche une page introuvable pour une adresse inconnue', () => {
    rendre('/nulle-part');
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeInTheDocument();
  });
});
