import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

type BusinessDay = {
  id: string;
  business_date: string;
  status: "open" | "closing" | "closed" | string;
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

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

  const businessDay: BusinessDay | null =
    Array.isArray(businessDays) && businessDays.length > 0
      ? businessDays[0]
      : null;

  const status = businessDay?.status ?? "closed";
  const isOpen = status === "open";
  const isClosing = status === "closing";

  const statusLabel = isOpen
    ? "Open"
    : isClosing
      ? "Closing"
      : "Closed";

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="flex min-h-screen flex-col bg-white px-6 py-7">
          <div>
            <p className="text-lg font-semibold tracking-[-0.02em]">
              Shine Transfers
            </p>

            <p className="mt-1 text-sm text-[#86868b]">
              Management
            </p>
          </div>

          <nav className="mt-8 space-y-1">
            <Link
              href="/management"
              className="block rounded-xl bg-[#f5f5f7] px-4 py-3 text-sm font-medium text-[#1d1d1f]"
            >
              Overview
            </Link>

            <Link
              href="/management/paybots"
              className="block rounded-xl px-4 py-3 text-sm text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            >
              Paybots
            </Link>

            <Link
              href="/management/workforce"
              className="block rounded-xl px-4 py-3 text-sm text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            >
              Workforce
            </Link>

            <Link
              href="/management/transfers"
              className="block rounded-xl px-4 py-3 text-sm text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            >
              Transfers
            </Link>

            <Link
              href="/management/business-day"
              className="block rounded-xl px-4 py-3 text-sm text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            >
              Business Day
            </Link>
          </nav>

          <div className="mt-auto pt-8">
            <LogoutButton />
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1180px]">
            <header className="mb-8 flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em]">
                Overview
              </h1>

              <p className="text-[#86868b]">
                {profile.full_name}
              </p>
            </header>

            <section className="mb-6 rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-[#86868b]">
                    Business Day
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${
                        isOpen
                          ? "bg-[#34c759]"
                          : isClosing
                            ? "bg-[#ffcc00]"
                            : "bg-[#86868b]"
                      }`}
                    />

                    <h2 className="text-xl font-semibold">
                      {statusLabel}
                    </h2>
                  </div>

                  <p className="mt-2 text-sm text-[#86868b]">
                    {businessDay
                      ? `${isClosing ? "Closing date" : "Operational date"}: ${businessDay.business_date}`
                      : "No active business day"}
                  </p>

                  {isClosing && (
                    <p className="mt-4 max-w-xl text-sm text-[#86868b]">
                      New transfers and cash sessions are blocked.
                    </p>
                  )}
                </div>

                <Link
                  href="/management/business-day"
                  className="rounded-xl bg-[#007aff] px-5 py-3 text-center text-sm font-semibold text-white transition active:scale-[0.98]"
                >
                  Manage
                </Link>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/management/paybots"
                className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
              >
                <p className="text-sm text-[#86868b]">
                  Pending Paybots
                </p>

                <p className="mt-3 text-4xl font-semibold tabular-nums tracking-[-0.03em]">
                  {pendingPaybots ?? 0}
                </p>

                <p className="mt-5 text-sm font-medium text-[#007aff]">
                  Paybot applications
                </p>
              </Link>

              <Link
                href="/management/workforce"
                className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
              >
                <p className="text-sm text-[#86868b]">
                  Workforce
                </p>

                <p className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
                  Agents &amp; Paybots
                </p>

                <p className="mt-5 text-sm font-medium text-[#007aff]">
                  Manage
                </p>
              </Link>

              <Link
                href="/management/transfers"
                className="rounded-[22px] bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
              >
                <p className="text-sm text-[#86868b]">
                  Transfers
                </p>

                <p className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
                  Monitor
                </p>

                <p className="mt-5 text-sm font-medium text-[#007aff]">
                  Open transfers
                </p>
              </Link>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}