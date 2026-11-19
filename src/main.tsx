import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import EnvConfigError from './components/EnvConfigError';
import { isSupabaseConfigured, missingSupabaseEnv } from './lib/supabase';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Élément racine introuvable : '#root'.");
}

// Config requise absente → page d'erreur explicite plutôt qu'un écran vide.
createRoot(rootElement).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    ) : (
      <EnvConfigError missing={missingSupabaseEnv} />
    )}
  </StrictMode>,
);
