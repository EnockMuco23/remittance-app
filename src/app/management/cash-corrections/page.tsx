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

function formatMoney(
  value: number | string,
  currency: string
) {
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

  return new Date(
    `${value}T00:00:00`
  ).toLocaleDateString();
}

function statusDot(status: CorrectionStatus) {
  switch (status) {
    case "pending":
      return "bg-[#ffcc00]";
    case "approved":
      return "bg-[#007aff]";
    case "used":
      return "bg-[#34c759]";
    case "rejected":
      return "bg-[#ff3b30]";
    default:
      return "bg-[#86868b]";
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
  const [requests, setRequests] = useState<
    CorrectionRequest[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [decisionRequest, setDecisionRequest] =
    useState<CorrectionRequest | null>(null);

  const [decision, setDecision] =
    useState<"approve" | "reject">("approve");

  const [decisionNote, setDecisionNote] = useState("");

  const pendingRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "pending"
      ),
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

    setRequests(
      (data ?? []) as CorrectionRequest[]
    );

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

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

      if (!mounted) return;

      if (
        profileError ||
        profile?.role !== "management"
      ) {
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

    if (
      decision === "reject" &&
      decisionNote.trim().length === 0
    ) {
      setError(
        "A reason is required when rejecting."
      );
      return;
    }

    if (decisionNote.length > 1000) {
      setError(
        "Decision note cannot exceed 1000 characters."
      );
      return;
    }

    setProcessingId(decisionRequest.id);
    setError("");
    setSuccess("");

    const { error: decisionError } =
      await supabase.rpc(
        "decide_paybot_cash_correction",
        {
          p_request_id: decisionRequest.id,
          p_approve: decision === "approve",
          p_decision_note:
            decisionNote.trim() || null,
        }
      );

    if (decisionError) {
      setError(decisionError.message);
      setProcessingId(null);
      return;
    }

    setSuccess(
      decision === "approve"
        ? "Correction approved."
        : "Correction rejected."
    );

    setDecisionRequest(null);
    setDecisionNote("");
    setProcessingId(null);

    await loadRequests();
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">
              Cash Corrections
            </h1>

            <p className="mt-2 text-[#86868b]">
              Review Paybot correction requests
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/management"
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
            >
              Management
            </Link>

            <button
              type="button"
              onClick={loadRequests}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium shadow-[0_4px_24px_rgba(0,0,0,0.04)] disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-[18px] bg-white px-5 py-4 text-sm text-[#ff3b30] shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-[18px] bg-white px-5 py-4 text-sm text-[#34c759] shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            {success}
          </div>
        )}

        <section className="mb-6 grid gap-6 md:grid-cols-3">
          <MetricCard
            label="Pending"
            value={pendingRequests.length}
          />

          <MetricCard
            label="Total"
            value={requests.length}
          />

          <div className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-[#86868b]">
              Status
            </p>

            <p className="mt-3 text-lg font-semibold">
              {pendingRequests.length === 0
                ? "All clear"
                : `${pendingRequests.length} pending`}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <div className="px-7 py-6">
            <p className="text-sm text-[#86868b]">
              Requests
            </p>
          </div>

          {loading ? (
            <div className="px-7 py-16 text-center text-sm text-[#86868b]">
              Loading...
            </div>
          ) : requests.length === 0 ? (
            <div className="px-7 py-16 text-center">
              <p className="font-medium">
                No correction requests
              </p>

              <p className="mt-2 text-sm text-[#86868b]">
                Nothing requires review.
              </p>
            </div>
          ) : (
            <div>
              {requests.map((request) => {
                const difference =
                  Number(
                    request.requested_closing_cash
                  ) -
                  Number(
                    request.old_closing_cash
                  );

                return (
                  <article
                    key={request.id}
                    className="border-t border-[#f5f5f7] p-7"
                  >
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full ${statusDot(
                                request.status
                              )}`}
                            />

                            <h2 className="font-semibold">
                              {request.paybot_name}
                            </h2>
                          </div>

                          <p className="mt-2 text-sm text-[#86868b]">
                            {formatDate(
                              request.cash_date
                            )}{" "}
                            · {request.currency}
                          </p>
                        </div>

                        <div className="text-sm text-[#86868b] sm:text-right">
                          <p>
                            {statusLabel(request.status)}
                          </p>

                          <p className="mt-1">
                            {formatDateTime(
                              request.requested_at
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <AmountCard
                          label="Original"
                          value={formatMoney(
                            request.old_closing_cash,
                            request.currency
                          )}
                        />

                        <AmountCard
                          label="Requested"
                          value={formatMoney(
                            request.requested_closing_cash,
                            request.currency
                          )}
                        />

                        <AmountCard
                          label="Change"
                          value={`${difference >= 0 ? "+" : ""}${formatMoney(
                            difference,
                            request.currency
                          )}`}
                          alert={difference < 0}
                        />
                      </div>

                      <div className="rounded-[18px] bg-[#f5f5f7] p-5">
                        <p className="text-sm text-[#86868b]">
                          Reason
                        </p>

                        <p className="mt-2 text-sm leading-6">
                          {request.reason}
                        </p>
                      </div>

                      {request.decision_note && (
                        <div className="rounded-[18px] bg-[#f5f5f7] p-5">
                          <p className="text-sm text-[#86868b]">
                            Management Note
                          </p>

                          <p className="mt-2 text-sm leading-6">
                            {request.decision_note}
                          </p>
                        </div>
                      )}

                      {request.status === "approved" &&
                        request.expires_at && (
                          <p className="text-sm text-[#007aff]">
                            Expires{" "}
                            {formatDateTime(
                              request.expires_at
                            )}
                          </p>
                        )}

                      {request.status === "used" &&
                        request.used_at && (
                          <p className="text-sm text-[#34c759]">
                            Applied{" "}
                            {formatDateTime(
                              request.used_at
                            )}
                          </p>
                        )}

                      {request.status === "pending" && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              openDecision(
                                request,
                                "reject"
                              )
                            }
                            disabled={
                              processingId === request.id
                            }
                            className="rounded-xl px-5 py-3 text-sm font-semibold text-[#ff3b30] hover:bg-[#fff0ef] disabled:opacity-50"
                          >
                            Reject
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openDecision(
                                request,
                                "approve"
                              )
                            }
                            disabled={
                              processingId === request.id
                            }
                            className="rounded-xl bg-[#007aff] px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {decisionRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
            <div className="px-6 py-6">
              <h2 className="text-xl font-semibold">
                {decision === "approve"
                  ? "Approve Correction"
                  : "Reject Correction"}
              </h2>

              <p className="mt-2 text-sm text-[#86868b]">
                {decision === "approve"
                  ? "Authorize this exact correction."
                  : "Record a reason for rejection."}
              </p>
            </div>

            <div className="space-y-5 px-6 pb-6">
              <div className="rounded-[18px] bg-[#f5f5f7] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#86868b]">
                      Current
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatMoney(
                        decisionRequest.old_closing_cash,
                        decisionRequest.currency
                      )}
                    </p>
                  </div>

                  <span className="text-[#86868b]">
                    →
                  </span>

                  <div className="text-right">
                    <p className="text-sm text-[#86868b]">
                      Requested
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatMoney(
                        decisionRequest.requested_closing_cash,
                        decisionRequest.currency
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-[#86868b]">
                  Reason
                </p>

                <p className="mt-2 text-sm leading-6">
                  {decisionRequest.reason}
                </p>
              </div>

              <div>
                <label
                  htmlFor="decision-note"
                  className="text-sm font-medium"
                >
                  Management Note
                  {decision === "reject" && " *"}
                </label>

                <textarea
                  id="decision-note"
                  value={decisionNote}
                  onChange={(event) =>
                    setDecisionNote(
                      event.target.value
                    )
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder={
                    decision === "approve"
                      ? "Optional"
                      : "Reason for rejection"
                  }
                  className="mt-2 w-full resize-none rounded-xl bg-[#f0f0f2] px-4 py-3 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-[#007aff]"
                />

                <p className="mt-1 text-right text-xs text-[#86868b]">
                  {decisionNote.length}/1000
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDecision}
                disabled={!!processingId}
                className="rounded-xl px-5 py-3 text-sm font-medium hover:bg-[#f5f5f7] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submitDecision}
                disabled={!!processingId}
                className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 ${
                  decision === "approve"
                    ? "bg-[#007aff]"
                    : "bg-[#ff3b30]"
                }`}
              >
                {processingId
                  ? "Processing..."
                  : decision === "approve"
                    ? "Approve"
                    : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
      <p className="text-sm text-[#86868b]">
        {label}
      </p>

      <p className="mt-3 text-4xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function AmountCard({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-[18px] bg-[#f5f5f7] p-5">
      <p className="text-sm text-[#86868b]">
        {label}
      </p>

      <p
        className={`mt-3 text-lg font-semibold tabular-nums ${
          alert ? "text-[#ff3b30]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}