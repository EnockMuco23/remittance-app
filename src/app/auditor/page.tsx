"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type PaybotOverview = {
  paybot_id: string;
  paybot_name: string;
  session_count: number;
  open_session_count: number;
  discrepancy_session_count: number;
  total_discrepancy: number;
  reconciliation_status: string;
};

type CashSession = {
  id: string;
  paybot_id: string;
  paybot_name: string;
  cash_date: string;
  currency: string;
  opening_cash: number;
  new_float: number;
  payouts: number;
  expected_closing: number;
  closing_cash: number | null;
  discrepancy: number | null;
  closed_at: string | null;
};

type Transfer = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  destination_country: string;
  source_amount: number;
  currency: string;
  destination_amount: number;
  destination_currency: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type TransactionEvent = {
  id: string;
  transaction_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  notes: string | null;
  created_at: string;
};

type CorrectionRequest = {
  id: string;
  session_id: string;
  paybot_id: string;
  old_closing_cash: number;
  requested_closing_cash: number;
  reason: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function statusClasses(status: string) {
  switch (status) {
    case "reconciled":
      return "bg-green-100 text-green-800";

    case "discrepancy":
      return "bg-red-100 text-red-800";

    case "pending":
      return "bg-yellow-100 text-yellow-800";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

function correctionStatusClasses(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";

    case "approved":
      return "bg-blue-100 text-blue-800";

    case "used":
      return "bg-green-100 text-green-800";

    case "rejected":
      return "bg-red-100 text-red-800";

    case "expired":
      return "bg-gray-100 text-gray-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function AuditorDashboardPage() {
  const supabase = createClient();

  const [selectedDate, setSelectedDate] = useState(getLocalDate());

  const [paybots, setPaybots] = useState<PaybotOverview[]>([]);
  const [selectedPaybot, setSelectedPaybot] =
    useState<PaybotOverview | null>(null);

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [events, setEvents] = useState<TransactionEvent[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [error, setError] = useState("");

  /*
   * Load the overview.
   *
   * This is only used for the Paybot list.
   * The actual cash-session review is loaded independently below.
   */
  async function loadOverview() {
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_auditor_paybot_overview",
        {
          p_cash_date: selectedDate,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setPaybots((data ?? []) as PaybotOverview[]);
    } catch (err: any) {
      setPaybots([]);

      setError(
        err?.message ||
          "Failed to load the auditor Paybot overview."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * Load ALL details for one Paybot.
   *
   * Cash sessions are loaded first and independently.
   * This means a problem with transfers/events/corrections
   * cannot prevent the cash reconciliation from appearing.
   */
  async function loadPaybotDetails(paybot: PaybotOverview) {
    setSelectedPaybot(paybot);

    setLoadingDetails(true);
    setError("");

    setSessions([]);
    setTransfers([]);
    setEvents([]);
    setCorrections([]);

    /*
     * 1. CASH SESSIONS
     *
     * This is the most important query for reconciliation.
     */
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_auditor_paybot_cash_sessions",
        {
          p_paybot_id: paybot.paybot_id,
          p_cash_date: selectedDate,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setSessions((data ?? []) as CashSession[]);
    } catch (err: any) {
      setError(
        err?.message ||
          "Failed to load Paybot cash reconciliation."
      );
    }

    /*
     * 2. TRANSFERS
     *
     * Loaded separately so it cannot break cash reconciliation.
     */
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_auditor_paybot_transfers",
        {
          p_paybot_id: paybot.paybot_id,
          p_cash_date: selectedDate,
        }
      );

      if (!rpcError) {
        setTransfers((data ?? []) as Transfer[]);
      }
    } catch {
      // Keep cash reconciliation visible even if this section fails.
    }

    /*
     * 3. TRANSACTION EVENTS
     */
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_auditor_paybot_transaction_events",
        {
          p_paybot_id: paybot.paybot_id,
          p_cash_date: selectedDate,
        }
      );

      if (!rpcError) {
        setEvents((data ?? []) as TransactionEvent[]);
      }
    } catch {
      // Keep cash reconciliation visible.
    }

    /*
     * 4. CORRECTIONS
     *
     * Correction requests are global to the auditor,
     * so we filter them using the session IDs returned above.
     */
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_paybot_cash_correction_requests",
        {
          p_status: null,
        }
      );

      if (!rpcError) {
        const allCorrections =
          (data ?? []) as CorrectionRequest[];

        /*
         * Use the sessions currently loaded for this Paybot/date.
         */
        const currentSessionIds = new Set(
          sessions.map((session) => session.id)
        );

        /*
         * Also handle the case where React state has not yet
         * updated by using the session IDs already fetched above.
         */
        const sessionResult = await supabase.rpc(
          "get_auditor_paybot_cash_sessions",
          {
            p_paybot_id: paybot.paybot_id,
            p_cash_date: selectedDate,
          }
        );

        const freshSessions =
          (sessionResult.data ?? []) as CashSession[];

        const freshSessionIds = new Set(
          freshSessions.map((session) => session.id)
        );

        const sessionIds =
          freshSessionIds.size > 0
            ? freshSessionIds
            : currentSessionIds;

        setCorrections(
          allCorrections.filter((request) =>
            sessionIds.has(request.session_id)
          )
        );
      }
    } catch {
      // Corrections are supplementary; do not block reconciliation.
    }

    setLoadingDetails(false);
  }

  useEffect(() => {
    loadOverview();

    /*
     * When the date changes, clear the currently selected Paybot
     * because its details belong to the previous date.
     */
    setSelectedPaybot(null);
    setSessions([]);
    setTransfers([]);
    setEvents([]);
    setCorrections([]);
  }, [selectedDate]);

  const summary = useMemo(() => {
    const totalPaybots = paybots.length;

    const reconciled = paybots.filter(
      (paybot) =>
        paybot.reconciliation_status === "reconciled"
    ).length;

    const discrepancies = paybots.filter(
      (paybot) =>
        paybot.reconciliation_status === "discrepancy"
    ).length;

    const pending = paybots.filter(
      (paybot) =>
        paybot.reconciliation_status === "pending"
    ).length;

    const totalDiscrepancy = paybots.reduce(
      (sum, paybot) =>
        sum + Number(paybot.total_discrepancy || 0),
      0
    );

    return {
      totalPaybots,
      reconciled,
      discrepancies,
      pending,
      totalDiscrepancy,
    };
  }, [paybots]);

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* HEADER */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Auditor Dashboard
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Review Paybot cash reconciliation, transfers,
              corrections, and transaction activity.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
          >
            ← Dashboard
          </Link>
        </div>

        {/* DATE */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Reconciliation Date
              </p>

              <p className="mt-1 text-sm text-gray-600">
                Select the business date you want to audit.
              </p>
            </div>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500 md:w-52"
            />
          </div>
        </section>

        {/* SUMMARY */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Paybots
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {summary.totalPaybots}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Paybot records for this date
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Reconciled
            </p>

            <p className="mt-2 text-3xl font-bold text-green-700">
              {summary.reconciled}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              No unresolved discrepancy
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Discrepancies
            </p>

            <p className="mt-2 text-3xl font-bold text-red-700">
              {summary.discrepancies}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Paybots requiring attention
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Pending
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-700">
              {summary.pending}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Open or incomplete reconciliation
            </p>
          </div>
        </div>

        {/* NET DISCREPANCY */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Net Discrepancy
              </p>

              <p
                className={`mt-1 text-2xl font-bold ${
                  summary.totalDiscrepancy === 0
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                {formatMoney(summary.totalDiscrepancy)}
              </p>
            </div>

            <p className="text-sm text-gray-500">
              Across the selected date
            </p>
          </div>
        </section>

        {/* ERROR */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* PAYBOT OVERVIEW */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Paybot Reconciliation
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Select a Paybot to inspect their cash and transaction activity.
            </p>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-gray-500">
              Loading reconciliation data...
            </div>
          ) : paybots.length === 0 ? (
            <div className="p-6">
              <p className="text-sm font-medium text-gray-900">
                No Paybot records were found.
              </p>

              <p className="mt-1 text-sm text-gray-500">
                No Paybot overview records were returned for{" "}
                <span className="font-medium text-gray-700">
                  {selectedDate}
                </span>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Paybot</th>
                    <th className="px-5 py-3">Sessions</th>
                    <th className="px-5 py-3">Open</th>
                    <th className="px-5 py-3">Discrepancies</th>
                    <th className="px-5 py-3">Net Difference</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {paybots.map((paybot) => (
                    <tr
                      key={paybot.paybot_id}
                      className="transition hover:bg-gray-50"
                    >
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {paybot.paybot_name}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {paybot.session_count}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {paybot.open_session_count}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {paybot.discrepancy_session_count}
                      </td>

                      <td className="px-5 py-4 font-medium text-gray-900">
                        {formatMoney(paybot.total_discrepancy)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(
                            paybot.reconciliation_status
                          )}`}
                        >
                          {paybot.reconciliation_status.toUpperCase()}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() =>
                            loadPaybotDetails(paybot)
                          }
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
                        >
                          Review →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SELECTED PAYBOT */}
        {selectedPaybot && (
          <section className="space-y-6">

            {/* SELECTED PAYBOT HEADER */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Selected Paybot
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-gray-900">
                    {selectedPaybot.paybot_name}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Audit date: {selectedDate}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setSelectedPaybot(null);
                    setSessions([]);
                    setTransfers([]);
                    setEvents([]);
                    setCorrections([]);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
                >
                  Close Review
                </button>
              </div>
            </div>

            {loadingDetails ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
                Loading Paybot details...
              </div>
            ) : (
              <>
                {/* CASH SESSIONS */}
                <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 p-5">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Cash Sessions
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Reconciliation between expected and physically declared cash.
                    </p>
                  </div>

                  {sessions.length === 0 ? (
                    <div className="p-5">
                      <p className="text-sm font-medium text-gray-900">
                        No cash sessions found.
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        No sessions were returned for{" "}
                        {selectedPaybot.paybot_name} on{" "}
                        {selectedDate}.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-5 py-3">Currency</th>
                            <th className="px-5 py-3">Opening</th>
                            <th className="px-5 py-3">Float</th>
                            <th className="px-5 py-3">Payouts</th>
                            <th className="px-5 py-3">Expected</th>
                            <th className="px-5 py-3">Declared</th>
                            <th className="px-5 py-3">Difference</th>
                            <th className="px-5 py-3">Closed</th>
                            <th className="px-5 py-3">Status</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200">
                          {sessions.map((session) => {
                            const discrepancy =
                              session.discrepancy === null
                                ? null
                                : Number(session.discrepancy);

                            const hasDiscrepancy =
                              discrepancy !== null &&
                              discrepancy !== 0;

                            return (
                              <tr key={session.id}>
                                <td className="px-5 py-4 font-medium text-gray-900">
                                  {session.currency}
                                </td>

                                <td className="px-5 py-4 text-gray-600">
                                  {formatMoney(session.opening_cash)}
                                </td>

                                <td className="px-5 py-4 text-gray-600">
                                  {formatMoney(session.new_float)}
                                </td>

                                <td className="px-5 py-4 text-gray-600">
                                  {formatMoney(session.payouts)}
                                </td>

                                <td className="px-5 py-4 font-medium text-gray-900">
                                  {formatMoney(session.expected_closing)}
                                </td>

                                <td className="px-5 py-4 font-medium text-gray-900">
                                  {formatMoney(session.closing_cash)}
                                </td>

                                <td
                                  className={`px-5 py-4 font-semibold ${
                                    hasDiscrepancy
                                      ? "text-red-700"
                                      : "text-green-700"
                                  }`}
                                >
                                  {formatMoney(discrepancy)}
                                </td>

                                <td className="whitespace-nowrap px-5 py-4 text-gray-500">
                                  {formatDateTime(session.closed_at)}
                                </td>

                                <td className="px-5 py-4">
                                  {!session.closed_at ? (
                                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                                      OPEN
                                    </span>
                                  ) : hasDiscrepancy ? (
                                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                                      DISCREPANCY
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                                      RECONCILED
                                    </span>
                                  )}
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
                <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 p-5">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Cash Corrections
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Permanent record of Paybot correction requests and Management decisions.
                    </p>
                  </div>

                  {corrections.length === 0 ? (
                    <div className="p-5 text-sm text-gray-500">
                      No correction requests associated with these sessions.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {corrections.map((request) => (
                        <div key={request.id} className="p-5">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-gray-900">
                                {formatMoney(
                                  request.old_closing_cash
                                )}{" "}
                                →{" "}
                                {formatMoney(
                                  request.requested_closing_cash
                                )}
                              </p>

                              <p className="mt-2 text-sm text-gray-600">
                                {request.reason}
                              </p>

                              <p className="mt-2 text-xs text-gray-500">
                                Requested:{" "}
                                {formatDateTime(
                                  request.created_at
                                )}
                              </p>

                              {request.approved_at && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Decision:{" "}
                                  {formatDateTime(
                                    request.approved_at
                                  )}
                                </p>
                              )}

                              {request.decision_note && (
                                <p className="mt-2 text-sm text-gray-600">
                                  Management note:{" "}
                                  {request.decision_note}
                                </p>
                              )}

                              {request.used_at && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Applied:{" "}
                                  {formatDateTime(
                                    request.used_at
                                  )}
                                </p>
                              )}
                            </div>

                            <span
                              className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${correctionStatusClasses(
                                request.status
                              )}`}
                            >
                              {request.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* TRANSFERS */}
                <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 p-5">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Transfer Activity
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Transfers handled by this Paybot during the selected date.
                    </p>
                  </div>

                  {transfers.length === 0 ? (
                    <div className="p-5 text-sm text-gray-500">
                      No transfers found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-5 py-3">Recipient</th>
                            <th className="px-5 py-3">Destination</th>
                            <th className="px-5 py-3">Amount</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3">Created</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200">
                          {transfers.map((transfer) => (
                            <tr key={transfer.id}>
                              <td className="px-5 py-4">
                                <p className="font-medium text-gray-900">
                                  {transfer.recipient_name}
                                </p>

                                <p className="mt-1 text-xs text-gray-500">
                                  {transfer.recipient_phone}
                                </p>
                              </td>

                              <td className="px-5 py-4 text-gray-600">
                                {transfer.destination_country}
                              </td>

                              <td className="px-5 py-4 font-medium text-gray-900">
                                {formatMoney(
                                  transfer.destination_amount
                                )}{" "}
                                {transfer.destination_currency}
                              </td>

                              <td className="px-5 py-4">
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                                  {transfer.status.toUpperCase()}
                                </span>
                              </td>

                              <td className="whitespace-nowrap px-5 py-4 text-gray-500">
                                {formatDateTime(
                                  transfer.created_at
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* TRANSACTION EVENTS */}
                <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 p-5">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Transaction Events
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Chronological operational activity associated with this Paybot's transfers.
                    </p>
                  </div>

                  {events.length === 0 ? (
                    <div className="p-5 text-sm text-gray-500">
                      No transaction events found.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {events.map((event) => (
                        <div key={event.id} className="p-5">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium text-gray-900">
                                {event.event_type}
                              </p>

                              {event.notes && (
                                <p className="mt-1 text-sm text-gray-600">
                                  {event.notes}
                                </p>
                              )}

                              <p className="mt-2 text-xs text-gray-500">
                                Actor:{" "}
                                {event.actor_name || "System"}
                              </p>
                            </div>

                            <p className="text-xs text-gray-500">
                              {formatDateTime(
                                event.created_at
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

