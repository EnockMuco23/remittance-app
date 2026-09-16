"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type BusinessDay = {
  id: string;
  business_date: string;
  status: "open" | "closing" | "closed";
  opened_at: string | null;
  closed_at: string | null;
};

type CashHealth = {
  business_date: string | null;
  total_sessions: number;
  closed_sessions: number;
  open_sessions: number;
  discrepancy_sessions: number;
  total_discrepancy: number;
  total_absolute_discrepancy: number;
  unresolved_discrepancy_sessions: number;
  unresolved_discrepancy_amount: number;
  health_status:
    | "healthy"
    | "explained"
    | "attention_required"
    | "pending_reconciliation";
};

const supabase = createClient();

function formatMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: string | null | undefined) {
  if (!date) return "—";

  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function healthLabel(status: CashHealth["health_status"]) {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "explained":
      return "Explained discrepancies";
    case "attention_required":
      return "Attention required";
    case "pending_reconciliation":
      return "Pending reconciliation";
    default:
      return status;
  }
}

function healthClasses(status: CashHealth["health_status"]) {
  switch (status) {
    case "healthy":
      return "border-green-200 bg-green-50 text-green-800";
    case "explained":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "attention_required":
      return "border-red-200 bg-red-50 text-red-800";
    case "pending_reconciliation":
      return "border-yellow-200 bg-yellow-50 text-yellow-800";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

export default function BusinessDayPage() {
  const [businessDay, setBusinessDay] = useState<BusinessDay | null>(null);
  const [loading, setLoading] = useState(true);

  const [openDate, setOpenDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [health, setHealth] = useState<CashHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadBusinessDay() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("get_current_business_day");

    if (error) {
      setError(error.message);
      setBusinessDay(null);
    } else {
      setBusinessDay(data?.[0] ?? null);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadBusinessDay();
  }, []);

  async function prepareOpenBusinessDay() {
    setMessage("");
    setError("");
    setHealth(null);
    setShowOpenModal(true);
    setHealthLoading(true);

    const { data, error } = await supabase.rpc(
      "get_management_cash_health"
    );

    if (error) {
      setError(error.message);
      setHealthLoading(false);
      return;
    }

    const result = data?.[0] ?? null;

    setHealth(result);
    setHealthLoading(false);
  }

  function closeOpenModal() {
    if (opening) return;

    setShowOpenModal(false);
    setHealth(null);
    setError("");
  }

  async function confirmOpenBusinessDay() {
    if (!openDate) {
      setError("Please select a business date.");
      return;
    }

    setOpening(true);
    setError("");
    setMessage("");

    const { error } = await supabase.rpc("open_business_day", {
      p_business_date: openDate,
    });

    if (error) {
      setError(error.message);
      setOpening(false);
      return;
    }

    setShowOpenModal(false);
    setHealth(null);
    setMessage(`Business day ${formatDate(openDate)} has been opened.`);

    await loadBusinessDay();

    setOpening(false);
  }

  async function beginClosing() {
    setClosing(true);
    setError("");
    setMessage("");

    const { error } = await supabase.rpc("close_business_day");

    if (error) {
      setError(error.message);
      setClosing(false);
      return;
    }

    setMessage("Business day is now in Closing status.");
    await loadBusinessDay();

    setClosing(false);
  }

  async function finalizeBusinessDay() {
    setFinalizing(true);
    setError("");
    setMessage("");

    const { error } = await supabase.rpc("finalize_business_day");

    if (error) {
      setError(error.message);
      setFinalizing(false);
      return;
    }

    setMessage("Business day has been finalized and closed.");
    await loadBusinessDay();

    setFinalizing(false);
  }

  const isOpen = businessDay?.status === "open";
  const isClosing = businessDay?.status === "closing";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
              Business Day
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Open, close, and finalize the company operating day.
            </p>
          </div>

          <Link
            href="/management"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
          >
            ← Management Dashboard
          </Link>
        </div>

        {message && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {error && !showOpenModal && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Business Day */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">
              Current Business Day
            </h2>

            {loading ? (
              <div className="mt-6 text-sm text-gray-500">
                Loading business day...
              </div>
            ) : businessDay ? (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Business Date
                  </p>

                  <p className="mt-1 text-lg font-semibold text-gray-950">
                    {formatDate(businessDay.business_date)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Status
                  </p>

                  <span
                    className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${
                      businessDay.status === "open"
                        ? "border-green-200 bg-green-50 text-green-800"
                        : businessDay.status === "closing"
                        ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                        : "border-gray-200 bg-gray-50 text-gray-700"
                    }`}
                  >
                    {businessDay.status === "open"
                      ? "Open"
                      : businessDay.status === "closing"
                      ? "Closing"
                      : "Closed"}
                  </span>
                </div>

                {isOpen && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-900">
                      Business day is open
                    </p>

                    <p className="mt-1 text-sm text-green-800">
                      New transfers, Paybot cash sessions, and rate entry are
                      available.
                    </p>
                  </div>
                )}

                {isClosing && (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-sm font-medium text-yellow-900">
                      Business day is closing
                    </p>

                    <p className="mt-1 text-sm text-yellow-800">
                      New transfers and new Paybot cash sessions are blocked.
                      Existing operational work can continue, and exchange
                      rates can still be entered.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {isOpen && (
                    <button
                      onClick={beginClosing}
                      disabled={closing}
                      className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {closing ? "Beginning Closing..." : "Begin Closing"}
                    </button>
                  )}

                  {isClosing && (
                    <button
                      onClick={finalizeBusinessDay}
                      disabled={finalizing}
                      className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {finalizing
                        ? "Finalizing..."
                        : "Finalize Business Day"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">
                  No active business day
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  The company is currently closed.
                </p>
              </div>
            )}
          </section>

          {/* Open New Day */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">
              Open Business Day
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Before opening a new day, the system will review the previous
              business day&apos;s Paybot cash reconciliation.
            </p>

            <div className="mt-6">
              <label
                htmlFor="business-date"
                className="block text-sm font-medium text-gray-900"
              >
                Business Date
              </label>

              <input
                id="business-date"
                type="date"
                value={openDate}
                onChange={(e) => setOpenDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-950 focus:ring-1 focus:ring-gray-950"
              />
            </div>

            <button
              onClick={prepareOpenBusinessDay}
              disabled={loading || !!businessDay}
              className="mt-5 w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open Business Day
            </button>

            {businessDay && (
              <p className="mt-3 text-xs leading-5 text-gray-500">
                You must finalize the current business day before opening
                another one.
              </p>
            )}
          </section>
        </div>

        {/* Operating Rules */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            Business Day Rules
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium text-gray-950">Open</p>

              <p className="mt-1 text-sm leading-5 text-gray-500">
                New transfers, new Paybot cash sessions, and rate entry are
                allowed.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium text-gray-950">Closing</p>

              <p className="mt-1 text-sm leading-5 text-gray-500">
                New transfers and new Paybot cash sessions are blocked.
                Existing work can continue.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium text-gray-950">Closed</p>

              <p className="mt-1 text-sm leading-5 text-gray-500">
                Operational activity is stopped until Management opens the
                next business day.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Open Business Day Health Confirmation Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-950">
                  Company Cash Health Review
                </h2>

                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Review the previous business day before opening the next one.
                </p>
              </div>

              <button
                onClick={closeOpenModal}
                disabled={opening}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {healthLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Checking company cash health...
                </div>
              ) : health ? (
                <div className="space-y-3">
                  <div
                    className={`rounded-lg border px-3 py-2.5 ${healthClasses(
                      health.health_status
                    )}`}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide opacity-75">
                      Company Cash Health
                    </p>

                    <p className="mt-0.5 text-sm font-semibold">
                      {healthLabel(health.health_status)}
                    </p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Previous Business Day
                    </p>

                    <p className="mt-0.5 text-sm font-medium text-gray-950">
                      {formatDate(health.business_date)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs text-gray-500">
                        Paybot Sessions
                      </p>

                      <p className="mt-0.5 text-lg font-semibold text-gray-950">
                        {health.total_sessions}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs text-gray-500">
                        Closed Sessions
                      </p>

                      <p className="mt-0.5 text-lg font-semibold text-gray-950">
                        {health.closed_sessions}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs text-gray-500">
                        Open Sessions
                      </p>

                      <p className="mt-0.5 text-lg font-semibold text-gray-950">
                        {health.open_sessions}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs text-gray-500">
                        Discrepancy Sessions
                      </p>

                      <p className="mt-0.5 text-lg font-semibold text-gray-950">
                        {health.discrepancy_sessions}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs text-gray-600">
                        Unresolved discrepancy sessions
                      </span>

                      <span className="text-sm font-semibold text-gray-950">
                        {health.unresolved_discrepancy_sessions}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-4">
                      <span className="text-xs text-gray-600">
                        Unresolved exposure
                      </span>

                      <span
                        className={`text-sm font-semibold ${
                          health.unresolved_discrepancy_amount > 0
                            ? "text-red-700"
                            : "text-gray-950"
                        }`}
                      >
                        {formatMoney(health.unresolved_discrepancy_amount)}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-4">
                      <span className="text-xs text-gray-600">
                        Total absolute discrepancy
                      </span>

                      <span className="text-sm font-semibold text-gray-950">
                        {formatMoney(health.total_absolute_discrepancy)}
                      </span>
                    </div>
                  </div>

                  {health.health_status === "attention_required" ? (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                      <p className="text-xs font-medium text-yellow-900">
                        Management attention required
                      </p>

                      <p className="mt-1 text-xs leading-5 text-yellow-800">
                        There are unresolved cash discrepancies from the
                        previous business day. You may still open the new
                        business day, but you are explicitly acknowledging this
                        condition.
                      </p>
                    </div>
                  ) : health.health_status === "explained" ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-medium text-blue-900">
                        Discrepancies have been addressed
                      </p>

                      <p className="mt-1 text-xs leading-5 text-blue-800">
                        Discrepancies exist in the previous day&apos;s
                        reconciliation, but they have recorded corrections.
                      </p>
                    </div>
                  ) : health.health_status === "pending_reconciliation" ? (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                      <p className="text-xs font-medium text-yellow-900">
                        Reconciliation is still pending
                      </p>

                      <p className="mt-1 text-xs leading-5 text-yellow-800">
                        Some Paybot cash sessions from the previous day are
                        still open.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs font-medium text-green-900">
                        Company cash position looks healthy
                      </p>

                      <p className="mt-1 text-xs leading-5 text-green-800">
                        No unresolved Paybot cash discrepancies were found.
                      </p>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs text-gray-600">
                      You are about to open{" "}
                      <span className="font-semibold text-gray-950">
                        {formatDate(openDate)}
                      </span>
                      .
                    </p>

                    <p className="mt-1.5 text-[11px] leading-5 text-gray-500">
                      By confirming, Management acknowledges the cash health
                      information shown above and authorizes the new business
                      day to open.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  Unable to retrieve the company cash health. Please close this
                  window and try again.
                </div>
              )}

              {error && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                  {error}
                </div>
              )}
            </div>

            {/* Fixed Modal Footer */}
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
              <button
                onClick={closeOpenModal}
                disabled={opening}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={confirmOpenBusinessDay}
                disabled={opening || healthLoading || !health}
                className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {opening
                  ? "Opening Business Day..."
                  : "Confirm & Open Business Day"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
