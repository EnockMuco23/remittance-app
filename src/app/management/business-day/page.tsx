"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type BusinessDay = {
  id: string;
  business_date: string;
  status: string;
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatBusinessDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

export default function BusinessDayPage() {
  const supabase = createClient();

  const [businessDay, setBusinessDay] = useState<BusinessDay | null>(null);
  const [businessDate, setBusinessDate] = useState(getLocalDate());

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadBusinessDay() {
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "get_current_business_day"
    );

    if (rpcError) {
      console.error("Failed to load Business Day:", rpcError);

      setBusinessDay(null);
      setError(rpcError.message);
      setLoading(false);

      return;
    }

    const currentBusinessDay =
      Array.isArray(data) && data.length > 0 ? data[0] : null;

    setBusinessDay(currentBusinessDay);
    setLoading(false);
  }

  useEffect(() => {
    loadBusinessDay();
  }, []);

  async function handleOpenBusinessDay() {
    if (!businessDate) {
      setError("Please select a business date.");
      return;
    }

    setProcessing(true);
    setError("");
    setMessage("");

    const { error: rpcError } = await supabase.rpc("open_business_day", {
      p_business_date: businessDate,
    });

    if (rpcError) {
      console.error("Failed to open Business Day:", rpcError);

      setError(rpcError.message);
      setProcessing(false);

      return;
    }

    setMessage(
      `Business Day opened for ${formatBusinessDate(businessDate)}.`
    );

    await loadBusinessDay();

    setProcessing(false);
  }

  async function handleCloseBusinessDay() {
    const confirmed = window.confirm(
      "Are you sure you want to close the current Business Day?"
    );

    if (!confirmed) {
      return;
    }

    setProcessing(true);
    setError("");
    setMessage("");

    const { error: rpcError } = await supabase.rpc("close_business_day");

    if (rpcError) {
      console.error("Failed to close Business Day:", rpcError);

      setError(rpcError.message);
      setProcessing(false);

      return;
    }

    setMessage("Business Day closed successfully.");

    await loadBusinessDay();

    setProcessing(false);
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/management"
            className="text-sm font-medium text-gray-500 transition hover:text-gray-900"
          >
            ← Back to Management
          </Link>

          <div className="mt-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Business Day
            </h1>

            <p className="mt-2 text-gray-600">
              Control the operational day for transfers, exchange rates, and
              Paybot cash operations.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {/* Success */}
        {message && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">{message}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Current Business Day */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Current Operational Status
                </p>

                {loading ? (
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    Loading...
                  </p>
                ) : (
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {businessDay ? "OPEN" : "CLOSED"}
                  </p>
                )}
              </div>

              {!loading && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    businessDay
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {businessDay ? "Operational" : "Not Operational"}
                </span>
              )}
            </div>

            {loading ? (
              <div className="mt-6 rounded-lg bg-gray-50 p-5">
                <p className="text-sm text-gray-500">
                  Checking the current Business Day...
                </p>
              </div>
            ) : businessDay ? (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Business Date
                    </p>

                    <p className="mt-1 font-semibold text-gray-900">
                      {formatBusinessDate(businessDay.business_date)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Opened At
                    </p>

                    <p className="mt-1 font-semibold text-gray-900">
                      {formatDateTime(businessDay.opened_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    Business Day is currently open
                  </p>

                  <p className="mt-1 text-sm text-blue-700">
                    Transfers, daily rates, and Paybot cash operations can
                    operate against this Business Day.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCloseBusinessDay}
                    disabled={processing}
                    className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {processing ? "Closing..." : "Close Business Day"}
                  </button>

                  <button
                    type="button"
                    onClick={loadBusinessDay}
                    disabled={processing || loading}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5">
                  <p className="font-medium text-gray-900">
                    No Business Day is currently open.
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    The operational system is currently closed. Management
                    must open a Business Day before transfers, new rates, and
                    Paybot cash operations can proceed.
                  </p>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={loadBusinessDay}
                    disabled={processing || loading}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Open Business Day */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Open Business Day
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Select the date for the operational day.
            </p>

            <label
              htmlFor="business-date"
              className="mt-6 block text-sm font-medium text-gray-700"
            >
              Business Date
            </label>

            <input
              id="business-date"
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
              disabled={!!businessDay || processing}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
            />

            <button
              type="button"
              onClick={handleOpenBusinessDay}
              disabled={!!businessDay || processing || !businessDate}
              className="mt-4 w-full rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {processing ? "Opening..." : "Open Business Day"}
            </button>

            <div className="mt-6 rounded-lg bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">
                Operational controls
              </p>

              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
                <li>Only one Business Day can be open at a time.</li>
                <li>New transfers are attached to the open Business Day.</li>
                <li>Daily rates must belong to the open Business Day.</li>
                <li>Paybot cash activity is tied to the open Business Day.</li>
                <li>Closing is blocked while operational work remains open.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}