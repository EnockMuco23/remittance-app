"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { CURRENCIES } from "@/lib/currencies";

type Agent = {
  id: string;
  full_name: string;
};

type BusinessDay = {
  id: string;
  business_date: string;
  status: string;
};

const DESTINATION_COUNTRIES = [
  { country: "DR Congo", currency: "CDF", flag: "🇨🇩" },
  { country: "Rwanda", currency: "RWF", flag: "🇷🇼" },
  { country: "Uganda", currency: "UGX", flag: "🇺🇬" },
  { country: "Kenya", currency: "KES", flag: "🇰🇪" },
  { country: "Burundi", currency: "BIF", flag: "🇧🇮" },
  { country: "Ethiopia", currency: "ETB", flag: "🇪🇹" },
] as const;

function formatBusinessDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
}

export default function NewTransferPage() {
  const router = useRouter();

  const [sourceCurrency, setSourceCurrency] = useState("CAD");
  const [destinationCountry, setDestinationCountry] =
    useState("DR Congo");

  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");

  const [businessDay, setBusinessDay] =
    useState<BusinessDay | null>(null);

  const [exchangeRate, setExchangeRate] =
    useState<number | null>(null);

  const [rateId, setRateId] =
    useState<string | null>(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingRate, setLoadingRate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const selectedDestination = useMemo(
    () =>
      DESTINATION_COUNTRIES.find(
        (item) => item.country === destinationCountry
      ),
    [destinationCountry]
  );

  const destinationCurrency =
    selectedDestination?.currency ?? "CDF";

  const destinationAmount =
    amount && exchangeRate
      ? Number(amount) * exchangeRate
      : 0;

  /*
   * Load the Business Day and available agents when
   * the page opens.
   */
  useEffect(() => {
    async function loadInitialData() {
      setLoadingPage(true);
      setError("");

      const supabase = createClient();

      const [businessDayResult, agentsResult] =
        await Promise.all([
          supabase.rpc("get_current_business_day"),
          supabase.rpc("get_available_agents"),
        ]);

      if (businessDayResult.error) {
        console.error(
          "Business Day error:",
          businessDayResult.error
        );

        setBusinessDay(null);
        setError(businessDayResult.error.message);
        setLoadingPage(false);
        return;
      }

      const currentBusinessDay =
        Array.isArray(businessDayResult.data) &&
        businessDayResult.data.length > 0
          ? businessDayResult.data[0]
          : null;

      setBusinessDay(currentBusinessDay);

      if (!currentBusinessDay) {
        setAgents([]);
        setAgentId("");
        setLoadingPage(false);

        setError(
          "Transfers are currently unavailable because no Business Day is open."
        );

        return;
      }

      if (agentsResult.error) {
        console.error(
          "Available agents error:",
          agentsResult.error
        );

        setError(agentsResult.error.message);
        setLoadingPage(false);
        return;
      }

      const availableAgents = agentsResult.data ?? [];

      setAgents(availableAgents);

      if (availableAgents.length > 0) {
        setAgentId(availableAgents[0].id);
      }

      setLoadingPage(false);
    }

    loadInitialData();
  }, []);

  /*
   * Load the exchange rate for the CURRENT BUSINESS DAY.
   *
   * We intentionally do not use the browser date or UTC date.
   */
  useEffect(() => {
    async function loadRate() {
      if (!businessDay) {
        setExchangeRate(null);
        setRateId(null);
        return;
      }

      if (!sourceCurrency || !destinationCurrency) {
        return;
      }

      if (sourceCurrency === destinationCurrency) {
        setExchangeRate(null);
        setRateId(null);
        return;
      }

      setLoadingRate(true);
      setError("");

      const supabase = createClient();

      const { data, error: rpcError } = await supabase.rpc(
        "get_daily_rate",
        {
          p_rate_date: businessDay.business_date,
          p_currency_from: sourceCurrency,
          p_currency_to: destinationCurrency,
        }
      );

      if (rpcError) {
        console.error(
          "Daily rate error:",
          rpcError
        );

        setExchangeRate(null);
        setRateId(null);
        setError(rpcError.message);
        setLoadingRate(false);
        return;
      }

      const rate = data?.[0];

      if (!rate) {
        setExchangeRate(null);
        setRateId(null);

        setError(
          `No exchange rate is available for ${sourceCurrency} → ${destinationCurrency} on ${formatBusinessDate(
            businessDay.business_date
          )}.`
        );

        setLoadingRate(false);
        return;
      }

      setExchangeRate(Number(rate.sell_rate));
      setRateId(rate.id);

      setLoadingRate(false);
    }

    loadRate();
  }, [
    businessDay,
    sourceCurrency,
    destinationCurrency,
  ]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSubmitting(true);
    setError("");

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setError("Please enter a valid amount.");
      setSubmitting(false);
      return;
    }

    if (!agentId) {
      setError("Please select an agent.");
      setSubmitting(false);
      return;
    }

    if (!recipientName.trim()) {
      setError("Please enter the recipient's name.");
      setSubmitting(false);
      return;
    }

    /*
     * Re-check the Business Day immediately before creating
     * the transfer. This prevents a stale page from creating
     * a transfer after Management has closed the day.
     */
    const supabase = createClient();

    const { data: currentBusinessDays, error: businessDayError } =
      await supabase.rpc("get_current_business_day");

    if (businessDayError) {
      console.error(
        "Business Day check failed:",
        businessDayError
      );

      setError(businessDayError.message);
      setSubmitting(false);
      return;
    }

    const currentBusinessDay =
      Array.isArray(currentBusinessDays) &&
      currentBusinessDays.length > 0
        ? currentBusinessDays[0]
        : null;

    if (!currentBusinessDay) {
      setBusinessDay(null);
      setExchangeRate(null);
      setRateId(null);

      setError(
        "The Business Day is now closed. Transfers cannot be created until a new Business Day is opened."
      );

      setSubmitting(false);
      return;
    }

    /*
     * Get the rate again immediately before insertion.
     * This ensures the transfer uses the current approved
     * Business Day rate rather than a stale rate from the UI.
     */
    const { data: latestRate, error: rateError } =
      await supabase.rpc("get_daily_rate", {
        p_rate_date: currentBusinessDay.business_date,
        p_currency_from: sourceCurrency,
        p_currency_to: destinationCurrency,
      });

    if (rateError) {
      console.error(
        "Daily rate error:",
        rateError
      );

      setError(rateError.message);
      setSubmitting(false);
      return;
    }

    const rate = latestRate?.[0];

    if (!rate) {
      setError(
        `No exchange rate is available for ${sourceCurrency} → ${destinationCurrency} on ${formatBusinessDate(
          currentBusinessDay.business_date
        )}.`
      );

      setSubmitting(false);
      return;
    }

    const currentRate = Number(rate.sell_rate);

    const calculatedDestinationAmount =
      numericAmount * currentRate;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError(
        "Your session has expired. Please log in again."
      );

      setSubmitting(false);
      return;
    }

    const { data: transfer, error: insertError } =
      await supabase
        .from("transfer_requests")
        .insert({
          client_id: user.id,
          agent_id: agentId,
          amount: numericAmount,
          source_amount: numericAmount,
          currency: sourceCurrency,
          destination_country: destinationCountry,
          destination_currency: destinationCurrency,
          rate_id: rate.id,
          exchange_rate: currentRate,
          destination_amount:
            calculatedDestinationAmount,
          recipient_name: recipientName.trim(),
          recipient_phone:
            recipientPhone.trim() || null,
          status: "requested",
        })
        .select("id")
        .single();

    if (insertError) {
      console.error(
        "Transfer creation error:",
        insertError
      );

      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    /*
     * The database trigger automatically attaches the new
     * transfer to the currently open Business Day.
     */
    router.push(`/transfers/${transfer.id}`);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Back to Dashboard
          </Link>

          <h1 className="mt-2 text-2xl font-bold">
            New Transfer
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Create a new remittance transfer.
          </p>
        </div>

        {/* Business Day Status */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Current Business Day
              </p>

              {loadingPage ? (
                <p className="mt-1 font-semibold text-gray-900">
                  Checking...
                </p>
              ) : businessDay ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

                  <p className="font-semibold text-gray-900">
                    {formatBusinessDate(
                      businessDay.business_date
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />

                  <p className="font-semibold text-gray-900">
                    Closed
                  </p>
                </div>
              )}
            </div>

            {businessDay && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                Operational
              </span>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-6"
        >
          <div className="space-y-6">
            {/* Source Currency */}
            <div>
              <label className="block text-sm font-medium">
                Source Currency
              </label>

              <select
                value={sourceCurrency}
                onChange={(event) =>
                  setSourceCurrency(event.target.value)
                }
                disabled={
                  loadingPage ||
                  !businessDay ||
                  submitting
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
              >
                {CURRENCIES.map((currency) => (
                  <option
                    key={currency.code}
                    value={currency.code}
                  >
                    {currency.flag} {currency.code} —{" "}
                    {currency.country}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Country */}
            <div>
              <label className="block text-sm font-medium">
                Destination Country
              </label>

              <select
                value={destinationCountry}
                onChange={(event) =>
                  setDestinationCountry(event.target.value)
                }
                disabled={
                  loadingPage ||
                  !businessDay ||
                  submitting
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
              >
                {DESTINATION_COUNTRIES.map(
                  (destination) => (
                    <option
                      key={destination.country}
                      value={destination.country}
                    >
                      {destination.flag}{" "}
                      {destination.country} —{" "}
                      {destination.currency}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium">
                Amount
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                disabled={
                  loadingPage ||
                  !businessDay ||
                  submitting
                }
                placeholder={`Amount in ${sourceCurrency}`}
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
              />
            </div>

            {/* Exchange Rate */}
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                Exchange Rate
              </p>

              {loadingRate ? (
                <p className="mt-1 font-medium">
                  Loading rate...
                </p>
              ) : exchangeRate ? (
                <>
                  <p className="mt-1 text-lg font-semibold">
                    1 {sourceCurrency} ={" "}
                    {exchangeRate}{" "}
                    {destinationCurrency}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    Destination amount:{" "}
                    <span className="font-medium text-gray-900">
                      {destinationAmount.toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 2,
                        }
                      )}{" "}
                      {destinationCurrency}
                    </span>
                  </p>

                  {businessDay && (
                    <p className="mt-2 text-xs text-gray-400">
                      Rate for{" "}
                      {formatBusinessDate(
                        businessDay.business_date
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-red-600">
                  No rate available.
                </p>
              )}
            </div>

            {/* Agent */}
            <div>
              <label className="block text-sm font-medium">
                Agent
              </label>

              <select
                value={agentId}
                onChange={(event) =>
                  setAgentId(event.target.value)
                }
                disabled={
                  loadingPage ||
                  !businessDay ||
                  submitting ||
                  agents.length === 0
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
              >
                {loadingPage ? (
                  <option>
                    Loading agents...
                  </option>
                ) : agents.length === 0 ? (
                  <option>
                    No agents available
                  </option>
                ) : (
                  agents.map((agent) => (
                    <option
                      key={agent.id}
                      value={agent.id}
                    >
                      {agent.full_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Recipient Name */}
            <div>
              <label className="block text-sm font-medium">
                Recipient Name
              </label>

              <input
                type="text"
                value={recipientName}
                onChange={(event) =>
                  setRecipientName(event.target.value)
                }
                disabled={
                  loadingPage ||
                  !businessDay ||
                  submitting
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
              />
            </div>

            {/* Recipient Phone */}
            <div>
              <label className="block text-sm font-medium">
                Recipient Phone
              </label>

              <input
                type="tel"
                value={recipientPhone}
                onChange={(event) =>
                  setRecipientPhone(event.target.value)
                }
                disabled={
                  loadingPage ||
                  !businessDay ||
                  submitting
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* Closed Business Day */}
            {!loadingPage && !businessDay && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <p className="font-medium text-yellow-900">
                  Transfers are currently unavailable.
                </p>

                <p className="mt-1 text-sm text-yellow-800">
                  There is no open Business Day. Please
                  contact Management before creating a
                  transfer.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loadingPage ||
                submitting ||
                !businessDay ||
                loadingRate ||
                !exchangeRate ||
                !agentId
              }
              className="w-full rounded bg-black px-4 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "Creating Transfer..."
                : "Create Transfer"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
