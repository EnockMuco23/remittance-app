import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";
import ClaimTransferButton from "./claim-transfer-button";

type BusinessDay = {
  id: string;
  business_date: string;
  status: "open" | "closing" | "closed" | string;
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

export default async function PaybotDashboardPage() {
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
    profile.role !== "paybot"
  ) {
    redirect("/dashboard");
  }

  const [
    { data: availableTransfers, error: availableError },
    { data: activeTransfers, error: activeError },
    { data: businessDays, error: businessDayError },
  ] = await Promise.all([
    supabase
      .from("transfer_requests")
      .select(
        "id, amount, currency, destination_country, recipient_name, status, created_at"
      )
      .eq("status", "sent_to_paybot")
      .is("paybot_id", null)
      .order("created_at", {
        ascending: true,
      }),

    supabase
      .from("transfer_requests")
      .select(
        "id, amount, currency, destination_country, recipient_name, status, created_at"
      )
      .eq("paybot_id", user.id)
      .in("status", [
        "paybot_accepted",
        "paybot_pending",
      ])
      .order("created_at", {
        ascending: false,
      }),

    supabase.rpc("get_current_business_day"),
  ]);

  if (availableError) {
    console.error(
      "Available transfers error:",
      availableError
    );
  }

  if (activeError) {
    console.error(
      "Active transfers error:",
      activeError
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

  const availableCount =
    availableTransfers?.length ?? 0;

  const activeCount =
    activeTransfers?.length ?? 0;

  const pendingCount =
    activeTransfers?.filter(
      (transfer) =>
        transfer.status === "paybot_pending"
    ).length ?? 0;

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Paybot Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/paybot/cash"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Daily Cash
            </Link>

            <LogoutButton />
          </div>
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
                      ? "Normal operations"
                      : isClosing
                        ? "New Paybot cash sessions are closed. Existing operations may continue."
                        : "No active Business Day"}
                  </p>
                </>
              ) : (
                <p className="text-gray-500">
                  No active Business Day
                </p>
              )}
            </div>
          </div>

          {isClosing && (
            <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-100 p-3 text-sm text-yellow-900">
              <strong>Closing:</strong>{" "}
              You can continue processing transfers and
              completing existing cash sessions. New
              Paybot cash sessions cannot be opened.
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="grid gap-6 md:grid-cols-3">

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Available Transfers
            </p>

            <p className="mt-2 text-3xl font-bold">
              {availableCount}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Waiting to be claimed
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              My Active Transfers
            </p>

            <p className="mt-2 text-3xl font-bold">
              {activeCount}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Currently assigned to you
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Pending
            </p>

            <p className="mt-2 text-3xl font-bold">
              {pendingCount}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Transfers awaiting action
            </p>
          </div>

        </div>

        {/* Available Transfers */}
        <div className="mt-8 rounded-lg bg-white shadow">

          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Available Transfers
            </h2>

            <p className="mt-1 text-gray-600">
              Transfers available for your assigned countries.
            </p>
          </div>

          {!availableTransfers ||
          availableTransfers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                No transfers are currently available
                for your assigned countries.
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
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">

                  {availableTransfers.map(
                    (transfer) => (
                      <tr
                        key={transfer.id}
                        className="hover:bg-gray-50"
                      >

                        <td className="px-6 py-4">
                          {transfer.recipient_name}
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

                        <td className="px-6 py-4">
                          <ClaimTransferButton
                            transferId={transfer.id}
                          />
                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>
          )}

        </div>

        {/* My Active Transfers */}
        <div className="mt-8 rounded-lg bg-white shadow">

          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              My Active Transfers
            </h2>

            <p className="mt-1 text-gray-600">
              Transfers currently assigned to you.
            </p>
          </div>

          {!activeTransfers ||
          activeTransfers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                You have no active transfers.
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
                      Action
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y">

                  {activeTransfers.map(
                    (transfer) => (
                      <tr
                        key={transfer.id}
                        className="hover:bg-gray-50"
                      >

                        <td className="px-6 py-4">
                          {transfer.recipient_name}
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

                        <td className="px-6 py-4">
                          <Link
                            href={`/paybot/transfers/${transfer.id}`}
                            className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                          >
                            Open Transfer
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

      </div>
    </main>
  );
}
