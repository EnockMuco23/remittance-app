import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function AgentDashboardPage() {
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

  if (profileError || !profile || profile.role !== "agent") {
    redirect("/dashboard");
  }

  const { data: transfers, error } = await supabase
    .from("transfer_requests")
    .select("*")
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Agent Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            Welcome, {profile.full_name}.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Total Transfers
            </p>

            <p className="mt-2 text-3xl font-bold">
              {transfers?.length || 0}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Awaiting Approval
            </p>

            <p className="mt-2 text-3xl font-bold">
              {transfers?.filter(
                (transfer) => transfer.status === "requested"
              ).length || 0}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Completed
            </p>

            <p className="mt-2 text-3xl font-bold">
              {transfers?.filter(
                (transfer) => transfer.status === "completed"
              ).length || 0}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b p-6">
            <h2 className="text-xl font-bold">
              Assigned Transfers
            </h2>
          </div>

          {!transfers || transfers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                No transfers have been assigned to you.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      Recipient
                    </th>

                    <th className="px-6 py-4 text-left">
                      Amount
                    </th>

                    <th className="px-6 py-4 text-left">
                      Destination
                    </th>

                    <th className="px-6 py-4 text-left">
                      Status
                    </th>

                    <th className="px-6 py-4 text-left">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {transfers.map((transfer) => (
                    <tr
                      key={transfer.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {transfer.recipient_name}
                        </Link>
                      </td>

                      <td className="px-6 py-4">
                        {transfer.amount} {transfer.currency}
                      </td>

                      <td className="px-6 py-4">
                        {transfer.destination_country}
                      </td>

                      <td className="px-6 py-4 capitalize">
                        {transfer.status.replaceAll("_", " ")}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(
                          transfer.created_at
                        ).toLocaleDateString()}
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