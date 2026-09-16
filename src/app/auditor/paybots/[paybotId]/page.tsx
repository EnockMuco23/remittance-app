import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../../../dashboard/logout-button";

type PageProps = {
  params: Promise<{
    paybotId: string;
  }>;
};

type CashSession = {
  id: string;
  cash_date: string;
  currency: string;
  opening_cash: number;
  new_float: number;
  completed_payouts: number;
  expected_closing_cash: number;
  closing_cash: number | null;
  discrepancy: number | null;
  closed_at: string | null;
};

type Transfer = {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string | null;
  recipient_name?: string | null;
};

type TransactionEvent = {
  id: string;
  created_at: string;
  event_type?: string | null;
  action?: string | null;
  amount?: number | null;
  currency?: string | null;
  description?: string | null;
};

type CorrectionRequest = {
  id: string;
  session_id: string;
  old_closing_cash: number;
  requested_closing_cash: number;
  reason: string;
  status: string;
  requested_at: string;
  approved_at?: string | null;
  decision_note?: string | null;
};

type DiscrepancyHistory = {
  session_id: string;
  cash_date: string;
  currency: string;
  opening_cash: number;
  total_new_float: number;
  total_payouts: number;
  expected_closing_cash: number;
  actual_closing_cash: number;
  discrepancy: number;
  closed_at: string | null;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString();
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (
    normalized === "reconciled" ||
    normalized === "approved" ||
    normalized === "completed"
  ) {
    return "bg-green-100 text-green-700";
  }

  if (
    normalized === "discrepancy" ||
    normalized === "rejected" ||
    normalized === "declined"
  ) {
    return "bg-red-100 text-red-700";
  }

  if (
    normalized === "pending" ||
    normalized === "open" ||
    normalized === "requested"
  ) {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-gray-100 text-gray-700";
}

export default async function AuditorPaybotReviewPage({
  params,
}: PageProps) {
  const { paybotId } = await params;
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
   * GET PAYBOT PROFILE
   * ------------------------------------------------------------
   */

  const { data: paybot, error: paybotError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", paybotId)
    .eq("role", "paybot")
    .single();

  if (paybotError || !paybot) {
    redirect("/auditor");
  }

  /*
   * ------------------------------------------------------------
   * DETERMINE CURRENT BUSINESS DATE / REVIEW DATE
   * ------------------------------------------------------------
   *
   * We use the most recent cash session belonging to this Paybot.
   * This makes the page useful even when the Auditor arrives from
   * the dashboard without passing a date in the URL.
   */

  const { data: latestSession } = await supabase
    .from("paybot_cash_sessions")
    .select("cash_date")
    .eq("paybot_id", paybotId)
    .order("cash_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reviewDate =
    latestSession?.cash_date ??
    new Date().toISOString().slice(0, 10);

  /*
   * ------------------------------------------------------------
   * LOAD CURRENT / SELECTED-DATE REVIEW DATA
   * ------------------------------------------------------------
   */

  const [
    cashSessionsResult,
    transfersResult,
    transactionEventsResult,
    correctionsResult,
  ] = await Promise.all([
    supabase.rpc("get_auditor_paybot_cash_sessions", {
      p_paybot_id: paybotId,
      p_cash_date: reviewDate,
    }),

    supabase.rpc("get_auditor_paybot_transfers", {
      p_paybot_id: paybotId,
      p_cash_date: reviewDate,
    }),

    supabase.rpc("get_auditor_paybot_transaction_events", {
      p_paybot_id: paybotId,
      p_cash_date: reviewDate,
    }),

    supabase.rpc("get_paybot_cash_correction_requests", {
      p_paybot_id: paybotId,
    }),
  ]);

  /*
   * ------------------------------------------------------------
   * LOAD DISCREPANCY HISTORY
   * ------------------------------------------------------------
   */

  const { data: discrepancyHistory, error: historyError } =
    await supabase.rpc("get_auditor_paybot_discrepancy_history", {
      p_paybot_id: paybotId,
      p_limit: 10,
    });

  const cashSessions =
    (cashSessionsResult.data as CashSession[] | null) ?? [];

  const transfers =
    (transfersResult.data as Transfer[] | null) ?? [];

  const transactionEvents =
    (transactionEventsResult.data as TransactionEvent[] | null) ?? [];

  const corrections =
    (correctionsResult.data as CorrectionRequest[] | null) ?? [];

  const history =
    (discrepancyHistory as DiscrepancyHistory[] | null) ?? [];

  /*
   * ------------------------------------------------------------
   * CALCULATE SUMMARY
   * ------------------------------------------------------------
   */

  const discrepancySessions = cashSessions.filter(
    (session) =>
      session.discrepancy !== null &&
      Math.abs(Number(session.discrepancy)) > 0.000001
  );

  const totalDiscrepancy = discrepancySessions.reduce(
    (total, session) => total + Number(session.discrepancy ?? 0),
    0
  );

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
              Paybot Review
            </h1>

            <p className="mt-2 text-gray-600">
              Detailed reconciliation review for{" "}
              <span className="font-semibold text-gray-900">
                {paybot.full_name}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/auditor"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow transition hover:bg-gray-50"
            >
              ← Back to Dashboard
            </Link>

            <LogoutButton />
          </div>
        </div>

        {/* PAYBOT SUMMARY */}

        <div className="mb-6 grid gap-6 md:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Paybot
            </p>

            <p className="mt-2 text-xl font-bold">
              {paybot.full_name}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Review Date
            </p>

            <p className="mt-2 text-xl font-bold">
              {reviewDate}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Discrepancy Sessions
            </p>

            <p className="mt-2 text-xl font-bold">
              {discrepancySessions.length}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">
              Total Discrepancy
            </p>

            <p
              className={`mt-2 text-xl font-bold ${
                Math.abs(totalDiscrepancy) > 0.000001
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {formatMoney(totalDiscrepancy)}
            </p>
          </div>
        </div>

        {/* CASH SESSIONS */}

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              Cash Sessions
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Cash reconciliation for {reviewDate}.
            </p>
          </div>

          {cashSessions.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
              No cash session found for this date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-4 py-3 font-medium">
                      Currency
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Opening
                    </th>
                    <th className="px-4 py-3 font-medium">
                      New Float
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Payouts
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Expected
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Actual
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Difference
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {cashSessions.map((session) => {
                    const discrepancy =
                      Number(session.discrepancy ?? 0);

                    const hasDiscrepancy =
                      Math.abs(discrepancy) > 0.000001;

                    return (
                      <tr
                        key={session.id}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-4 font-semibold">
                          {session.currency}
                        </td>

                        <td className="px-4 py-4">
                          {formatMoney(session.opening_cash)}
                        </td>

                        <td className="px-4 py-4">
                          {formatMoney(session.new_float)}
                        </td>

                        <td className="px-4 py-4">
                          {formatMoney(
                            session.completed_payouts
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {formatMoney(
                            session.expected_closing_cash
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {formatMoney(session.closing_cash)}
                        </td>

                        <td
                          className={`px-4 py-4 font-semibold ${
                            hasDiscrepancy
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          {formatMoney(discrepancy)}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              hasDiscrepancy
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {hasDiscrepancy
                              ? "Discrepancy"
                              : "Reconciled"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* CORRECTIONS */}

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              Correction Requests
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Cash correction requests associated with this
              Paybot.
            </p>
          </div>

          {corrections.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
              No correction requests found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-4 py-3 font-medium">
                      Requested
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Old Closing
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Requested Closing
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Reason
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Decision
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {corrections.map((correction) => (
                    <tr
                      key={correction.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4">
                        {formatDateTime(
                          correction.requested_at
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(
                          correction.old_closing_cash
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(
                          correction.requested_closing_cash
                        )}
                      </td>

                      <td className="max-w-xs px-4 py-4">
                        {correction.reason}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                            correction.status
                          )}`}
                        >
                          {correction.status}
                        </span>
                      </td>

                      <td className="max-w-xs px-4 py-4">
                        {correction.decision_note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* TRANSFERS */}

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              Transfers
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Transfer activity for {reviewDate}.
            </p>
          </div>

          {transfers.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
              No transfers found for this date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-4 py-3 font-medium">
                      Date
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Reference
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Recipient
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Currency
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {transfers.map((transfer) => (
                    <tr
                      key={transfer.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4">
                        {formatDateTime(
                          transfer.created_at
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {transfer.reference ?? "—"}
                      </td>

                      <td className="px-4 py-4">
                        {transfer.recipient_name ?? "—"}
                      </td>

                      <td className="px-4 py-4 font-medium">
                        {formatMoney(transfer.amount)}
                      </td>

                      <td className="px-4 py-4">
                        {transfer.currency}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                            transfer.status
                          )}`}
                        >
                          {transfer.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* TRANSACTION EVENTS */}

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              Transaction Events
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Recorded transaction activity for {reviewDate}.
            </p>
          </div>

          {transactionEvents.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
              No transaction events found for this date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-4 py-3 font-medium">
                      Date
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Event
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Action
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Currency
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Description
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {transactionEvents.map((event) => (
                    <tr
                      key={event.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4">
                        {formatDateTime(event.created_at)}
                      </td>

                      <td className="px-4 py-4">
                        {event.event_type ?? "—"}
                      </td>

                      <td className="px-4 py-4">
                        {event.action ?? "—"}
                      </td>

                      <td className="px-4 py-4">
                        {event.amount !== null &&
                        event.amount !== undefined
                          ? formatMoney(event.amount)
                          : "—"}
                      </td>

                      <td className="px-4 py-4">
                        {event.currency ?? "—"}
                      </td>

                      <td className="max-w-sm px-4 py-4">
                        {event.description ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* DISCREPANCY HISTORY */}

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              Discrepancy History
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Recent closed cash sessions where the actual
              closing cash did not match the expected amount.
            </p>
          </div>

          {historyError ? (
            <div className="rounded-lg bg-red-50 p-5 text-sm text-red-700">
              Unable to load discrepancy history.
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
              No historical discrepancies found for this
              Paybot.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-4 py-3 font-medium">
                      Date
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Currency
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Opening
                    </th>
                    <th className="px-4 py-3 font-medium">
                      New Float
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Payouts
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Expected
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Actual
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Difference
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Closed
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item) => (
                    <tr
                      key={item.session_id}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4">
                        {item.cash_date}
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {item.currency}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(item.opening_cash)}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(item.total_new_float)}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(item.total_payouts)}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(
                          item.expected_closing_cash
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {formatMoney(
                          item.actual_closing_cash
                        )}
                      </td>

                      <td className="px-4 py-4 font-bold text-red-600">
                        {formatMoney(item.discrepancy)}
                      </td>

                      <td className="px-4 py-4">
                        {formatDateTime(item.closed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* FOOTER NAVIGATION */}

        <div className="flex justify-start pb-8">
          <Link
            href="/auditor"
            className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow transition hover:bg-gray-50"
          >
            ← Back to Auditor Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

