import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../../dashboard/logout-button";

export default async function WorkforcePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "management") {
    redirect("/dashboard");
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const fromDate = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const toDate = new Date().toISOString();

  const [
    agentsResult,
    paybotsResult,
  ] = await Promise.all([
    supabase.rpc(
      "get_management_agents_overview",
      {
        p_from: fromDate,
        p_to: toDate,
      }
    ),

    supabase.rpc(
      "get_management_paybots_overview",
      {
        p_from: today,
        p_to: today,
      }
    ),
  ]);

  const agents =
    agentsResult.data ?? [];

  const paybots =
    paybotsResult.data ?? [];

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div>
            <Link
              href="/management"
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Management
            </Link>

            <h1 className="mt-3 text-3xl font-bold">
              Workforce
            </h1>

            <p className="mt-2 text-gray-600">
              Management overview of Agents
              and Paybots.
            </p>
          </div>

          <LogoutButton />

        </div>

        {/* Agents */}
        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">

          <div>
            <h2 className="text-xl font-bold">
              Agents
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Operational performance over
              the last 30 days.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">

            <table className="w-full min-w-[850px] text-left text-sm">

              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-3">
                    Agent
                  </th>

                  <th className="pb-3">
                    Clients
                  </th>

                  <th className="pb-3">
                    Transfers
                  </th>

                  <th className="pb-3">
                    Completed
                  </th>

                  <th className="pb-3">
                    Pending
                  </th>

                  <th className="pb-3">
                    Volume
                  </th>

                  <th className="pb-3">
                    Completion
                  </th>
                </tr>
              </thead>

              <tbody>

                {agents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-gray-500"
                    >
                      No agents found.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr
                      key={agent.agent_id}
                      className="border-b last:border-0"
                    >
                      <td className="py-4 font-medium">
                        {agent.agent_name}
                      </td>

                      <td>
                        {agent.client_count}
                      </td>

                      <td>
                        {agent.transfer_count}
                      </td>

                      <td>
                        {
                          agent.completed_transfer_count
                        }
                      </td>

                      <td>
                        {
                          agent.pending_transfer_count
                        }
                      </td>

                      <td>
                        {Number(
                          agent.total_volume ?? 0
                        ).toLocaleString()}
                      </td>

                      <td>
                        {Number(
                          agent.completion_rate ?? 0
                        ).toFixed(1)}
                        %
                      </td>
                    </tr>
                  ))
                )}

              </tbody>
            </table>

          </div>
        </section>

        {/* Paybots */}
        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">

          <div>
            <h2 className="text-xl font-bold">
              Paybots
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Today&apos;s Paybot activity.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">

            <table className="w-full min-w-[850px] text-left text-sm">

              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-3">
                    Paybot
                  </th>

                  <th className="pb-3">
                    Sessions
                  </th>

                  <th className="pb-3">
                    Open
                  </th>

                  <th className="pb-3">
                    Discrepancies
                  </th>

                  <th className="pb-3">
                    Payout Volume
                  </th>

                  <th className="pb-3">
                    Completed
                  </th>

                  <th className="pb-3">
                    Avg. Delivery
                  </th>
                </tr>
              </thead>

              <tbody>

                {paybots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-gray-500"
                    >
                      No Paybot activity today.
                    </td>
                  </tr>
                ) : (
                  paybots.map((paybot) => (
                    <tr
                      key={paybot.paybot_id}
                      className="border-b last:border-0"
                    >
                      <td className="py-4 font-medium">
                        {paybot.paybot_name}
                      </td>

                      <td>
                        {paybot.session_count}
                      </td>

                      <td>
                        {paybot.open_session_count}
                      </td>

                      <td>
                        {paybot.discrepancy_session_count}
                      </td>

                      <td>
                        {Number(
                          paybot.payout_volume ?? 0
                        ).toLocaleString()}
                      </td>

                      <td>
                        {
                          paybot.completed_transfer_count
                        }
                      </td>

                      <td>
                        {formatSeconds(
                          paybot.average_delivery_seconds
                        )}
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

function formatSeconds(
  seconds: number | null
) {
  if (!seconds) {
    return "—";
  }

  const minutes = Math.round(
    Number(seconds) / 60
  );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  const remainingMinutes =
    minutes % 60;

  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}