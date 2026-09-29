import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../../dashboard/logout-button";
import ApprovePaybotButton from "./approve-paybot-button";

export default async function ManagementPaybotsPage() {
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

  const { data: registrations, error } = await supabase
    .from("paybot_registrations")
    .select(
      "id, full_name, email, requested_countries, status, created_at"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Paybot registrations error:", error);
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">
              Paybots
            </h1>

            <p className="mt-2 text-[#86868b]">
              Pending applications
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/management"
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
            >
              Management
            </Link>

            <LogoutButton />
          </div>
        </header>

        <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <div className="px-7 py-6">
            <p className="text-sm text-[#86868b]">
              Pending Applications
            </p>

            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {registrations?.length ?? 0}
            </p>
          </div>

          {!registrations || registrations.length === 0 ? (
            <div className="px-7 py-16 text-center">
              <p className="font-medium">
                No pending applications
              </p>

              <p className="mt-2 text-sm text-[#86868b]">
                New Paybot applications will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="bg-[#f5f5f7] text-xs text-[#86868b]">
                    <th className="px-7 py-4 font-medium">
                      Name
                    </th>

                    <th className="px-7 py-4 font-medium">
                      Email
                    </th>

                    <th className="px-7 py-4 font-medium">
                      Countries
                    </th>

                    <th className="px-7 py-4 font-medium">
                      Date
                    </th>

                    <th className="px-7 py-4 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {registrations.map((registration) => (
                    <tr
                      key={registration.id}
                      className="transition hover:bg-[#fafafa]"
                    >
                      <td className="px-7 py-5 font-medium">
                        {registration.full_name}
                      </td>

                      <td className="px-7 py-5 text-sm text-[#86868b]">
                        {registration.email}
                      </td>

                      <td className="px-7 py-5 text-sm">
                        {registration.requested_countries.join(", ")}
                      </td>

                      <td className="px-7 py-5 text-sm text-[#86868b]">
                        {new Date(
                          registration.created_at
                        ).toLocaleDateString()}
                      </td>

                      <td className="px-7 py-5">
                        <ApprovePaybotButton
                          registrationId={registration.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}