"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { CURRENCIES } from "@/lib/currencies";

export default function DailyRateForm() {
  const router = useRouter();

  const [rateDate, setRateDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [currencyFrom, setCurrencyFrom] =
    useState("USD");

  const [currencyTo, setCurrencyTo] =
    useState("CDF");

  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submitRate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    if (currencyFrom === currencyTo) {
      setError(
        "The two currencies must be different."
      );
      setLoading(false);
      return;
    }

    const buy = Number(buyRate);
    const sell = Number(sellRate);

    if (
      !Number.isFinite(buy) ||
      !Number.isFinite(sell) ||
      buy <= 0 ||
      sell <= 0
    ) {
      setError(
        "Buy and sell rates must be greater than zero."
      );
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    const { error: insertError } =
      await supabase
        .from("daily_rates")
        .insert({
          rate_date: rateDate,
          currency_from: currencyFrom,
          currency_to: currencyTo,
          buy_rate: buy,
          sell_rate: sell,
          entered_by: user.id,
        });

    if (insertError) {
      if (insertError.code === "23505") {
        setError(
          "A rate for this currency pair already exists for this date."
        );
      } else {
        setError(insertError.message);
      }

      setLoading(false);
      return;
    }

    setSuccess(
      `${currencyFrom} → ${currencyTo} rate saved successfully.`
    );

    setBuyRate("");
    setSellRate("");
    setLoading(false);

    router.refresh();
  }

  return (
    <form
      onSubmit={submitRate}
      className="space-y-6"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="rate-date"
            className="block text-sm font-medium text-gray-700"
          >
            Rate Date
          </label>

          <input
            id="rate-date"
            type="date"
            value={rateDate}
            onChange={(event) =>
              setRateDate(event.target.value)
            }
            disabled={loading}
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="currency-from"
            className="block text-sm font-medium text-gray-700"
          >
            From Currency
          </label>

          <select
            id="currency-from"
            value={currencyFrom}
            onChange={(event) =>
              setCurrencyFrom(event.target.value)
            }
            disabled={loading}
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
          >
            {CURRENCIES.map((currency) => (
              <option
                key={currency.code}
                value={currency.code}
              >
                {currency.flag} {currency.country} (
                {currency.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="currency-to"
            className="block text-sm font-medium text-gray-700"
          >
            To Currency
          </label>

          <select
            id="currency-to"
            value={currencyTo}
            onChange={(event) =>
              setCurrencyTo(event.target.value)
            }
            disabled={loading}
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
          >
            {CURRENCIES.map((currency) => (
              <option
                key={currency.code}
                value={currency.code}
              >
                {currency.flag} {currency.country} (
                {currency.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="buy-rate"
            className="block text-sm font-medium text-gray-700"
          >
            Buy Rate
          </label>

          <input
            id="buy-rate"
            type="number"
            step="0.00000001"
            min="0"
            value={buyRate}
            onChange={(event) =>
              setBuyRate(event.target.value)
            }
            disabled={loading}
            placeholder="2850"
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="sell-rate"
            className="block text-sm font-medium text-gray-700"
          >
            Sell Rate
          </label>

          <input
            id="sell-rate"
            type="number"
            step="0.00000001"
            min="0"
            value={sellRate}
            onChange={(event) =>
              setSellRate(event.target.value)
            }
            disabled={loading}
            placeholder="2900"
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          One currency pair can only have one rate
          for each date.
        </p>
      </div>

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            {success}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {error}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading
          ? "Saving..."
          : "Save Daily Rate"}
      </button>
    </form>
  );
}