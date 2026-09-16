import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "./logout-button";

type BusinessDay = {
  id: string;
  business_date: string;
  status: "open" | "closing" | "closed" | string;
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

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

  const [
    { data: transfers, error: transfersError },
    { data: events, error: eventsError },
    { data: businessDays, error: businessDayError },
  ] = await Promise.all([
    supabase
      .from("transfer_requests")
      .select(
        "id, amount, currency, destination_country, recipient_name, status, created_at"
      )
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),

    supabase
      .from("transaction_events")
      .select(
        "id, transfer_id, event_type, created_at"
      )
      .eq("actor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),

    supabase.rpc("get_current_business_day"),
  ]);

  if (transfersError) {
    console.error(
      "Client transfers error:",
      transfersError
    );
  }

  if (eventsError) {
    console.error(
      "Client events error:",
      eventsError
    );
  }

  if (businessDayError) {
    console.error(
      "Business Day error:",
      businessDayError
    );
  }

  const businessDay: BusinessDay | null =
    Array.isArray(businessDays) &&
    businessDays.length > 0
      ? businessDays[0]
      : null;

  const isOpen =
    businessDay?.status === "open";

  const isClosing =
    businessDay?.status === "closing";

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <LogoutButton />
        </div>

        {/* Business Day Status */}
        <div
          className={`mb-8 rounded-lg border p-5 shadow-sm ${
            isOpen
              ? "border-green-200 bg-green-50"
              : isClosing
                ? "border-yellow-200 bg-yellow-50"
                : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Business Day
              </p>

              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full ${
                    isOpen
                      ? "bg-green-500"
                      : isClosing
                        ? "bg-yellow-500"
                        : "bg-gray-400"
                  }`}
                />

                <span className="text-lg font-bold">
                  {isOpen
                    ? "OPEN"
                    : isClosing
                      ? "CLOSING"
                      : "CLOSED"}
                </span>
              </div>
            </div>

            <div className="text-sm sm:text-right">
              {businessDay ? (
                <>
                  <p className="font-medium text-gray-700">
                    {new Date(
                      `${businessDay.business_date}T00:00:00`
                    ).toLocaleDateString()}
                  </p>

                  <p
                    className={
                      isOpen
                        ? "text-green-700"
                        : isClosing
                          ? "text-yellow-700"
                          : "text-gray-500"
                    }
                  >
                    {isOpen
                      ? "Transfers are available."
                      : isClosing
                        ? "New transfers are closed for today. You can still view existing transfers."
                        : "No active Business Day."}
                  </p>
                </>
              ) : (
                <p className="text-gray-500">
                  No active Business Day.
                </p>
              )}
            </div>
          </div>

          {isClosing && (
            <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-100 p-3 text-sm text-yellow-900">
              <strong>Business Day is closing:</strong>{" "}
              New transfers cannot be created. Existing
              transfers remain available for viewing.
            </div>
          )}

          {!businessDay && (
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              Transfers are currently unavailable because
              there is no active Business Day.
            </div>
          )}
        </div>

        {/* Main Actions */}
        <div className="grid gap-6 md:grid-cols-2">

          {isOpen ? (
            <Link
              href="/transfers/new"
              className="rounded-lg bg-black p-6 text-white shadow transition hover:bg-gray-800"
            >
              <h2 className="text-xl font-bold">
                New Transfer
              </h2>

              <p className="mt-2 text-sm text-gray-300">
                Start a new money transfer.
              </p>
            </Link>
          ) : (
            <div
              className={`cursor-not-allowed rounded-lg p-6 shadow ${
                isClosing
                  ? "bg-yellow-100"
                  : "bg-gray-200"
              }`}
            >
              <h2 className="text-xl font-bold text-gray-700">
                New Transfer
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                {isClosing
                  ? "New transfers are closed while the Business Day is closing."
                  : "New transfers are currently unavailable."}
              </p>
            </div>
          )}

          <Link
            href="/transfers"
            className="rounded-lg bg-white p-6 shadow transition hover:bg-gray-50"
          >
            <h2 className="text-xl font-bold">
              My Transfers
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              View your transfer history and track existing
              transfers.
            </p>
          </Link>

        </div>

        {/* Recent Transfers */}
        <div className="mt-8 rounded-lg bg-white shadow">

          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Recent Transfers
            </h2>

            <p className="mt-1 text-gray-600">
              Your most recent transfers.
            </p>
          </div>

          {!transfers ||
          transfers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                You have no transfers yet.
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

                  {transfers.map(
                    (transfer) => (
                      <tr
                        key={transfer.id}
                        className="hover:bg-gray-50"
                      >

                        <td className="px-6 py-4">
                          <Link
                            href={`/transfers/${transfer.id}`}
                            className="font-medium hover:underline"
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

                        <td className="px-6 py-4 capitalize">
                          {transfer.status.replaceAll(
                            "_",
                            " "
                          )}
                        </td>

                        <td className="px-6 py-4 text-sm text-gray-500">
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
        <div className="mt-8 rounded-lg bg-white shadow">

          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Recent Activity
            </h2>

            <p className="mt-1 text-gray-600">
              Recent activity on your account.
            </p>
          </div>

          {!events ||
          events.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                No recent activity.
              </p>
            </div>
          ) : (
            <div className="divide-y">

              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-6"
                >
                  <div>
                    <p className="font-medium capitalize">
                      {event.event_type.replaceAll(
                        "_",
                        " "
                      )}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Transfer{" "}
                      {event.transfer_id}
                    </p>
                  </div>

                  <p className="text-sm text-gray-500">
                    {new Date(
                      event.created_at
                    ).toLocaleString()}
                  </p>
                </div>
              ))}

            </div>
          )}

        </div>

      </div>
    </main>
  );
}
