import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

type PaybotOverview = {
  paybot_id: string;
  paybot_name: string;
  session_count: number;
  open_session_count: number;
  discrepancy_session_count: number;
  total_discrepancy: number;
  reconciliation_status: string;
};

type PageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "0.00";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function statusClass(status: string) {
  switch (status.toLowerCase()) {
    case "reconciled":
      return "bg-green-100 text-green-700";

    case "discrepancy":
      return "bg-red-100 text-red-700";

    case "pending":
      return "bg-yellow-100 text-yellow-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default async function AuditorDashboardPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();

  /*
   * ------------------------------------------------------------
   * SERVER-SIDE ACCESS CONTROL
   * ------------------------------------------------------------
   */

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

  if (profileError || !profile || profile.role !== "auditor") {
    redirect("/dashboard");
  }

  /*
   * ------------------------------------------------------------
   * DATE
   * ------------------------------------------------------------
   */

  const params = await searchParams;
  const selectedDate = params.date || getToday();

  /*
   * ------------------------------------------------------------
   * LOAD PAYBOT OVERVIEW
   * ------------------------------------------------------------
   */

  const { data, error } = await supabase.rpc(
    "get_auditor_paybot_overview",
    {
      p_cash_date: selectedDate,
    }
  );

  const paybots =
    (data as PaybotOverview[] | null) ?? [];

  /*
   * ------------------------------------------------------------
   * SUMMARY
   * ------------------------------------------------------------
   */

  const totalPaybots = paybots.length;

  const reconciledPaybots = paybots.filter(
    (paybot) =>
      paybot.reconciliation_status.toLowerCase() ===
      "reconciled"
  ).length;

  const discrepancyPaybots = paybots.filter(
    (paybot) =>
      paybot.reconciliation_status.toLowerCase() ===
      "discrepancy"
  ).length;

  const pendingPaybots = paybots.filter(
    (paybot) =>
      paybot.reconciliation_status.toLowerCase() ===
      "pending"
  ).length;

  /*
   * ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Auditor Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <LogoutButton />
        </div>

        {/* DATE FILTER */}

        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <form
            method="GET"
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <label
                htmlFor="date"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Review Date
              </label>

              <input
                id="date"
                name="date"
                type="date"
                defaultValue={selectedDate}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Review Date
            </button>
          </form>
        </div>

        {/* SUMMARY CARDS */}

        <div className="mb-8 grid gap-6 md:grid-cols-4">

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Total Paybots
            </p>

            <p className="mt-2 text-3xl font-bold">
              {totalPaybots}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Reconciled
            </p>

            <p className="mt-2 text-3xl font-bold text-green-600">
              {reconciledPaybots}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Discrepancies
            </p>

            <p className="mt-2 text-3xl font-bold text-red-600">
              {discrepancyPaybots}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Pending
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-600">
              {pendingPaybots}
            </p>
          </div>

        </div>

        {/* PAYBOT RECONCILIATION */}

        <section className="rounded-lg bg-white p-6 shadow">

          <div className="mb-6">
            <h2 className="text-xl font-bold">
              Paybot Reconciliation
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Cash reconciliation overview for{" "}
              <span className="font-medium">
                {selectedDate}
              </span>
              .
            </p>
          </div>

          {error ? (
            <div className="rounded-lg bg-red-50 p-5 text-sm text-red-700">
              Unable to load Paybot reconciliation data.
            </div>
          ) : paybots.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-500">
              No Paybots found.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full min-w-[850px] text-left text-sm">

                <thead>
                  <tr className="border-b text-gray-500">

                    <th className="px-4 py-3 font-medium">
                      Paybot
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Sessions
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Open Sessions
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Discrepancies
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Difference
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Status
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      Action
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {paybots.map((paybot) => {

                    const status =
                      paybot.reconciliation_status ||
                      "pending";

                    const hasDiscrepancy =
                      Number(paybot.total_discrepancy ?? 0) !==
                      0;

                    return (
                      <tr
                        key={paybot.paybot_id}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >

                        <td className="px-4 py-4">
                          <div className="font-semibold text-gray-900">
                            {paybot.paybot_name}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          {paybot.session_count}
                        </td>

                        <td className="px-4 py-4">
                          {paybot.open_session_count}
                        </td>

                        <td className="px-4 py-4">
                          {paybot.discrepancy_session_count}
                        </td>

                        <td
                          className={`px-4 py-4 font-semibold ${
                            hasDiscrepancy
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          {formatMoney(
                            paybot.total_discrepancy
                          )}
                        </td>

                        <td className="px-4 py-4">

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                              status
                            )}`}
                          >
                            {status}
                          </span>

                        </td>

                        <td className="px-4 py-4 text-right">

                          <Link
                            href={`/auditor/paybots/${paybot.paybot_id}?date=${selectedDate}`}
                            className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                          >
                            Review
                          </Link>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>
          )}

        </section>

      </div>
    </main>
  );
}
