import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

export default async function ManagementDashboardPage() {
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

  if (profileError || !profile || profile.role !== "management") {
    redirect("/dashboard");
  }

  const [{ count: pendingPaybots }, { data: businessDays }] =
    await Promise.all([
      supabase
        .from("paybot_registrations")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),

      supabase.rpc("get_current_business_day"),
    ]);

  const businessDay =
    Array.isArray(businessDays) && businessDays.length > 0
      ? businessDays[0]
      : null;

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Management Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
            </p>
          </div>

          <LogoutButton />
        </div>

        {/* Business Day */}
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Business Day
              </p>

              <div className="mt-2 flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    businessDay ? "bg-green-500" : "bg-gray-400"
                  }`}
                />

                <h2 className="text-xl font-semibold text-gray-900">
                  {businessDay ? "Open" : "Closed"}
                </h2>
              </div>

              <p className="mt-1 text-sm text-gray-500">
                {businessDay
                  ? `Operational date: ${businessDay.business_date}`
                  : "No Business Day is currently open."}
              </p>
            </div>

            <Link
              href="/management/business-day"
              className="rounded-lg bg-black px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Manage Business Day →
            </Link>
          </div>
        </section>

        {/* Management Modules */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Paybots */}
          <Link
            href="/management/paybots"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-sm font-medium text-gray-500">
              Pending Paybots
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {pendingPaybots ?? 0}
            </p>

            <p className="mt-3 text-sm font-medium text-blue-600">
              Manage Paybot applications →
            </p>
          </Link>

          {/* Daily Rates */}
          <Link
            href="/management/rates"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-sm font-medium text-gray-500">
              Exchange Rates
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              Rates
            </p>

            <p className="mt-3 text-sm font-medium text-blue-600">
              Manage daily rates →
            </p>
          </Link>

          {/* Staff */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Staff
            </p>

            <p className="mt-2 text-lg font-semibold text-gray-900">
              Staff Management
            </p>

            <p className="mt-2 text-sm text-gray-600">
              Agent and auditor management will be added here.
            </p>
          </div>

          {/* Transfers */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Transfers
            </p>

            <p className="mt-2 text-lg font-semibold text-gray-900">
              Transfer Management
            </p>

            <p className="mt-2 text-sm text-gray-600">
              Transfer monitoring and management will be added here.
            </p>
          </div>

          {/* Audit */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Audit
            </p>

            <p className="mt-2 text-lg font-semibold text-gray-900">
              Audit &amp; Controls
            </p>

            <p className="mt-2 text-sm text-gray-600">
              Operational audit and control dashboards will be added here.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}