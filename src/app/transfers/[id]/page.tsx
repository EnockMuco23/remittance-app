import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

type TransferDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Agent = {
  id: string;
  full_name: string;
};

export default async function TransferDetailsPage({
  params,
}: TransferDetailsPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: transfer, error } = await supabase
    .from("transfer_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !transfer) {
    notFound();
  }

  const { data: agentData, error: agentError } = await supabase.rpc(
    "get_transfer_agent",
    {
      transfer_id: id,
    }
  );

  if (agentError) {
    console.error(agentError);
  }

  const agent = agentData?.[0] as Agent | undefined;

  const { data: events } = await supabase
    .from("transaction_events")
    .select("*")
    .eq("transaction_id", id)
    .order("created_at", { ascending: true });

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/transfers"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to My Transfers
        </Link>

        <div className="mt-6 rounded-lg bg-white p-8 shadow">
          <h1 className="text-3xl font-bold">Transfer Details</h1>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">Recipient</p>
              <p className="mt-1 font-medium">
                {transfer.recipient_name}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Recipient Phone</p>
              <p className="mt-1 font-medium">
                {transfer.recipient_phone || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Amount</p>
              <p className="mt-1 font-medium">
                {transfer.amount} {transfer.currency}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Destination</p>
              <p className="mt-1 font-medium">
                {transfer.destination_country}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Assigned Agent</p>
              <p className="mt-1 font-medium">
                {agent?.full_name || "Not assigned"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="mt-1 font-medium capitalize">
                {transfer.status.replaceAll("_", " ")}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Submitted</p>
              <p className="mt-1 font-medium">
                {new Date(transfer.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-white p-8 shadow">
          <h2 className="text-2xl font-bold">Transaction Timeline</h2>

          {!events || events.length === 0 ? (
            <p className="mt-6 text-gray-500">
              No transaction events have been recorded yet.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-l-2 border-gray-300 pl-5"
                >
                  <p className="font-medium capitalize">
                    {event.event_type.replaceAll("_", " ")}
                  </p>

                  {event.notes && (
                    <p className="mt-1 text-sm text-gray-600">
                      {event.notes}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}