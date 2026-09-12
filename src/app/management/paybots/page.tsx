import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../../dashboard/logout-button";
import ApprovePaybotButton from "./approve-paybot-button";

export default async function ManagementPaybotsPage() {
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

  const { data: registrations, error } = await supabase
    .from("paybot_registrations")
    .select(
      "id, full_name, email, requested_countries, status, created_at"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Paybot registrations error:", error);
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Paybot Management
            </h1>

            <p className="mt-2 text-gray-600">
              Review and approve Paybot applications.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/management"
              className="rounded bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow hover:bg-gray-50"
            >
              Dashboard
            </Link>

            <LogoutButton />
          </div>
        </div>

        <div className="rounded-lg bg-white shadow">
          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Pending Applications
            </h2>
          </div>

          {!registrations || registrations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                No pending Paybot applications.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      Name
                    </th>

                    <th className="px-6 py-4 text-left">
                      Email
                    </th>

                    <th className="px-6 py-4 text-left">
                      Requested Countries
                    </th>

                    <th className="px-6 py-4 text-left">
                      Date
                    </th>

                    <th className="px-6 py-4 text-left">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {registrations.map((registration) => (
                    <tr key={registration.id}>
                      <td className="px-6 py-4 font-medium">
                        {registration.full_name}
                      </td>

                      <td className="px-6 py-4">
                        {registration.email}
                      </td>

                      <td className="px-6 py-4">
                        {registration.requested_countries.join(", ")}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(
                          registration.created_at
                        ).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-4">
                        <ApprovePaybotButton
                          registrationId={registration.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}