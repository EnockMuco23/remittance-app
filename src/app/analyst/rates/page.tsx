import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import DailyRateForm from "../../management/rates/daily-rate-form";
import RatesTable, {
  RateRow,
} from "@/components/rates-table";

export default async function AnalystRatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "analyst"
  ) {
    redirect("/dashboard");
  }

  const {
    data: rates,
    error: ratesError,
  } = await supabase
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
      "Analyst rates error:",
      ratesError
    );
  }

  const formattedRates: RateRow[] =
    (rates ?? []).map((rate) => ({
      id: rate.id,
      rate_date: rate.rate_date,
      currency_from:
        rate.currency_from,
      currency_to:
        rate.currency_to,
      buy_rate: Number(
        rate.buy_rate
      ),
      sell_rate: Number(
        rate.sell_rate
      ),
      created_at:
        rate.created_at,
    }));

  const today = new Date()
    .toISOString()
    .split("T")[0];

  const todayRates =
    formattedRates.filter(
      (rate) =>
        rate.rate_date === today
    );

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div>
            <Link
              href="/analyst"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Analyst
            </Link>

            <h1 className="mt-3 text-3xl font-bold">
              Daily Rates
            </h1>

            <p className="mt-2 text-gray-600">
              Enter approved exchange rates
              used by the remittance system.
            </p>
          </div>

        </div>

        {/* Rate Entry */}
        <section className="mt-8 rounded-xl bg-white p-8 shadow-sm">

          <h2 className="text-2xl font-bold">
            Enter Daily Rate
          </h2>

          <p className="mt-1 text-gray-600">
            Add the approved currency-pair
            rate for the selected date.
          </p>

          <div className="mt-6">
            <DailyRateForm />
          </div>

        </section>

        {/* Today's Rates */}
        <section className="mt-8 rounded-xl bg-white p-8 shadow-sm">

          <div>
            <h2 className="text-2xl font-bold">
              Today&apos;s Rates
            </h2>

            <p className="mt-1 text-gray-600">
              Current rates available to
              the system.
            </p>
          </div>

          <div className="mt-6">
            <RatesTable
              rates={todayRates}
            />
          </div>

        </section>

        {/* History */}
        <section className="mt-8 rounded-xl bg-white shadow-sm">

          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Rate History
            </h2>

            <p className="mt-1 text-gray-600">
              Historical rates are preserved
              for auditability.
            </p>
          </div>

          <div className="p-6">
            <RatesTable
              rates={formattedRates}
            />
          </div>

        </section>

      </div>
    </main>
  );
}