// Écran affiché quand une variable d'environnement REQUISE manque. Il remplace
// l'écran vide qu'on obtient sinon : l'application ne peut pas démarrer sans
// client Supabase, autant le dire clairement et nommer ce qui manque.

type Props = { missing: string[] };

export default function EnvConfigError({ missing }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Configuration incomplète</h1>
        <p className="text-sm">
          L'application ne peut pas démarrer : {missing.length} variable(s)
          d'environnement manquent.
        </p>
        <ul className="list-inside list-disc font-mono text-sm">
          {missing.map((nom) => (
            <li key={nom}>{nom}</li>
          ))}
        </ul>
        <p className="text-sm">
          Copiez <code className="font-mono">.env.example</code> vers{' '}
          <code className="font-mono">.env</code>, renseignez ces valeurs, puis
          relancez le serveur de développement.
        </p>
      </div>
    </main>
  );
}
