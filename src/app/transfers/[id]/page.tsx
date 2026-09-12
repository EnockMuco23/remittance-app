import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import UploadEvidence from "./upload-evidence";
import SendToPaybotButton from "./send-to-paybot-button";
import ApproveTransferButton from "./approve-button";
import ConfirmPaymentButton from "./confirm-payment-button";

export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  const { data: transfer, error: transferError } = await supabase
    .from("transfer_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (transferError || !transfer) {
    notFound();
  }

  const isClient =
    profile.role === "client" &&
    transfer.client_id === user.id;

  const isAgent =
    profile.role === "agent" &&
    transfer.agent_id === user.id;

  if (!isClient && !isAgent) {
    redirect("/dashboard");
  }

  const { data: assignedAgent } = await supabase.rpc(
    "get_transfer_agent",
    {
      p_transfer_id: transfer.id,
    }
  );

  const { data: events } = await supabase
    .from("transaction_events")
    .select("*")
    .eq("transaction_id", transfer.id)
    .order("created_at", { ascending: true });

  const { data: agentPaymentEvidence } = await supabase
    .from("attachments")
    .select("*")
    .eq("transaction_id", transfer.id)
    .eq("evidence_type", "agent_payment")
    .order("created_at", { ascending: true });

  const { data: paybotPayoutEvidence } = await supabase
    .from("attachments")
    .select("*")
    .eq("transaction_id", transfer.id)
    .eq("evidence_type", "paybot_payout")
    .order("created_at", { ascending: true });

  const hasAgentPaymentEvidence =
    (agentPaymentEvidence?.length ?? 0) > 0;

  const payoutProofUrls: {
    file_name: string;
    url: string;
  }[] = [];

  for (const attachment of paybotPayoutEvidence ?? []) {
    const { data: signedUrlData } = await supabase.storage
      .from("transaction-evidence")
      .createSignedUrl(
        attachment.storage_path,
        60 * 10
      );

    if (signedUrlData?.signedUrl) {
      payoutProofUrls.push({
        file_name: attachment.file_name,
        url: signedUrlData.signedUrl,
      });
    }
  }

  function formatStatus(status: string) {
    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function getStatusClasses(status: string) {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "recipient_paid":
        return "bg-blue-100 text-blue-700";
      case "sent_to_paybot":
      case "paybot_accepted":
      case "paybot_pending":
        return "bg-purple-100 text-purple-700";
      case "payment_confirmed":
        return "bg-yellow-100 text-yellow-700";
      case "agent_approved":
        return "bg-indigo-100 text-indigo-700";
      case "rejected":
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  const canApprove =
    isAgent && transfer.status === "requested";

  const canConfirmPayment =
    isAgent &&
    transfer.status === "agent_approved";

  const canUploadPaymentEvidence =
    isAgent &&
    transfer.status === "payment_confirmed";

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/transfers"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to Transfers
            </Link>
            <h1 className="mt-2 text-2xl font-bold">
              Transfer Details
            </h1>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusClasses(
              transfer.status
            )}`}
          >
            {formatStatus(transfer.status)}
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold">
              Transfer Information
            </h2>

            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-gray-500">Transfer ID</p>
                <p className="break-all font-medium">
                  {transfer.id}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Source Amount</p>
                <p className="font-medium">
                  {transfer.source_amount ?? transfer.amount}{" "}
                  {transfer.currency}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Destination Amount</p>
                <p className="font-medium">
                  {transfer.destination_amount ?? "—"}{" "}
                  {transfer.destination_currency ?? ""}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Exchange Rate</p>
                <p className="font-medium">
                  {transfer.exchange_rate ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">
                  Destination Country
                </p>
                <p className="font-medium">
                  {transfer.destination_country}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Recipient</p>
                <p className="font-medium">
                  {transfer.recipient_name}
                </p>
              </div>

              {transfer.recipient_phone && (
                <div>
                  <p className="text-gray-500">
                    Recipient Phone
                  </p>
                  <p className="font-medium">
                    {transfer.recipient_phone}
                  </p>
                </div>
              )}

              <div>
                <p className="text-gray-500">Created</p>
                <p className="font-medium">
                  {new Date(
                    transfer.created_at
                  ).toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold">
              Assigned Agent
            </h2>

            <div className="mt-4">
              {assignedAgent?.[0]?.full_name ? (
                <p className="font-medium">
                  {assignedAgent[0].full_name}
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  No agent assigned yet.
                </p>
              )}
            </div>
          </section>
        </div>

        {isAgent && (
          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold">
              Agent Actions
            </h2>

            <div className="mt-5 space-y-5">
              {canApprove && (
                <ApproveTransferButton
                  transferId={transfer.id}
                />
              )}

              {canConfirmPayment && (
                <ConfirmPaymentButton
                  transferId={transfer.id}
                />
              )}

              {canUploadPaymentEvidence && (
                <UploadEvidence
                  transferId={transfer.id}
                />
              )}

              {transfer.status === "payment_confirmed" && (
                <div className="rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold">
                    Send to Paybot
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Send this transfer to the Paybot queue after
                    client payment evidence has been uploaded.
                  </p>

                  {!hasAgentPaymentEvidence && (
                    <p className="mt-3 text-sm font-medium text-yellow-700">
                      Payment evidence is required before this
                      transfer can be sent to Paybot.
                    </p>
                  )}

                  <div className="mt-4">
                    <SendToPaybotButton
                      transferId={transfer.id}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Client Payment Evidence
          </h2>

          {agentPaymentEvidence &&
          agentPaymentEvidence.length > 0 ? (
            <div className="mt-4 space-y-3">
              {agentPaymentEvidence.map((attachment) => (
                <div
                  key={attachment.id}
                  className="rounded border border-gray-200 p-3"
                >
                  <p className="text-sm font-medium">
                    {attachment.file_name}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    Uploaded{" "}
                    {new Date(
                      attachment.created_at
                    ).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              No client payment evidence has been uploaded yet.
            </p>
          )}
        </section>

        {transfer.status === "completed" && (
          <section className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6">
            <h2 className="text-lg font-semibold text-green-800">
              Completed
            </h2>

            <p className="mt-2 text-sm text-green-700">
              This transfer has been completed.
            </p>

            {transfer.completed_at && (
              <p className="mt-2 text-sm text-green-700">
                Completed:{" "}
                {new Date(
                  transfer.completed_at
                ).toLocaleString()}
              </p>
            )}
          </section>
        )}

        {payoutProofUrls.length > 0 && (
          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold">
              Recipient Payment Proof
            </h2>

            <div className="mt-4 space-y-3">
              {payoutProofUrls.map((proof) => (
                <div
                  key={proof.url}
                  className="rounded border border-gray-200 p-3"
                >
                  <a
                    href={proof.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {proof.file_name}
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Transaction Timeline
          </h2>

          {events && events.length > 0 ? (
            <div className="mt-5 space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-l-2 border-gray-200 pl-4"
                >
                  <p className="font-medium">
                    {formatStatus(event.event_type)}
                  </p>

                  {event.notes && (
                    <p className="mt-1 text-sm text-gray-500">
                      {event.notes}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(
                      event.created_at
                    ).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              No events recorded yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}