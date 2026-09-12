import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";
import ClaimTransferButton from "./claim-transfer-button";

export default async function PaybotDashboardPage() {
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

  if (
    profileError ||
    !profile ||
    profile.role !== "paybot"
  ) {
    redirect("/dashboard");
  }

  /*
   * AVAILABLE TRANSFERS
   *
   * RLS limits these transfers to:
   * - transfers sent to Paybot
   * - no Paybot currently assigned
   * - destination country assigned to this Paybot
   */
  const {
    data: availableTransfers,
    error: availableError,
  } = await supabase
    .from("transfer_requests")
    .select(
      "id, amount, currency, destination_country, recipient_name, status, created_at"
    )
    .eq("status", "sent_to_paybot")
    .is("paybot_id", null)
    .order("created_at", { ascending: true });

  /*
   * ACTIVE TRANSFERS
   *
   * These are transfers already claimed by this Paybot.
   */
  const {
    data: activeTransfers,
    error: activeError,
  } = await supabase
    .from("transfer_requests")
    .select(
      "id, amount, currency, destination_country, recipient_name, status, created_at"
    )
    .eq("paybot_id", user.id)
    .in("status", [
      "paybot_accepted",
      "paybot_pending",
    ])
    .order("created_at", { ascending: false });

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

        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <div className="mb-8 flex items-center justify-between">
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

        {/* ================================================== */}
        {/* SUMMARY */}
        {/* ================================================== */}

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

        {/* ================================================== */}
        {/* AVAILABLE TRANSFERS */}
        {/* ================================================== */}

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

        {/* ================================================== */}
        {/* MY ACTIVE TRANSFERS */}
        {/* ================================================== */}

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