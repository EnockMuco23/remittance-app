import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import PaybotPayout from "./paybot-payout";

type PaybotTransferPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PayoutEvidence = {
  id: string;
  file_name: string;
  file_type: string | null;
  storage_path: string;
  created_at: string;
};

export default async function PaybotTransferPage({
  params,
}: PaybotTransferPageProps) {
  const { id } = await params;

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
    profile.role !== "paybot"
  ) {
    redirect("/dashboard");
  }

  const { data: transfer, error: transferError } =
    await supabase
      .from("transfer_requests")
      .select("*")
      .eq("id", id)
      .single();

  if (transferError || !transfer) {
    notFound();
  }

  if (transfer.paybot_id !== user.id) {
    redirect("/paybot");
  }

  const { data: events, error: eventsError } =
    await supabase
      .from("transaction_events")
      .select("*")
      .eq("transaction_id", id)
      .order("created_at", {
        ascending: true,
      });

  if (eventsError) {
    console.error(
      "Transaction events error:",
      eventsError
    );
  }

  const {
    data: payoutEvidence,
    error: evidenceError,
  } = await supabase
    .from("attachments")
    .select(
      "id, file_name, file_type, storage_path, created_at"
    )
    .eq("transaction_id", id)
    .eq(
      "evidence_type",
      "paybot_payout"
    )
    .order("created_at", {
      ascending: false,
    });

  if (evidenceError) {
    console.error(
      "Payout evidence error:",
      evidenceError
    );
  }

  const evidenceWithUrls: Array<
    PayoutEvidence & {
      signedUrl: string | null;
    }
  > = [];

  for (const evidence of payoutEvidence ?? []) {
    const {
      data: signedUrlData,
      error: signedUrlError,
    } = await supabase.storage
      .from("transaction-evidence")
      .createSignedUrl(
        evidence.storage_path,
        60 * 10
      );

    if (signedUrlError) {
      console.error(
        "Signed URL error:",
        signedUrlError
      );
    }

    evidenceWithUrls.push({
      ...evidence,
      signedUrl:
        signedUrlData?.signedUrl ?? null,
    });
  }

  const isCompleted =
    transfer.status === "completed";

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Link
            href="/paybot"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Paybot Dashboard
          </Link>

          <Link
            href="/paybot"
            className="text-sm text-gray-600 hover:underline"
          >
            My Active Transfers
          </Link>
        </div>

        <div className="mt-6 rounded-lg bg-white p-8 shadow">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">
                Paybot Transfer
              </h1>

              <p className="mt-2 text-gray-500">
                Review the transfer and complete the
                recipient payout.
              </p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-sm font-medium capitalize ${
                isCompleted
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {transfer.status.replaceAll(
                "_",
                " "
              )}
            </span>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">
                Recipient
              </p>

              <p className="mt-1 font-medium">
                {transfer.recipient_name}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Recipient Phone
              </p>

              <p className="mt-1 font-medium">
                {transfer.recipient_phone ||
                  "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Transfer Amount
              </p>

              <p className="mt-1 font-medium">
                {transfer.amount}{" "}
                {transfer.currency}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Destination
              </p>

              <p className="mt-1 font-medium">
                {transfer.destination_country}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Transfer ID
              </p>

              <p className="mt-1 break-all font-mono text-sm">
                {transfer.id}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Submitted
              </p>

              <p className="mt-1 font-medium">
                {new Date(
                  transfer.created_at
                ).toLocaleString()}
              </p>
            </div>

            {transfer.completed_at && (
              <div>
                <p className="text-sm text-gray-500">
                  Completed
                </p>

                <p className="mt-1 font-medium">
                  {new Date(
                    transfer.completed_at
                  ).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {!isCompleted && (
          <div className="mt-6 rounded-lg bg-white p-8 shadow">
            <h2 className="text-2xl font-bold">
              Recipient Payout
            </h2>

            <p className="mt-2 text-gray-600">
              Pay the recipient, then upload proof of
              payment. The transfer cannot be completed
              without payout proof.
            </p>

            <div className="mt-6">
              <PaybotPayout
                transferId={transfer.id}
                status={transfer.status}
              />
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                ✓
              </div>

              <div>
                <h2 className="text-2xl font-bold text-green-800">
                  Transfer Completed
                </h2>

                <p className="mt-2 text-green-700">
                  The recipient has been paid and the
                  transfer has been completed successfully.
                </p>

                {transfer.completed_at && (
                  <p className="mt-3 text-sm text-green-700">
                    Completed on{" "}
                    {new Date(
                      transfer.completed_at
                    ).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-lg bg-white p-8 shadow">
          <h2 className="text-2xl font-bold">
            Payment Proof
          </h2>

          <p className="mt-2 text-gray-600">
            Evidence uploaded for the recipient payout.
          </p>

          {evidenceWithUrls.length === 0 ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-500">
                No payout proof has been uploaded yet.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {evidenceWithUrls.map(
                (evidence) => (
                  <div
                    key={evidence.id}
                    className="flex flex-col gap-4 rounded-lg border border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {evidence.file_name}
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        Uploaded{" "}
                        {new Date(
                          evidence.created_at
                        ).toLocaleString()}
                      </p>

                      {evidence.file_type && (
                        <p className="mt-1 text-xs text-gray-400">
                          {evidence.file_type}
                        </p>
                      )}
                    </div>

                    {evidence.signedUrl ? (
                      <a
                        href={
                          evidence.signedUrl
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
                      >
                        View Payment Proof
                      </a>
                    ) : (
                      <span className="text-sm text-red-600">
                        Proof unavailable
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg bg-white p-8 shadow">
          <h2 className="text-2xl font-bold">
            Transaction Timeline
          </h2>

          {!events ||
          events.length === 0 ? (
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
                    {event.event_type.replaceAll(
                      "_",
                      " "
                    )}
                  </p>

                  {event.notes && (
                    <p className="mt-1 text-sm text-gray-600">
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
          )}
        </div>
      </div>
    </main>
  );
}