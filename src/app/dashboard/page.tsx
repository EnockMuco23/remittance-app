import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>

          <p className="mt-4 text-gray-700">
            Welcome to the Remittance Dashboard.
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Logged in as: {user.email}
          </p>
        </div>

        <LogoutButton />
      </div>
    </main>
  );
}