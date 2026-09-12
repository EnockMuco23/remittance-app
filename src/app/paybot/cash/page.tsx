"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { CURRENCIES } from "@/lib/currencies";

type Session = {
  id: string;
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

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PaybotCashPage() {
  const supabase = createClient();

  const [currency, setCurrency] = useState("CDF");
  const [session, setSession] = useState<Session | null>(null);

  const [openingCash, setOpeningCash] = useState("");
  const [floatAmount, setFloatAmount] = useState("");
  const [floatNotes, setFloatNotes] = useState("");
  const [closingCash, setClosingCash] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const selectedCurrency = useMemo(
    () => CURRENCIES.find((item) => item.code === currency),
    [currency]
  );

  async function loadSession() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc(
      "get_paybot_cash_session",
      {
        p_cash_date: today,
        p_currency: currency,
      }
    );

    if (error) {
      setError(error.message);
      setSession(null);
    } else {
      setSession(data?.[0] || null);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadSession();
  }, [currency]);

  async function openSession(e: React.FormEvent) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    const amount = Number(openingCash);

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid opening cash amount.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc(
      "open_paybot_cash_session",
      {
        p_cash_date: today,
        p_currency: currency,
        p_opening_cash: amount,
      }
    );

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setOpeningCash("");
    setMessage("Cash session opened.");

    await loadSession();

    setSaving(false);
  }

  async function addNewFloat(e: React.FormEvent) {
    e.preventDefault();

    if (!session) return;

    setSaving(true);
    setError("");
    setMessage("");

    const amount = Number(floatAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid new float amount.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc(
      "add_paybot_cash_receipt",
      {
        p_session_id: session.id,
        p_amount: amount,
        p_notes: floatNotes || null,
      }
    );

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setFloatAmount("");
    setFloatNotes("");
    setMessage("New float recorded.");

    await loadSession();

    setSaving(false);
  }

  async function closeSession(e: React.FormEvent) {
    e.preventDefault();

    if (!session) return;

    setSaving(true);
    setError("");
    setMessage("");

    const amount = Number(closingCash);

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid closing cash amount.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc(
      "close_paybot_cash_session",
      {
        p_session_id: session.id,
        p_closing_cash: amount,
      }
    );

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    const result = data?.[0];

    setMessage(
      `Cash session closed. Discrepancy: ${formatMoney(
        result?.discrepancy
      )} ${currency}`
    );

    await loadSession();

    setSaving(false);
  }

  const discrepancy = Number(session?.discrepancy || 0);

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/paybot"
            className="text-xl font-bold text-gray-900"
          >
            Remittance App
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/paybot"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Dashboard
            </Link>

            <Link
              href="/paybot/cash"
              className="text-sm font-medium text-gray-900"
            >
              Daily Cash
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Daily Cash
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            {today}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {message}
          </div>
        )}

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <label className="block text-sm font-medium text-gray-700">
            Currency
          </label>

          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={!!session}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.flag} {item.code} — {item.country}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Loading cash session...
          </div>
        ) : !session ? (
          <form
            onSubmit={openSession}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Open Cash Session
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Enter the physical cash available at the beginning of
              the day.
            </p>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700">
                Opening Cash ({currency})
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
                required
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-400"
            >
              {saving ? "Opening..." : "Open Cash Session"}
            </button>
          </form>
        ) : (
          <div className="space-y-6">

            {/* ================================================== */}
            {/* CASH SUMMARY */}
            {/* ================================================== */}

            <div className="grid gap-4 md:grid-cols-4">

              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-500">
                  Opening Cash
                </p>

                <p className="mt-2 text-xl font-bold text-gray-900">
                  {formatMoney(session.opening_cash)}
                </p>

                <p className="text-xs text-gray-500">
                  {currency}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-500">
                  New Float
                </p>

                <p className="mt-2 text-xl font-bold text-gray-900">
                  {formatMoney(session.new_float)}
                </p>

                <p className="text-xs text-gray-500">
                  {currency}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-500">
                  Payouts
                </p>

                <p className="mt-2 text-xl font-bold text-gray-900">
                  {formatMoney(session.payouts)}
                </p>

                <p className="text-xs text-gray-500">
                  {currency}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-sm text-gray-500">
                  Expected Closing
                </p>

                <p className="mt-2 text-xl font-bold text-gray-900">
                  {formatMoney(session.expected_closing)}
                </p>

                <p className="text-xs text-gray-500">
                  {currency}
                </p>
              </div>

            </div>

            {!session.closed_at && (
              <>

                {/* ================================================== */}
                {/* NEW FLOAT */}
                {/* ================================================== */}

                <form
                  onSubmit={addNewFloat}
                  className="rounded-lg border border-gray-200 bg-white p-6"
                >
                  <h2 className="text-lg font-semibold text-gray-900">
                    Record New Float
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Record additional physical cash provided to the
                    Paybot during the day.
                  </p>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        New Float ({currency})
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={floatAmount}
                        onChange={(e) =>
                          setFloatAmount(e.target.value)
                        }
                        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Notes
                      </label>

                      <input
                        type="text"
                        value={floatNotes}
                        onChange={(e) =>
                          setFloatNotes(e.target.value)
                        }
                        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
                        placeholder="Optional"
                      />
                    </div>

                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="mt-5 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-400"
                  >
                    {saving
                      ? "Saving..."
                      : "Record New Float"}
                  </button>
                </form>

                {/* ================================================== */}
                {/* CLOSE SESSION */}
                {/* ================================================== */}

                <form
                  onSubmit={closeSession}
                  className="rounded-lg border border-gray-200 bg-white p-6"
                >
                  <h2 className="text-lg font-semibold text-gray-900">
                    Close Cash Session
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Count your physical cash and enter the actual
                    amount you have.
                  </p>

                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700">
                      Actual Closing Cash ({currency})
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={closingCash}
                      onChange={(e) =>
                        setClosingCash(e.target.value)
                      }
                      className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="mt-5 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-400"
                  >
                    {saving
                      ? "Closing..."
                      : "Close Cash Session"}
                  </button>
                </form>

              </>
            )}

            {/* ================================================== */}
            {/* RECONCILIATION */}
            {/* ================================================== */}

            {session.closed_at && (
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Cash Reconciliation
                </h2>

                <div className="mt-6 grid gap-4 md:grid-cols-3">

                  <div>
                    <p className="text-sm text-gray-500">
                      Expected
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {formatMoney(
                        session.expected_closing
                      )}{" "}
                      {currency}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">
                      Actual
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {formatMoney(
                        session.closing_cash
                      )}{" "}
                      {currency}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">
                      Discrepancy
                    </p>

                    <p
                      className={`mt-1 text-xl font-bold ${
                        discrepancy === 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {discrepancy > 0 ? "+" : ""}
                      {formatMoney(discrepancy)}{" "}
                      {currency}
                    </p>
                  </div>

                </div>

                <div
                  className={`mt-6 rounded-md p-4 text-sm ${
                    discrepancy === 0
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {discrepancy === 0
                    ? "Cash reconciled successfully. No discrepancy."
                    : discrepancy > 0
                    ? "There is an excess cash balance."
                    : "There is a cash shortage that requires investigation."}
                </div>

              </div>
            )}

            <div className="text-sm text-gray-500">
              {selectedCurrency?.flag}{" "}
              {selectedCurrency?.country}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}