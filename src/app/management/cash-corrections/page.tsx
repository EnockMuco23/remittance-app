"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

type CorrectionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "used"
  | "expired";

type CorrectionRequest = {
  id: string;
  session_id: string;
  paybot_id: string;
  paybot_name: string;
  cash_date: string;
  currency: string;
  old_closing_cash: number | string;
  requested_closing_cash: number | string;
  reason: string;
  status: CorrectionStatus;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

const supabase = createClient();

function formatMoney(value: number | string, currency: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return `0.00 ${currency}`;
  }

  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString();
}

function formatDate(value: string) {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function statusClasses(status: CorrectionStatus) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";

    case "approved":
      return "bg-blue-100 text-blue-800 border-blue-200";

    case "used":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";

    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";

    case "expired":
      return "bg-slate-100 text-slate-700 border-slate-200";

    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function statusLabel(status: CorrectionStatus) {
  switch (status) {
    case "pending":
      return "Pending";

    case "approved":
      return "Approved";

    case "used":
      return "Used";

    case "rejected":
      return "Rejected";

    case "expired":
      return "Expired";

    default:
      return status;
  }
}

export default function ManagementCashCorrectionsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [decisionRequest, setDecisionRequest] =
    useState<CorrectionRequest | null>(null);

  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [decisionNote, setDecisionNote] = useState("");

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  );

  async function loadRequests() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc(
      "get_management_paybot_cash_correction_requests",
      {
        p_status: null,
      }
    );

    if (error) {
      setError(error.message);
      setRequests([]);
      setLoading(false);
      return;
    }

    setRequests((data ?? []) as CorrectionRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profileError || profile?.role !== "management") {
        window.location.href = "/dashboard";
        return;
      }

      await loadRequests();
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  function openDecision(
    request: CorrectionRequest,
    selectedDecision: "approve" | "reject"
  ) {
    setDecisionRequest(request);
    setDecision(selectedDecision);
    setDecisionNote("");
    setError("");
    setSuccess("");
  }

  function closeDecision() {
    if (processingId) return;

    setDecisionRequest(null);
    setDecisionNote("");
  }

  async function submitDecision() {
    if (!decisionRequest) return;

    if (decision === "reject" && decisionNote.trim().length === 0) {
      setError("Please provide a reason when rejecting a correction request.");
      return;
    }

    if (decisionNote.length > 1000) {
      setError("Decision note cannot exceed 1000 characters.");
      return;
    }

    setProcessingId(decisionRequest.id);
    setError("");
    setSuccess("");

    const { error: decisionError } = await supabase.rpc(
      "decide_paybot_cash_correction",
      {
        p_request_id: decisionRequest.id,
        p_approve: decision === "approve",
        p_decision_note: decisionNote.trim() || null,
      }
    );

    if (decisionError) {
      setError(decisionError.message);
      setProcessingId(null);
      return;
    }

    setSuccess(
      decision === "approve"
        ? "Correction approved successfully."
        : "Correction request rejected."
    );

    setDecisionRequest(null);
    setDecisionNote("");
    setProcessingId(null);

    await loadRequests();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2">
              <Link
                href="/management"
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                ← Management Dashboard
              </Link>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Cash Correction Requests
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Review and authorize Paybot requests to correct a previously
              declared physical closing balance.
            </p>
          </div>

          <button
            type="button"
            onClick={loadRequests}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {/* Summary */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Pending Requests
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {pendingRequests.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Total Requests
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {requests.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Awaiting Management
            </p>
            <p className="mt-2 text-sm font-semibold text-amber-700">
              {pendingRequests.length === 0
                ? "Nothing requires your attention"
                : `${pendingRequests.length} request${
                    pendingRequests.length === 1 ? "" : "s"
                  } require review`}
            </p>
          </div>
        </div>

        {/* Requests */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-bold text-slate-900">
              Correction Requests
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Management approval authorizes only the exact correction
              requested by the Paybot.
            </p>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              Loading correction requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                ✓
              </div>

              <h3 className="font-semibold text-slate-900">
                No correction requests
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                There are currently no Paybot cash correction requests.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((request) => {
                const difference =
                  Number(request.requested_closing_cash) -
                  Number(request.old_closing_cash);

                return (
                  <div
                    key={request.id}
                    className="p-6 transition hover:bg-slate-50/70"
                  >
                    <div className="flex flex-col gap-5">
                      {/* Top row */}
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">
                              {request.paybot_name}
                            </h3>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                                request.status
                              )}`}
                            >
                              {statusLabel(request.status)}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {formatDate(request.cash_date)} ·{" "}
                            {request.currency} · Session{" "}
                            <span className="font-mono text-xs">
                              {request.session_id.slice(0, 8)}...
                            </span>
                          </p>
                        </div>

                        <div className="text-left lg:text-right">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Requested
                          </p>

                          <p className="mt-1 text-sm font-semibold text-slate-700">
                            {formatDateTime(request.requested_at)}
                          </p>
                        </div>
                      </div>

                      {/* Correction comparison */}
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Original
                          </p>

                          <p className="mt-2 text-xl font-bold text-slate-900">
                            {formatMoney(
                              request.old_closing_cash,
                              request.currency
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                            Requested
                          </p>

                          <p className="mt-2 text-xl font-bold text-blue-900">
                            {formatMoney(
                              request.requested_closing_cash,
                              request.currency
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Change
                          </p>

                          <p
                            className={`mt-2 text-xl font-bold ${
                              difference >= 0
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {difference >= 0 ? "+" : ""}
                            {formatMoney(difference, request.currency)}
                          </p>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Paybot's Reason
                        </p>

                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {request.reason}
                        </p>
                      </div>

                      {/* Decision information */}
                      {request.decision_note && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Management Decision Note
                          </p>

                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {request.decision_note}
                          </p>
                        </div>
                      )}

                      {request.status === "approved" &&
                        request.expires_at && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                            Approved correction expires{" "}
                            <span className="font-semibold">
                              {formatDateTime(request.expires_at)}
                            </span>
                            .
                          </div>
                        )}

                      {request.status === "used" && request.used_at && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                          This approved correction was applied on{" "}
                          <span className="font-semibold">
                            {formatDateTime(request.used_at)}
                          </span>
                          .
                        </div>
                      )}

                      {/* Actions */}
                      {request.status === "pending" && (
                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              openDecision(request, "reject")
                            }
                            disabled={processingId === request.id}
                            className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reject
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openDecision(request, "approve")
                            }
                            disabled={processingId === request.id}
                            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Approve Correction
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Decision Modal */}
      {decisionRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-bold text-slate-900">
                {decision === "approve"
                  ? "Approve Cash Correction"
                  : "Reject Cash Correction"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {decision === "approve"
                  ? "This authorizes the Paybot to apply the exact correction shown below."
                  : "Record why Management is rejecting this correction request."}
              </p>
            </div>

            <div className="space-y-5 px-6 py-6">
              {/* Exact correction */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Current
                    </p>

                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatMoney(
                        decisionRequest.old_closing_cash,
                        decisionRequest.currency
                      )}
                    </p>
                  </div>

                  <div className="text-slate-400">→</div>

                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Requested
                    </p>

                    <p className="mt-1 text-lg font-bold text-blue-900">
                      {formatMoney(
                        decisionRequest.requested_closing_cash,
                        decisionRequest.currency
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Paybot's Reason
                </p>

                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                  {decisionRequest.reason}
                </div>
              </div>

              {/* Decision note */}
              <div>
                <label
                  htmlFor="decision-note"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Management Note{" "}
                  {decision === "reject" && (
                    <span className="text-red-600">*</span>
                  )}
                </label>

                <textarea
                  id="decision-note"
                  value={decisionNote}
                  onChange={(event) =>
                    setDecisionNote(event.target.value)
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder={
                    decision === "approve"
                      ? "Optional note..."
                      : "Explain why this correction is being rejected..."
                  }
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />

                <p className="mt-1 text-right text-xs text-slate-400">
                  {decisionNote.length}/1000
                </p>
              </div>

              {decision === "approve" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
                  <span className="font-semibold">Important:</span> approval
                  does not directly edit the cash session. It gives the
                  Paybot permission to apply this exact correction once.
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDecision}
                disabled={!!processingId}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submitDecision}
                disabled={!!processingId}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  decision === "approve"
                    ? "bg-slate-900 hover:bg-slate-800"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {processingId
                  ? "Processing..."
                  : decision === "approve"
                    ? "Approve Correction"
                    : "Reject Correction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}