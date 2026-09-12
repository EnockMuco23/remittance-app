import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

export default async function AgentDashboardPage() {
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

  if (
    profileError ||
    !profile ||
    profile.role !== "agent"
  ) {
    redirect("/dashboard");
  }

  const { data: transfers, error } =
    await supabase
      .from("transfer_requests")
      .select("*")
      .eq("agent_id", user.id)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    console.error(
      "Agent transfers error:",
      error
    );
  }

  const totalTransfers =
    transfers?.length || 0;

  const awaitingApproval =
    transfers?.filter(
      (transfer) =>
        transfer.status === "requested"
    ).length || 0;

  const completed =
    transfers?.filter(
      (transfer) =>
        transfer.status === "completed"
    ).length || 0;

  // Latest five transfers for the Recent Transfers section.
  const recentTransfers =
    transfers?.slice(0, 5) || [];

  // Get recent activity for the agent's transfers.
  const transferIds =
    recentTransfers.map(
      (transfer) => transfer.id
    );

  let recentEvents: Array<{
    id: string;
    transaction_id: string;
    event_type: string;
    notes: string | null;
    created_at: string;
  }> = [];

  if (transferIds.length > 0) {
    const {
      data: events,
      error: eventsError,
    } = await supabase
      .from("transaction_events")
      .select(
        "id, transaction_id, event_type, notes, created_at"
      )
      .in(
        "transaction_id",
        transferIds
      )
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

  function getStatusClasses(
    status: string
  ) {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";

      case "rejected":
      case "cancelled":
        return "bg-red-100 text-red-800";

      case "requested":
        return "bg-yellow-100 text-yellow-800";

      case "agent_approved":
      case "payment_confirmed":
      case "sent_to_paybot":
      case "paybot_accepted":
      case "paybot_pending":
      case "recipient_paid":
        return "bg-blue-100 text-blue-800";

      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  function formatStatus(status: string) {
    return status.replaceAll(
      "_",
      " "
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Agent Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <LogoutButton />
        </div>

        {/* Summary Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Total Transfers
            </p>

            <p className="mt-2 text-3xl font-bold">
              {totalTransfers}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Awaiting Approval
            </p>

            <p className="mt-2 text-3xl font-bold">
              {awaitingApproval}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Completed
            </p>

            <p className="mt-2 text-3xl font-bold">
              {completed}
            </p>
          </div>
        </div>

        {/* Recent Transfers */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Recent Transfers
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Your most recently assigned transfers.
              </p>
            </div>

            <a
              href="#assigned-transfers"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View All
            </a>
          </div>

          {recentTransfers.length === 0 ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
              <p className="text-sm text-gray-500">
                No transfers have been assigned to you yet.
              </p>
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
                  </tr>
                </thead>

                <tbody>
                  {recentTransfers.map(
                    (transfer) => (
                      <tr
                        key={transfer.id}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-4">
                          <Link
                            href={`/transfers/${transfer.id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {transfer.recipient_name}
                          </Link>
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
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow">
          <div>
            <h2 className="text-2xl font-bold">
              Recent Activity
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Recent updates across your assigned transfers.
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
                  recentTransfers.find(
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

        {/* All Assigned Transfers */}
        <div
          id="assigned-transfers"
          className="mt-8 rounded-lg bg-white shadow"
        >
          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Assigned Transfers
            </h2>

            <p className="mt-1 text-gray-600">
              Transfers assigned to you.
            </p>
          </div>

          {!transfers ||
          transfers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                No transfers have been assigned to you yet.
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
                        {transfer.amount}{" "}
                        {transfer.currency}
                      </td>

                      <td className="px-6 py-4">
                        {transfer.destination_country}
                      </td>

                      <td className="px-6 py-4">
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