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

const DESTINATION_COUNTRIES = [
  { country: "DR Congo", currency: "CDF", flag: "🇨🇩" },
  { country: "Rwanda", currency: "RWF", flag: "🇷🇼" },
  { country: "Uganda", currency: "UGX", flag: "🇺🇬" },
  { country: "Kenya", currency: "KES", flag: "🇰🇪" },
  { country: "Burundi", currency: "BIF", flag: "🇧🇮" },
  { country: "Ethiopia", currency: "ETB", flag: "🇪🇹" },
] as const;

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

  const [exchangeRate, setExchangeRate] = useState<number | null>(
    null
  );
  const [rateId, setRateId] = useState<string | null>(null);

  const [loadingAgents, setLoadingAgents] = useState(true);
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

  useEffect(() => {
    async function loadAgents() {
      setLoadingAgents(true);
      setError("");

      const supabase = createClient();

      const { data, error: rpcError } = await supabase.rpc(
        "get_available_agents"
      );

      if (rpcError) {
        console.error(rpcError);
        setError(rpcError.message);
        setLoadingAgents(false);
        return;
      }

      setAgents(data ?? []);

      if (data && data.length > 0) {
        setAgentId(data[0].id);
      }

      setLoadingAgents(false);
    }

    loadAgents();
  }, []);

  useEffect(() => {
    async function loadRate() {
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

      const today = new Date()
        .toISOString()
        .split("T")[0];

      const { data, error: rpcError } = await supabase.rpc(
        "get_daily_rate",
        {
          p_rate_date: today,
          p_currency_from: sourceCurrency,
          p_currency_to: destinationCurrency,
        }
      );

      if (rpcError) {
        console.error(rpcError);
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
          `No exchange rate is available today for ${sourceCurrency} → ${destinationCurrency}.`
        );
        setLoadingRate(false);
        return;
      }

      setExchangeRate(Number(rate.sell_rate));
      setRateId(rate.id);

      setLoadingRate(false);
    }

    loadRate();
  }, [sourceCurrency, destinationCurrency]);

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

    const supabase = createClient();

    const today = new Date()
      .toISOString()
      .split("T")[0];

    const { data: latestRate, error: rateError } =
      await supabase.rpc("get_daily_rate", {
        p_rate_date: today,
        p_currency_from: sourceCurrency,
        p_currency_to: destinationCurrency,
      });

    if (rateError) {
      setError(rateError.message);
      setSubmitting(false);
      return;
    }

    const rate = latestRate?.[0];

    if (!rate) {
      setError(
        `No exchange rate is available today for ${sourceCurrency} → ${destinationCurrency}.`
      );
      setSubmitting(false);
      return;
    }

    const currentRate = Number(rate.sell_rate);
    const calculatedDestinationAmount =
      numericAmount * currentRate;

    const { data: transfer, error: insertError } =
      await supabase
        .from("transfer_requests")
        .insert({
          client_id: (
            await supabase.auth.getUser()
          ).data.user?.id,
          agent_id: agentId,
          amount: numericAmount,
          source_amount: numericAmount,
          currency: sourceCurrency,
          destination_country: destinationCountry,
          destination_currency: destinationCurrency,
          rate_id: rate.id,
          exchange_rate: currentRate,
          destination_amount: calculatedDestinationAmount,
          recipient_name: recipientName.trim(),
          recipient_phone: recipientPhone.trim() || null,
          status: "requested",
        })
        .select("id")
        .single();

    if (insertError) {
      console.error(insertError);
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

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

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-6"
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium">
                Source Currency
              </label>

              <select
                value={sourceCurrency}
                onChange={(event) =>
                  setSourceCurrency(event.target.value)
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
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

            <div>
              <label className="block text-sm font-medium">
                Destination Country
              </label>

              <select
                value={destinationCountry}
                onChange={(event) =>
                  setDestinationCountry(event.target.value)
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
              >
                {DESTINATION_COUNTRIES.map((destination) => (
                  <option
                    key={destination.country}
                    value={destination.country}
                  >
                    {destination.flag} {destination.country} —{" "}
                    {destination.currency}
                  </option>
                ))}
              </select>
            </div>

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
                placeholder={`Amount in ${sourceCurrency}`}
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

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
                    1 {sourceCurrency} = {exchangeRate}{" "}
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
                </>
              ) : (
                <p className="mt-1 text-sm text-red-600">
                  No rate available.
                </p>
              )}
            </div>

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
                  loadingAgents || agents.length === 0
                }
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
              >
                {loadingAgents ? (
                  <option>Loading agents...</option>
                ) : agents.length === 0 ? (
                  <option>No agents available</option>
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
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

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
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
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