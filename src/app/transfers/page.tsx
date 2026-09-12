import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

type Agent = {
  id: string;
  full_name: string;
};

export default async function TransfersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: transfers, error } = await supabase
    .from("transfer_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
  }

  const agentMap: Record<string, string> = {};

  if (transfers && transfers.length > 0) {
    for (const transfer of transfers) {
      if (!transfer.agent_id) {
        continue;
      }

      const { data: agentData, error: agentError } =
        await supabase.rpc("get_transfer_agent", {
          transfer_id: transfer.id,
        });

      if (agentError) {
        console.error(agentError);
        continue;
      }

      const agent = agentData?.[0] as Agent | undefined;

      if (agent) {
        agentMap[transfer.id] = agent.full_name;
      }
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              My Transfers
            </h1>

            <p className="mt-2 text-gray-600">
              View the transfers you have submitted.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              ← Dashboard
            </Link>

            <Link
              href="/transfers/new"
              className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
            >
              New Transfer
            </Link>
          </div>
        </div>

        {!transfers || transfers.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-600">
              You have not submitted any transfers yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      Recipient
                    </th>

                    <th className="px-6 py-4 text-left">
                      Amount
                    </th>

                    <th className="px-6 py-4 text-left">
                      Agent
                    </th>

                    <th className="px-6 py-4 text-left">
                      Destination
                    </th>

                    <th className="px-6 py-4 text-left">
                      Status
                    </th>

                    <th className="px-6 py-4 text-left">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {transfers.map((transfer) => (
                    <tr
                      key={transfer.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {transfer.recipient_name}
                        </Link>
                      </td>

                      <td className="px-6 py-4">
                        {transfer.amount} {transfer.currency}
                      </td>

                      <td className="px-6 py-4">
                        {agentMap[transfer.id] || "Not assigned"}
                      </td>

                      <td className="px-6 py-4">
                        {transfer.destination_country}
                      </td>

                      <td className="px-6 py-4 capitalize">
                        {transfer.status.replaceAll("_", " ")}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(
                          transfer.created_at
                        ).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
