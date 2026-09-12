import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

export default async function ManagementDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "management") {
    redirect("/dashboard");
  }

  const { count: pendingPaybots } = await supabase
    .from("paybot_registrations")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Management Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <LogoutButton />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Link
            href="/management/paybots"
            className="rounded-lg bg-white p-6 shadow transition hover:shadow-md"
          >
            <p className="text-sm text-gray-500">
              Pending Paybots
            </p>

            <p className="mt-2 text-3xl font-bold">
              {pendingPaybots ?? 0}
            </p>

            <p className="mt-2 text-sm text-blue-600">
              Manage Paybot applications →
            </p>
          </Link>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Transfers
            </p>

            <p className="mt-2 text-gray-600">
              Transfer management will be added here.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Staff
            </p>

            <p className="mt-2 text-gray-600">
              Agent and auditor management will be added here.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}