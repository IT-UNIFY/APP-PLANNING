import { Route, Routes } from 'react-router-dom';

// Le routage est déclaré ICI, avec `react-router-dom`. Les URL doivent rester
// partageables et ajoutables aux favoris : ne pas remplacer le routeur par un
// state machine `activeView` — c'est une régression qui a déjà été payée
// ailleurs dans le parc.
//
// Les gardes d'accès (`RequireAuth`, `RequireRole`) se déclarent à ce niveau,
// pas dans les composants de page.

function Accueil() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{'APP-PLANNING'}</h1>
      <p className="text-sm">Squelette instancié. Première route à écrire.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Accueil />} />
    </Routes>
  );
}
