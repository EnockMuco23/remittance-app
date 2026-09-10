import { createClient } from "@/lib/supabase";

export default async function Home() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("test")
    .select("*");

  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold">Remittance App</h1>

      {error ? (
        <p className="mt-4 text-red-600">
          Supabase response: {error.message}
        </p>
      ) : (
        <p className="mt-4 text-green-600">
          Supabase connection works!
        </p>
      )}
    </main>
  );
}