"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type BusinessDay = {
  id: string;
  business_date: string;
  status: "open" | "closing" | "closed" | string;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
};

type Session = {
  id: string;
  cash_date: string;
  currency: string;
  opening_cash: number;
  new_float: number;
  payouts: number;
  closing_cash: number | null;
  closed_at: string | null;
};

type CorrectionRequest = {
  id: string;
  session_id: string;
  paybot_id: string;
  old_closing_cash: number;
  requested_closing_cash: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "used" | "expired" | string;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString();
}

function getBusinessDayLabel(status: string) {
  switch (status) {
    case "open":
      return "OPEN";
    case "closing":
      return "CLOSING";
    case "closed":
      return "CLOSED";
    default:
      return status.toUpperCase();
  }
}

function getBusinessDayClasses(status: string) {
  switch (status) {
    case "open":
      return "border-green-200 bg-green-50 text-green-700";
    case "closing":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    case "closed":
      return "border-gray-200 bg-gray-50 text-gray-600";
    default:
      return "border-gray-200 bg-gray-50 text-gray-600";
  }
}

function getCorrectionStatusClasses(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "approved":
      return "bg-blue-100 text-blue-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "used":
      return "bg-green-100 text-green-800";
    case "expired":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function PaybotCashPage() {
  const supabase = createClient();

  const [businessDay, setBusinessDay] = useState<BusinessDay | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [correctionRequests, setCorrectionRequests] = useState<
    CorrectionRequest[]
  >([]);

  const [currency, setCurrency] = useState("USD");
  const [openingCash, setOpeningCash] = useState("");
  const [newFloat, setNewFloat] = useState("");
  const [closingCash, setClosingCash] = useState("");

  const [correctionAmount, setCorrectionAmount] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [showCorrectionForm, setShowCorrectionForm] = useState(false);

  const [loading, setLoading] = useState(true);
  const [openingSession, setOpeningSession] = useState(false);
  const [recordingFloat, setRecordingFloat] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [requestingCorrection, setRequestingCorrection] = useState(false);
  const [applyingCorrection, setApplyingCorrection] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isOpen = businessDay?.status === "open";
  const isClosing = businessDay?.status === "closing";
  const isClosed = !businessDay || businessDay.status === "closed";

  const sessionIsClosed = Boolean(session?.closed_at);

  const sessionRequests = useMemo(() => {
    if (!session) return [];

    return correctionRequests.filter(
      (request) => request.session_id === session.id
    );
  }, [correctionRequests, session]);

  const pendingRequest = sessionRequests.find(
    (request) => request.status === "pending"
  );

  const approvedRequest = sessionRequests.find(
    (request) => request.status === "approved"
  );

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const { data: dayData, error: dayError } = await supabase.rpc(
        "get_current_business_day"
      );

      if (dayError) throw dayError;

      const currentDay = Array.isArray(dayData) ? dayData[0] : dayData;

      setBusinessDay(currentDay ?? null);

      if (!currentDay) {
        setSession(null);
        setCorrectionRequests([]);
        return;
      }

      const [
        { data: sessionData, error: sessionError },
        { data: requestData, error: requestError },
      ] = await Promise.all([
        supabase.rpc("get_paybot_cash_session", {
          p_cash_date: currentDay.business_date,
          p_currency: currency,
        }),
        supabase.rpc("get_paybot_cash_correction_requests", {
          p_status: null,
        }),
      ]);

      if (sessionError) throw sessionError;
      if (requestError) throw requestError;

      const currentSession = Array.isArray(sessionData)
        ? sessionData[0]
        : sessionData;

      setSession(currentSession ?? null);
      setCorrectionRequests(requestData ?? []);

      if (currentSession?.opening_cash !== undefined) {
        setOpeningCash(String(currentSession.opening_cash));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load cash session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [currency]);

  async function handleOpenSession() {
    setMessage("");
    setError("");

    if (!businessDay) {
      setError("There is no active Business Day.");
      return;
    }

    if (!isOpen) {
      setError(
        "A new cash session can only be opened while the Business Day is OPEN."
      );
      return;
    }

    const amount = Number(openingCash);

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid opening cash amount.");
      return;
    }

    setOpeningSession(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "open_paybot_cash_session",
        {
          p_cash_date: businessDay.business_date,
          p_currency: currency,
          p_opening_cash: amount,
        }
      );

      if (rpcError) throw rpcError;

      setMessage("Cash session opened successfully.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to open cash session.");
    } finally {
      setOpeningSession(false);
    }
  }

  async function handleRecordFloat() {
    setMessage("");
    setError("");

    if (!session) {
      setError("Open a cash session first.");
      return;
    }

    if (sessionIsClosed) {
      setError("This cash session is already closed.");
      return;
    }

    const amount = Number(newFloat);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid float amount greater than zero.");
      return;
    }

    setRecordingFloat(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "record_paybot_cash_receipt",
        {
          p_session_id: session.id,
          p_amount: amount,
          p_notes: "Additional float",
        }
      );

      if (rpcError) throw rpcError;

      setNewFloat("");
      setMessage("New float recorded successfully.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to record float.");
    } finally {
      setRecordingFloat(false);
    }
  }

  async function handleCloseSession() {
    setMessage("");
    setError("");

    if (!session) {
      setError("There is no active cash session.");
      return;
    }

    if (sessionIsClosed) {
      setError("This cash session is already closed.");
      return;
    }

    const amount = Number(closingCash);

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid physical closing cash amount.");
      return;
    }

    setClosingSession(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "close_paybot_cash_session",
        {
          p_session_id: session.id,
          p_closing_cash: amount,
        }
      );

      if (rpcError) throw rpcError;

      setClosingCash("");
      setMessage(
        "Cash declaration recorded. The cash session has been closed and is now available for reconciliation by the auditor."
      );

      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to close cash session.");
    } finally {
      setClosingSession(false);
    }
  }

  async function handleRequestCorrection() {
    setMessage("");
    setError("");

    if (!session || !sessionIsClosed) {
      setError("Only a closed cash session can be corrected.");
      return;
    }

    if (pendingRequest) {
      setError(
        "There is already a pending correction request for this session."
      );
      return;
    }

    if (approvedRequest) {
      setError(
        "There is already an approved correction waiting to be applied."
      );
      return;
    }

    const amount = Number(correctionAmount);
    const reason = correctionReason.trim();

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid corrected closing cash amount.");
      return;
    }

    if (amount === Number(session.closing_cash)) {
      setError(
        "The corrected amount must be different from the current closing cash."
      );
      return;
    }

    if (reason.length < 3) {
      setError("Please provide a reason for the correction.");
      return;
    }

    setRequestingCorrection(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "request_paybot_cash_correction",
        {
          p_session_id: session.id,
          p_requested_closing_cash: amount,
          p_reason: reason,
        }
      );

      if (rpcError) throw rpcError;

      setCorrectionAmount("");
      setCorrectionReason("");
      setShowCorrectionForm(false);

      setMessage(
        "Correction request submitted. Management must approve it before you can apply the correction."
      );

      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to submit correction request.");
    } finally {
      setRequestingCorrection(false);
    }
  }

  async function handleApplyCorrection(requestId: string) {
    setMessage("");
    setError("");

    setApplyingCorrection(requestId);

    try {
      const { error: rpcError } = await supabase.rpc(
        "apply_paybot_cash_correction",
        {
          p_request_id: requestId,
        }
      );

      if (rpcError) throw rpcError;

      setMessage(
        "Correction applied successfully. The original declaration remains permanently recorded in the audit trail."
      );

      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to apply correction.");
    } finally {
      setApplyingCorrection(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm text-gray-500">Loading cash session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Navigation + Header */}
        <div>
          <Link
            href="/paybot"
            className="mb-4 inline-flex items-center text-sm font-medium text-gray-500 transition hover:text-gray-900"
          >
            ← Paybot Dashboard
          </Link>

          <h1 className="text-2xl font-semibold text-gray-900">
            Paybot Cash
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage your physical cash session and declare your closing balance.
          </p>
        </div>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">Business Day</p>

              {businessDay ? (
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {businessDay.business_date}
                </p>
              ) : (
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  No active Business Day
                </p>
              )}
            </div>

            <div
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getBusinessDayClasses(
                businessDay?.status ?? "closed"
              )}`}
            >
              {getBusinessDayLabel(businessDay?.status ?? "closed")}
            </div>
          </div>

          {isClosing && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              <p className="font-medium">Business Day is closing.</p>
              <p className="mt-1">
                New Paybot cash sessions cannot be opened, but existing cash
                sessions can continue and be closed.
              </p>
            </div>
          )}

          {isClosed && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              No new cash operations are available because there is no active
              Business Day.
            </div>
          )}
        </section>

        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {!session && (
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Open Cash Session
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Declare the physical cash you have when opening your session.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Currency
                </label>

                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={!isOpen || openingSession}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                >
                  <option value="USD">USD</option>
                  <option value="CDF">CDF</option>
                  <option value="RWF">RWF</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Opening Cash
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  disabled={!isOpen || openingSession}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
              </div>
            </div>

            <button
              onClick={handleOpenSession}
              disabled={!isOpen || openingSession}
              className="mt-5 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {openingSession ? "Opening..." : "Open Cash Session"}
            </button>
          </section>
        )}

        {session && (
          <>
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Cash Session
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {session.cash_date} · {session.currency}
                  </p>
                </div>

                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    sessionIsClosed
                      ? "bg-gray-100 text-gray-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {sessionIsClosed ? "CLOSED" : "OPEN"}
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Opening Cash
                  </p>

                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {formatMoney(session.opening_cash)} {session.currency}
                  </p>
                </div>

                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    New Float
                  </p>

                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {formatMoney(session.new_float)} {session.currency}
                  </p>
                </div>

                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Payouts
                  </p>

                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {formatMoney(session.payouts)} {session.currency}
                  </p>
                </div>
              </div>

              {!sessionIsClosed && (
                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h3 className="font-medium text-gray-900">
                      Record New Float
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Record additional physical cash received during the
                      session.
                    </p>

                    <div className="mt-4">
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Amount
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newFloat}
                        onChange={(e) => setNewFloat(e.target.value)}
                        disabled={recordingFloat}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <button
                      onClick={handleRecordFloat}
                      disabled={recordingFloat}
                      className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {recordingFloat ? "Recording..." : "Record Float"}
                    </button>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h3 className="font-medium text-gray-900">
                      Declare Closing Cash
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Enter the physical cash you actually have.
                    </p>

                    <div className="mt-4">
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Physical Closing Cash
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={closingCash}
                        onChange={(e) => setClosingCash(e.target.value)}
                        disabled={closingSession}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <button
                      onClick={handleCloseSession}
                      disabled={closingSession}
                      className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {closingSession
                        ? "Closing..."
                        : "Declare & Close Session"}
                    </button>
                  </div>
                </div>
              )}

              {sessionIsClosed && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-900">
                    Physical closing cash
                  </p>

                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {formatMoney(session.closing_cash)} {session.currency}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    Closed on {formatDateTime(session.closed_at)}.
                  </p>

                  <p className="mt-3 text-sm text-gray-600">
                    Expected cash and discrepancy are not displayed to
                    Paybots. The Auditor can perform the reconciliation.
                  </p>
                </div>
              )}
            </section>

            {sessionIsClosed && (
              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Closing Cash Correction
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      If you entered the wrong closing cash, request permission
                      from Management to correct it.
                    </p>
                  </div>

                  {!pendingRequest && !approvedRequest && (
                    <button
                      onClick={() => {
                        setError("");
                        setMessage("");
                        setCorrectionAmount(
                          session.closing_cash !== null
                            ? String(session.closing_cash)
                            : ""
                        );
                        setCorrectionReason("");
                        setShowCorrectionForm(true);
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                      Request Correction
                    </button>
                  )}
                </div>

                {showCorrectionForm && (
                  <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-gray-900">
                          Request a Closing Cash Correction
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          Management must approve the request before the
                          corrected value can be applied.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCorrectionForm(false)}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Current Closing Cash
                        </label>

                        <input
                          type="text"
                          value={`${formatMoney(
                            session.closing_cash
                          )} ${session.currency}`}
                          disabled
                          className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-600"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Correct Closing Cash
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={correctionAmount}
                          onChange={(e) =>
                            setCorrectionAmount(e.target.value)
                          }
                          disabled={requestingCorrection}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Reason
                      </label>

                      <textarea
                        value={correctionReason}
                        onChange={(e) =>
                          setCorrectionReason(e.target.value)
                        }
                        disabled={requestingCorrection}
                        rows={4}
                        placeholder="Explain why the closing cash needs to be corrected..."
                        className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={handleRequestCorrection}
                        disabled={requestingCorrection}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {requestingCorrection
                          ? "Submitting..."
                          : "Submit Request"}
                      </button>

                      <button
                        onClick={() => setShowCorrectionForm(false)}
                        disabled={requestingCorrection}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {approvedRequest && (
                  <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-blue-900">
                          Correction Approved
                        </p>

                        <p className="mt-1 text-sm text-blue-800">
                          Management approved this exact correction. You can
                          now apply it.
                        </p>
                      </div>

                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                        APPROVED
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-blue-700">
                          Original
                        </p>

                        <p className="mt-1 font-semibold text-blue-950">
                          {formatMoney(
                            approvedRequest.old_closing_cash
                          )}{" "}
                          {session.currency}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-blue-700">
                          Corrected
                        </p>

                        <p className="mt-1 font-semibold text-blue-950">
                          {formatMoney(
                            approvedRequest.requested_closing_cash
                          )}{" "}
                          {session.currency}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-blue-800">
                      Reason: {approvedRequest.reason}
                    </p>

                    <button
                      onClick={() =>
                        handleApplyCorrection(approvedRequest.id)
                      }
                      disabled={applyingCorrection === approvedRequest.id}
                      className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applyingCorrection === approvedRequest.id
                        ? "Applying..."
                        : "Apply Approved Correction"}
                    </button>
                  </div>
                )}

                {pendingRequest && (
                  <div className="mt-5 rounded-lg border border-yellow-200 bg-yellow-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-yellow-900">
                          Correction Request Pending
                        </p>

                        <p className="mt-1 text-sm text-yellow-800">
                          Your request is waiting for Management approval.
                        </p>
                      </div>

                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                        PENDING
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-yellow-700">
                          Current
                        </p>

                        <p className="mt-1 font-semibold text-yellow-950">
                          {formatMoney(
                            pendingRequest.old_closing_cash
                          )}{" "}
                          {session.currency}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-yellow-700">
                          Requested
                        </p>

                        <p className="mt-1 font-semibold text-yellow-950">
                          {formatMoney(
                            pendingRequest.requested_closing_cash
                          )}{" "}
                          {session.currency}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-yellow-800">
                      Reason: {pendingRequest.reason}
                    </p>
                  </div>
                )}

                {sessionRequests.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Correction History
                    </h3>

                    <div className="mt-3 overflow-hidden rounded-lg border">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Original</th>
                              <th className="px-4 py-3">Requested</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Reason</th>
                            </tr>
                          </thead>

                          <tbody className="divide-y">
                            {sessionRequests.map((request) => (
                              <tr key={request.id}>
                                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                                  {formatDateTime(request.created_at)}
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                                  {formatMoney(
                                    request.old_closing_cash
                                  )}{" "}
                                  {session.currency}
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                                  {formatMoney(
                                    request.requested_closing_cash
                                  )}{" "}
                                  {session.currency}
                                </td>

                                <td className="px-4 py-3">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getCorrectionStatusClasses(
                                      request.status
                                    )}`}
                                  >
                                    {request.status.toUpperCase()}
                                  </span>
                                </td>

                                <td className="min-w-[220px] px-4 py-3 text-gray-600">
                                  {request.reason}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}