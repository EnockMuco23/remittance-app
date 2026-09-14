"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { CURRENCIES } from "@/lib/currencies";

type BusinessDay = {
  id: string;
  business_date: string;
  status: string;
};

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

export default function DailyRateForm() {
  const router = useRouter();

  const [businessDay, setBusinessDay] =
    useState<BusinessDay | null>(null);

  const [currencyFrom, setCurrencyFrom] =
    useState("USD");

  const [currencyTo, setCurrencyTo] =
    useState("CDF");

  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");

  const [loadingBusinessDay, setLoadingBusinessDay] =
    useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadBusinessDay() {
      setLoadingBusinessDay(true);
      setError("");

      const supabase = createClient();

      const { data, error: rpcError } =
        await supabase.rpc("get_current_business_day");

      if (rpcError) {
        console.error(
          "Failed to load Business Day:",
          rpcError
        );

        setBusinessDay(null);
        setError(rpcError.message);
        setLoadingBusinessDay(false);
        return;
      }

      const currentBusinessDay =
        Array.isArray(data) && data.length > 0
          ? data[0]
          : null;

      setBusinessDay(currentBusinessDay);
      setLoadingBusinessDay(false);
    }

    loadBusinessDay();
  }, []);

  async function submitRate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    if (!businessDay) {
      setError(
        "There is no open Business Day. Open a Business Day before entering exchange rates."
      );
      setLoading(false);
      return;
    }

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

    /*
     * Re-check the Business Day immediately before
     * inserting the rate.
     *
     * This prevents a stale page from entering a rate
     * after Management has closed the Business Day.
     */
    const {
      data: currentBusinessDays,
      error: businessDayError,
    } = await supabase.rpc("get_current_business_day");

    if (businessDayError) {
      console.error(
        "Business Day check failed:",
        businessDayError
      );

      setError(businessDayError.message);
      setLoading(false);
      return;
    }

    const currentBusinessDay =
      Array.isArray(currentBusinessDays) &&
      currentBusinessDays.length > 0
        ? currentBusinessDays[0]
        : null;

    if (!currentBusinessDay) {
      setBusinessDay(null);

      setError(
        "The Business Day is now closed. A new Business Day must be opened before entering rates."
      );

      setLoading(false);
      return;
    }

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
          /*
           * The rate date comes ONLY from the current
           * Business Day. There is no user-selectable date.
           */
          rate_date:
            currentBusinessDay.business_date,
          currency_from: currencyFrom,
          currency_to: currencyTo,
          buy_rate: buy,
          sell_rate: sell,
          entered_by: user.id,
        });

    if (insertError) {
      if (insertError.code === "23505") {
        setError(
          "A rate for this currency pair already exists for this Business Day."
        );
      } else {
        setError(insertError.message);
      }

      setLoading(false);
      return;
    }

    setSuccess(
      `${currencyFrom} → ${currencyTo} rate saved successfully for ${formatBusinessDate(
        currentBusinessDay.business_date
      )}.`
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
      {/* Business Day */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm font-medium text-gray-500">
          Rate Date
        </p>

        {loadingBusinessDay ? (
          <p className="mt-1 font-semibold text-gray-900">
            Checking Business Day...
          </p>
        ) : businessDay ? (
          <>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

              <p className="font-semibold text-gray-900">
                {formatBusinessDate(
                  businessDay.business_date
                )}
              </p>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Automatically determined by the current
              Business Day.
            </p>
          </>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />

              <p className="font-semibold text-gray-900">
                No Business Day is open
              </p>
            </div>

            <p className="mt-2 text-sm text-red-600">
              Open a Business Day before entering a new
              exchange rate.
            </p>
          </>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* From Currency */}
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
            disabled={
              loading ||
              loadingBusinessDay ||
              !businessDay
            }
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
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

        {/* To Currency */}
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
            disabled={
              loading ||
              loadingBusinessDay ||
              !businessDay
            }
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
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

        {/* Buy Rate */}
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
            disabled={
              loading ||
              loadingBusinessDay ||
              !businessDay
            }
            placeholder="2850"
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>

        {/* Sell Rate */}
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
            disabled={
              loading ||
              loadingBusinessDay ||
              !businessDay
            }
            placeholder="2900"
            required
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          Rates are automatically assigned to the
          current Business Day. The rate date cannot be
          manually changed.
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
        disabled={
          loading ||
          loadingBusinessDay ||
          !businessDay
        }
        className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading
          ? "Saving..."
          : "Save Daily Rate"}
      </button>
    </form>
  );
}