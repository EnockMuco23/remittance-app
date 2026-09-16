import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

export default async function AnalystDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (
    error ||
    !profile ||
    profile.role !== "analyst"
  ) {
    redirect("/dashboard");
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const { data: todayRates } =
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
          created_at
        `
      )
      .eq("rate_date", today)
      .order("created_at", {
        ascending: false,
      });

  const { count: totalRates } =
    await supabase
      .from("daily_rates")
      .select("*", {
        count: "exact",
        head: true,
      });

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div>
            <p className="text-sm font-medium text-gray-500">
              Analysis & Pricing
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Analyst Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
              Manage approved exchange rates
              and review rate history.
            </p>
          </div>

          <LogoutButton />

        </div>

        {/* Overview Cards */}
        <section className="mt-8 grid gap-5 md:grid-cols-3">

          <Link
            href="/analyst/rates"
            className="rounded-xl bg-black p-6 text-white shadow-sm transition hover:bg-gray-800"
          >
            <p className="text-sm text-gray-300">
              Daily Rates
            </p>

            <p className="mt-2 text-2xl font-bold">
              Manage Rates
            </p>

            <p className="mt-2 text-sm text-gray-300">
              Enter and review current rates →
            </p>
          </Link>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Today&apos;s Rates
            </p>

            <p className="mt-2 text-3xl font-bold">
              {todayRates?.length ?? 0}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Currency pairs configured today
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Rate Records
            </p>

            <p className="mt-2 text-3xl font-bold">
              {totalRates ?? 0}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Historical rate records
            </p>
          </div>

        </section>

        {/* Today's Rates */}
        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">

          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">

            <div>
              <h2 className="text-xl font-bold">
                Today&apos;s Rates
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Current rates available to the
                remittance system.
              </p>
            </div>

            <Link
              href="/analyst/rates"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Manage Rates →
            </Link>

          </div>

          <div className="mt-6 overflow-x-auto">

            <table className="w-full min-w-[650px] text-left text-sm">

              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-3">
                    Currency Pair
                  </th>

                  <th className="pb-3">
                    Buy Rate
                  </th>

                  <th className="pb-3">
                    Sell Rate
                  </th>

                  <th className="pb-3">
                    Entered
                  </th>
                </tr>
              </thead>

              <tbody>

                {!todayRates ||
                todayRates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-gray-500"
                    >
                      No rates have been
                      entered today.
                    </td>
                  </tr>
                ) : (
                  todayRates.map((rate) => (
                    <tr
                      key={rate.id}
                      className="border-b last:border-0"
                    >
                      <td className="py-4 font-medium">
                        {rate.currency_from}
                        {" → "}
                        {rate.currency_to}
                      </td>

                      <td>
                        {Number(
                          rate.buy_rate
                        ).toLocaleString()}
                      </td>

                      <td>
                        {Number(
                          rate.sell_rate
                        ).toLocaleString()}
                      </td>

                      <td className="text-gray-500">
                        {new Date(
                          rate.created_at
                        ).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}

              </tbody>
            </table>

          </div>
        </section>

      </div>
    </main>
  );
}