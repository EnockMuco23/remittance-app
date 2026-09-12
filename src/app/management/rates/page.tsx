import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import DailyRateForm from "./daily-rate-form";
import RatesTable, {
  RateRow,
} from "@/components/rates-table";

export default async function DailyRatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

  if (
    profileError ||
    !profile ||
    !["management", "auditor"].includes(
      profile.role
    )
  ) {
    redirect("/dashboard");
  }

  const { data: rates, error: ratesError } =
    await supabase
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

  const today =
    new Date().toISOString().split("T")[0];

  const todayRates = formattedRates.filter(
    (rate) => rate.rate_date === today
  );

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
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

        {profile.role === "management" && (
          <section className="mt-8 rounded-lg bg-white p-8 shadow">
            <h2 className="text-2xl font-bold">
              Enter Daily Rate
            </h2>

            <p className="mt-1 text-gray-600">
              Enter the approved exchange rate for
              a currency pair.
            </p>

            <div className="mt-6">
              <DailyRateForm />
            </div>
          </section>
        )}

        <section className="mt-8 rounded-lg bg-white p-8 shadow">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Today&apos;s Rates
              </h2>

              <p className="mt-1 text-gray-600">
                Current exchange rates available to
                the system.
              </p>
            </div>

            <div className="w-fit rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
              {todayRates.length}{" "}
              {todayRates.length === 1
                ? "rate"
                : "rates"}
            </div>
          </div>

          <div className="mt-6">
            <RatesTable
              rates={todayRates}
            />
          </div>
        </section>

        <section className="mt-8 rounded-lg bg-white shadow">
          <div className="border-b p-6">
            <h2 className="text-2xl font-bold">
              Rate History
            </h2>

            <p className="mt-1 text-gray-600">
              Historical rates are preserved and
              cannot be edited or deleted.
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