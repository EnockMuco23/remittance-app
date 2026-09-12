import Link from "next/link";
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

  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  // Send users to the correct dashboard for their role.
  if (profile.role === "agent") {
    redirect("/agent");
  }

  if (profile.role === "paybot") {
    redirect("/paybot");
  }

  if (profile.role === "auditor") {
    redirect("/auditor");
  }

  if (profile.role === "management") {
    redirect("/management");
  }

  if (profile.role !== "client") {
    redirect("/login");
  }

  // Get the client's recent transfers.
  const { data: recentTransfers, error: transfersError } =
    await supabase
      .from("transfer_requests")
      .select(
        "id, amount, currency, recipient_name, destination_country, status, created_at, completed_at"
      )
      .eq("client_id", user.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(5);

  if (transfersError) {
    console.error(
      "Recent transfers error:",
      transfersError
    );
  }

  // Get recent transaction activity for the client.
  const transferIds =
    recentTransfers?.map(
      (transfer) => transfer.id
    ) ?? [];

  let recentEvents: Array<{
    id: string;
    transaction_id: string;
    event_type: string;
    notes: string | null;
    created_at: string;
  }> = [];

  if (transferIds.length > 0) {
    const { data: events, error: eventsError } =
      await supabase
        .from("transaction_events")
        .select(
          "id, transaction_id, event_type, notes, created_at"
        )
        .in("transaction_id", transferIds)
        .order("created_at", {
          ascending: false,
        })
        .limit(8);

    if (eventsError) {
      console.error(
        "Recent transaction events error:",
        eventsError
      );
    } else {
      recentEvents = events ?? [];
    }
  }

  function getStatusClasses(status: string) {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";

      case "rejected":
      case "cancelled":
        return "bg-red-100 text-red-800";

      case "requested":
        return "bg-yellow-100 text-yellow-800";

      default:
        return "bg-blue-100 text-blue-800";
    }
  }

  function formatStatus(status: string) {
    return status.replaceAll("_", " ");
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Client Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <LogoutButton />
        </div>

        {/* Main Actions */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Link
            href="/transfers/new"
            className="rounded-lg bg-black p-6 text-white shadow transition hover:bg-gray-800"
          >
            <h2 className="text-xl font-bold">
              New Transfer
            </h2>

            <p className="mt-2 text-sm text-gray-300">
              Create a new transfer request.
            </p>
          </Link>

          <Link
            href="/transfers"
            className="rounded-lg bg-white p-6 shadow transition hover:bg-gray-50"
          >
            <h2 className="text-xl font-bold">
              My Transfers
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              View your existing transfer requests
              and their status.
            </p>
          </Link>
        </div>

        {/* Recent Transfers */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Recent Transfers
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Your most recent transfer requests.
              </p>
            </div>

            <Link
              href="/transfers"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View All
            </Link>
          </div>

          {!recentTransfers ||
          recentTransfers.length === 0 ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
              <p className="text-sm text-gray-500">
                You have not created any transfers yet.
              </p>

              <Link
                href="/transfers/new"
                className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
              >
                Create your first transfer →
              </Link>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b text-left text-sm text-gray-500">
                    <th className="pb-3 font-medium">
                      Recipient
                    </th>

                    <th className="pb-3 font-medium">
                      Amount
                    </th>

                    <th className="pb-3 font-medium">
                      Destination
                    </th>

                    <th className="pb-3 font-medium">
                      Status
                    </th>

                    <th className="pb-3 font-medium">
                      Date
                    </th>

                    <th className="pb-3 font-medium">
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {recentTransfers.map(
                    (transfer) => (
                      <tr
                        key={transfer.id}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-4 font-medium">
                          {transfer.recipient_name}
                        </td>

                        <td className="py-4">
                          {transfer.amount}{" "}
                          {transfer.currency}
                        </td>

                        <td className="py-4">
                          {transfer.destination_country}
                        </td>

                        <td className="py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${getStatusClasses(
                              transfer.status
                            )}`}
                          >
                            {formatStatus(
                              transfer.status
                            )}
                          </span>
                        </td>

                        <td className="py-4 text-sm text-gray-500">
                          {new Date(
                            transfer.created_at
                          ).toLocaleDateString()}
                        </td>

                        <td className="py-4 text-right">
                          <Link
                            href={`/transfers/${transfer.id}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity / Timeline */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow">
          <div>
            <h2 className="text-2xl font-bold">
              Recent Activity
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Recent updates across your transfers.
            </p>
          </div>

          {recentEvents.length === 0 ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
              <p className="text-sm text-gray-500">
                No transaction activity yet.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {recentEvents.map((event) => {
                const transfer =
                  recentTransfers?.find(
                    (item) =>
                      item.id ===
                      event.transaction_id
                  );

                return (
                  <div
                    key={event.id}
                    className="flex gap-4"
                  >
                    <div className="flex flex-col items-center">
                      <div className="mt-1 h-3 w-3 rounded-full bg-blue-600" />

                      <div className="mt-2 h-full w-px bg-gray-200" />
                    </div>

                    <div className="pb-2">
                      <p className="font-medium capitalize">
                        {formatStatus(
                          event.event_type
                        )}
                      </p>

                      {transfer && (
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="mt-1 block text-sm font-medium text-blue-600 hover:underline"
                        >
                          Transfer to{" "}
                          {transfer.recipient_name}
                        </Link>
                      )}

                      {event.notes && (
                        <p className="mt-1 text-sm text-gray-600">
                          {event.notes}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(
                          event.created_at
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}