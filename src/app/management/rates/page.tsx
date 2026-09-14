import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import DailyRateForm from "./daily-rate-form";
import RatesTable, {
  RateRow,
} from "@/components/rates-table";

function formatRateDate(date: string) {
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

export default async function DailyRatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["management", "auditor"].includes(profile.role)
  ) {
    redirect("/dashboard");
  }

  /*
   * Business Day is the source of truth for the
   * current operational date.
   */
  const { data: businessDays, error: businessDayError } =
    await supabase.rpc("get_current_business_day");

  if (businessDayError) {
    console.error(
      "Business Day error:",
      businessDayError
    );
  }

  const businessDay =
    Array.isArray(businessDays) && businessDays.length > 0
      ? businessDays[0]
      : null;

  const businessDate = businessDay?.business_date ?? null;

  const { data: rates, error: ratesError } = await supabase
    .from("daily_rates")
    .select(
      `
        id,
        rate_date,
        currency_from,
        currency_to,
        buy_rate,
        sell_rate,
        entered_by,
        created_at
      `
    )
    .order("rate_date", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    });

  if (ratesError) {
    console.error(
      "Daily rates error:",
      ratesError
    );
  }

  const formattedRates: RateRow[] =
    (rates ?? []).map((rate) => ({
      id: rate.id,
      rate_date: rate.rate_date,
      currency_from: rate.currency_from,
      currency_to: rate.currency_to,
      buy_rate: Number(rate.buy_rate),
      sell_rate: Number(rate.sell_rate),
      created_at: rate.created_at,
    }));

  /*
   * Rates for the currently open Business Day.
   */
  const currentBusinessDayRates = businessDate
    ? formattedRates.filter(
        (rate) => rate.rate_date === businessDate
      )
    : [];

  /*
   * Group historical rates by date.
   *
   * Map preserves the order in which dates appear,
   * which is already newest → oldest because the
   * database query is ordered by rate_date descending.
   */
  const ratesByDate = new Map<string, RateRow[]>();

  for (const rate of formattedRates) {
    const existing = ratesByDate.get(rate.rate_date);

    if (existing) {
      existing.push(rate);
    } else {
      ratesByDate.set(rate.rate_date, [rate]);
    }
  }

  const groupedRateHistory = Array.from(
    ratesByDate.entries()
  );

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Daily Rates
            </h1>

            <p className="mt-2 text-gray-600">
              Manage the exchange rates used by the
              remittance system.
            </p>
          </div>

          <Link
            href="/management"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Management
          </Link>
        </div>

        {/* Business Day Status */}
        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Current Business Day
              </p>

              {businessDay ? (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-green-500" />

                    <p className="text-xl font-semibold text-gray-900">
                      {businessDate}
                    </p>
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    Rates entered on this page must belong to
                    this Business Day.
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-gray-400" />

                    <p className="text-xl font-semibold text-gray-900">
                      No Business Day Open
                    </p>
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    Open a Business Day before entering new
                    exchange rates.
                  </p>
                </>
              )}
            </div>

            <Link
              href="/management/business-day"
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-center text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Manage Business Day →
            </Link>
          </div>
        </section>

        {/* Enter Rate */}
        {profile.role === "management" && (
          <section className="mt-8 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">
              Enter Daily Rate
            </h2>

            <p className="mt-1 text-gray-600">
              Enter the approved exchange rate for a
              currency pair.
            </p>

            {!businessDay ? (
              <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <p className="font-medium text-yellow-900">
                  Business Day is closed
                </p>

                <p className="mt-1 text-sm text-yellow-800">
                  You cannot enter a new rate until Management
                  opens a Business Day.
                </p>

                <Link
                  href="/management/business-day"
                  className="mt-3 inline-block text-sm font-semibold text-yellow-900 underline"
                >
                  Open Business Day →
                </Link>
              </div>
            ) : (
              <div className="mt-6">
                <DailyRateForm />
              </div>
            )}
          </section>
        )}

        {/* Current Business Day Rates */}
        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Current Business Day Rates
              </h2>

              <p className="mt-1 text-gray-600">
                Exchange rates assigned to the currently
                open Business Day.
              </p>
            </div>

            <div className="w-fit rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
              {currentBusinessDayRates.length}{" "}
              {currentBusinessDayRates.length === 1
                ? "rate"
                : "rates"}
            </div>
          </div>

          <div className="mt-6">
            {businessDay ? (
              <RatesTable
                rates={currentBusinessDayRates}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
                <p className="font-medium text-gray-900">
                  No Business Day is currently open.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Current operational rates will appear here
                  once a Business Day is opened.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Rate History */}
        <section className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Rate History
            </h2>

            <p className="mt-1 text-gray-600">
              Historical rates are grouped by Business Day.
              Click a date to view its rates.
            </p>
          </div>

          {groupedRateHistory.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-gray-900">
                No rate history available.
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Historical rates will appear here once rates
                have been entered.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {groupedRateHistory.map(
                ([date, dateRates]) => (
                  <details
                    key={date}
                    className="group"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 transition hover:bg-gray-50">
                      <div className="flex items-center gap-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition group-open:bg-gray-900 group-open:text-white">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4 transition-transform group-open:rotate-90"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.21 14.77a.75.75 0 0 1-.02-1.06L10.17 10 7.19 6.29a.75.75 0 1 1 1.16-.96l3.5 4.25a.75.75 0 0 1 0 .96l-3.5 4.25a.75.75 0 0 1-1.14-.02Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>

                        <div>
                          <p className="font-semibold text-gray-900">
                            {formatRateDate(date)}
                          </p>

                          <p className="mt-0.5 text-sm text-gray-500">
                            {dateRates.length}{" "}
                            {dateRates.length === 1
                              ? "rate"
                              : "rates"}
                          </p>
                        </div>
                      </div>

                      <span className="hidden text-sm text-gray-400 sm:block">
                        Click to view rates
                      </span>
                    </summary>

                    <div className="border-t border-gray-100 bg-gray-50 p-6">
                      <RatesTable
                        rates={dateRates}
                      />
                    </div>
                  </details>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
