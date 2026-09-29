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
      return "Explained";
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
      return "bg-[#34c759]";
    case "explained":
      return "bg-[#007aff]";
    case "attention_required":
      return "bg-[#ff3b30]";
    case "pending_reconciliation":
      return "bg-[#ffcc00]";
    default:
      return "bg-[#86868b]";
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

    const { data, error } = await supabase.rpc(
      "get_current_business_day"
    );

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

  const statusLabel = isOpen
    ? "Open"
    : isClosing
      ? "Closing"
      : "Closed";

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">
              Business Day
            </h1>

            <p className="mt-2 text-[#86868b]">
              Open, close, and finalize
            </p>
          </div>

          <Link
            href="/management"
            className="rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-[#1d1d1f] shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition hover:bg-[#fafafa]"
          >
            Management
          </Link>
        </header>

        {message && (
          <div className="mb-6 rounded-[18px] bg-white px-5 py-4 text-sm text-[#34c759] shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            {message}
          </div>
        )}

        {error && !showOpenModal && (
          <div className="mb-6 rounded-[18px] bg-white px-5 py-4 text-sm text-[#ff3b30] shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-[#86868b]">
              Current Business Day
            </p>

            {loading ? (
              <div className="mt-8 text-sm text-[#86868b]">
                Loading...
              </div>
            ) : businessDay ? (
              <div className="mt-8">
                <div>
                  <p className="text-sm text-[#86868b]">
                    Business Date
                  </p>

                  <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
                    {formatDate(businessDay.business_date)}
                  </p>
                </div>

                <div className="mt-7">
                  <p className="text-sm text-[#86868b]">
                    Status
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${
                        isOpen
                          ? "bg-[#34c759]"
                          : isClosing
                            ? "bg-[#ffcc00]"
                            : "bg-[#86868b]"
                      }`}
                    />

                    <span className="text-lg font-semibold">
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-7 rounded-[18px] bg-[#f5f5f7] p-5">
                    <p className="font-medium">
                      Business day is open
                    </p>

                    <p className="mt-2 text-sm leading-6 text-[#86868b]">
                      New transfers, Paybot cash sessions, and rate entry
                      are available.
                    </p>
                  </div>
                )}

                {isClosing && (
                  <div className="mt-7 rounded-[18px] bg-[#fff9e6] p-5">
                    <p className="font-medium">
                      Business day is closing
                    </p>

                    <p className="mt-2 text-sm leading-6 text-[#86868b]">
                      New transfers and new Paybot cash sessions are
                      blocked. Existing work can continue.
                    </p>
                  </div>
                )}

                <div className="mt-7">
                  {isOpen && (
                    <button
                      onClick={beginClosing}
                      disabled={closing}
                      className="w-full rounded-xl bg-[#007aff] px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {closing ? "Closing..." : "Begin Closing"}
                    </button>
                  )}

                  {isClosing && (
                    <button
                      onClick={finalizeBusinessDay}
                      disabled={finalizing}
                      className="w-full rounded-xl bg-[#007aff] px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {finalizing ? "Finalizing..." : "Finalize"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[18px] bg-[#f5f5f7] p-5">
                <p className="font-medium">
                  No active business day
                </p>

                <p className="mt-2 text-sm text-[#86868b]">
                  The company is currently closed.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-[#86868b]">
              Open Business Day
            </p>

            <p className="mt-3 text-lg font-semibold">
              Choose a date
            </p>

            <p className="mt-2 text-sm leading-6 text-[#86868b]">
              Cash reconciliation will be reviewed before opening.
            </p>

            <div className="mt-7">
              <label
                htmlFor="business-date"
                className="block text-sm font-medium"
              >
                Business Date
              </label>

              <input
                id="business-date"
                type="date"
                value={openDate}
                onChange={(e) => setOpenDate(e.target.value)}
                className="mt-2 w-full rounded-xl bg-[#f0f0f2] px-4 py-3 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-[#007aff]"
              />
            </div>

            <button
              onClick={prepareOpenBusinessDay}
              disabled={loading || !!businessDay}
              className="mt-5 w-full rounded-xl bg-[#007aff] px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open
            </button>

            {businessDay && (
              <p className="mt-3 text-center text-xs text-[#86868b]">
                Finalize the current business day first.
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <p className="text-sm text-[#86868b]">
            Business Day Rules
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[#34c759]"
                />

                <p className="font-semibold">Open</p>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#86868b]">
                Transfers, Paybot cash sessions, and rate entry are allowed.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[#ffcc00]"
                />

                <p className="font-semibold">Closing</p>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#86868b]">
                New transfers and Paybot cash sessions are blocked.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[#86868b]"
                />

                <p className="font-semibold">Closed</p>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#86868b]">
                Operational activity is stopped until the next business day.
              </p>
            </div>
          </div>
        </section>
      </div>

      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
            <div className="flex items-start justify-between px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                  Cash Health
                </h2>

                <p className="mt-1 text-sm text-[#86868b]">
                  Review before opening
                </p>
              </div>

              <button
                onClick={closeOpenModal}
                disabled={opening}
                className="rounded-full px-2 py-1 text-lg text-[#86868b] transition hover:bg-[#f5f5f7] disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
              {healthLoading ? (
                <div className="py-10 text-center text-sm text-[#86868b]">
                  Checking...
                </div>
              ) : health ? (
                <div className="space-y-5">
                  <div className="rounded-[18px] bg-[#f5f5f7] p-5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${healthClasses(
                          health.health_status
                        )}`}
                      />

                      <p className="font-semibold">
                        {healthLabel(health.health_status)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-[#86868b]">
                      Previous Business Day
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatDate(health.business_date)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[18px] bg-[#f5f5f7] p-4">
                      <p className="text-sm text-[#86868b]">
                        Paybot Sessions
                      </p>

                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {health.total_sessions}
                      </p>
                    </div>

                    <div className="rounded-[18px] bg-[#f5f5f7] p-4">
                      <p className="text-sm text-[#86868b]">
                        Closed
                      </p>

                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {health.closed_sessions}
                      </p>
                    </div>

                    <div className="rounded-[18px] bg-[#f5f5f7] p-4">
                      <p className="text-sm text-[#86868b]">
                        Open
                      </p>

                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {health.open_sessions}
                      </p>
                    </div>

                    <div className="rounded-[18px] bg-[#f5f5f7] p-4">
                      <p className="text-sm text-[#86868b]">
                        Discrepancies
                      </p>

                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {health.discrepancy_sessions}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[18px] bg-[#f5f5f7] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[#86868b]">
                        Unresolved sessions
                      </span>

                      <span className="font-semibold tabular-nums">
                        {health.unresolved_discrepancy_sessions}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[#86868b]">
                        Unresolved exposure
                      </span>

                      <span
                        className={`font-semibold tabular-nums ${
                          health.unresolved_discrepancy_amount > 0
                            ? "text-[#ff3b30]"
                            : ""
                        }`}
                      >
                        {formatMoney(
                          health.unresolved_discrepancy_amount
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[#86868b]">
                        Total discrepancy
                      </span>

                      <span className="font-semibold tabular-nums">
                        {formatMoney(
                          health.total_absolute_discrepancy
                        )}
                      </span>
                    </div>
                  </div>

                  {health.health_status === "attention_required" && (
                    <div className="rounded-[18px] bg-[#fff0ef] p-5">
                      <p className="font-medium text-[#ff3b30]">
                        Attention required
                      </p>

                      <p className="mt-2 text-sm leading-6 text-[#86868b]">
                        Unresolved cash discrepancies exist. Opening will
                        acknowledge this condition.
                      </p>
                    </div>
                  )}

                  {health.health_status === "explained" && (
                    <div className="rounded-[18px] bg-[#f0f7ff] p-5">
                      <p className="font-medium text-[#007aff]">
                        Discrepancies addressed
                      </p>

                      <p className="mt-2 text-sm leading-6 text-[#86868b]">
                        Recorded corrections exist for the previous day.
                      </p>
                    </div>
                  )}

                  {health.health_status === "pending_reconciliation" && (
                    <div className="rounded-[18px] bg-[#fff9e6] p-5">
                      <p className="font-medium">
                        Reconciliation pending
                      </p>

                      <p className="mt-2 text-sm leading-6 text-[#86868b]">
                        Some Paybot cash sessions are still open.
                      </p>
                    </div>
                  )}

                  {health.health_status === "healthy" && (
                    <div className="rounded-[18px] bg-[#f0fff4] p-5">
                      <p className="font-medium text-[#34c759]">
                        Cash position looks healthy
                      </p>

                      <p className="mt-2 text-sm leading-6 text-[#86868b]">
                        No unresolved Paybot cash discrepancies were found.
                      </p>
                    </div>
                  )}

                  <div className="pt-2 text-sm text-[#86868b]">
                    Opening{" "}
                    <span className="font-semibold text-[#1d1d1f]">
                      {formatDate(openDate)}
                    </span>
                    .
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] bg-[#fff0ef] p-5 text-sm text-[#ff3b30]">
                  Unable to retrieve cash health.
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-[18px] bg-[#fff0ef] p-4 text-sm text-[#ff3b30]">
                  {error}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                onClick={closeOpenModal}
                disabled={opening}
                className="rounded-xl px-5 py-3 text-sm font-medium text-[#1d1d1f] transition hover:bg-[#f5f5f7] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={confirmOpenBusinessDay}
                disabled={opening || healthLoading || !health}
                className="rounded-xl bg-[#007aff] px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {opening ? "Opening..." : "Confirm & Open"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}