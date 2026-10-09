import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data, error } = await supabase
    .from("sets")
    .select("id, name, language")
    .limit(5);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">
        Pokémon Collection
      </h1>

      <div className="mt-6">
        {error ? (
          <div>
            <h2 className="font-bold text-red-600">
              Erreur Supabase
            </h2>

            <pre className="mt-2 text-sm">
              {error.message}
            </pre>
          </div>
        ) : (
          <div>
            <h2 className="font-bold">
              Connexion Supabase réussie !
            </h2>

            <p className="mt-2">
              Sets trouvés : {data.length}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}