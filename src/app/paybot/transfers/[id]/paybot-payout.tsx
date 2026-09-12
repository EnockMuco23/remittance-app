"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type PaybotPayoutProps = {
  transferId: string;
  status: string;
};

export default function PaybotPayout({
  transferId,
  status,
}: PaybotPayoutProps) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const payoutComplete =
    status === "recipient_paid" ||
    status === "completed";

  async function uploadEvidence() {
    if (!file) {
      setError("Please select a payment proof file.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be logged in.");
      setUploading(false);
      return;
    }

    const safeFileName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const storagePath =
      `transactions/${transferId}/paybot/` +
      `${Date.now()}-${safeFileName}`;

    const { error: uploadError } =
      await supabase.storage
        .from("transaction-evidence")
        .upload(storagePath, file);

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { error: registerError } =
      await supabase.rpc(
        "register_paybot_payout_evidence",
        {
          p_transfer_id: transferId,
          p_file_name: file.name,
          p_file_type:
            file.type ||
            "application/octet-stream",
          p_storage_path: storagePath,
        }
      );

    if (registerError) {
      await supabase.storage
        .from("transaction-evidence")
        .remove([storagePath]);

      setError(registerError.message);
      setUploading(false);
      return;
    }

    setSuccess(
      "Payment proof uploaded successfully."
    );

    setFile(null);
    setUploading(false);

    router.refresh();
  }

  async function completeTransfer() {
    setCompleting(true);
    setError("");
    setSuccess("");

    const supabase = createClient();

    const { error: completionError } =
      await supabase.rpc(
        "complete_paybot_transfer",
        {
          p_transfer_id: transferId,
        }
      );

    if (completionError) {
      setError(completionError.message);
      setCompleting(false);
      return;
    }

    setSuccess(
      "Transfer completed successfully."
    );

    setCompleting(false);

    router.refresh();
  }

  if (payoutComplete) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5">
        <p className="font-semibold text-green-800">
          Recipient payout completed
        </p>

        <p className="mt-1 text-sm text-green-700">
          This transfer has already been marked as completed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor="payout-proof"
          className="block text-sm font-medium text-gray-700"
        >
          Payment Proof
        </label>

        <p className="mt-1 text-sm text-gray-500">
          Upload the receipt, confirmation screenshot,
          or other evidence showing that the recipient
          was paid.
        </p>

        <input
          id="payout-proof"
          type="file"
          accept="image/*,.pdf"
          disabled={uploading || completing}
          onChange={(event) => {
            setFile(
              event.target.files?.[0] ?? null
            );
            setError("");
            setSuccess("");
          }}
          className="mt-3 block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm"
        />
      </div>

      <button
        type="button"
        onClick={uploadEvidence}
        disabled={
          !file ||
          uploading ||
          completing
        }
        className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {uploading
          ? "Uploading..."
          : "Upload Payment Proof"}
      </button>

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            {success}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {error}
          </p>
        </div>
      )}

      <div className="border-t pt-6">
        <h3 className="font-semibold">
          Complete Transfer
        </h3>

        <p className="mt-1 text-sm text-gray-500">
          The recipient must be paid and payment proof
          must be uploaded before completing this transfer.
        </p>

        <button
          type="button"
          onClick={completeTransfer}
          disabled={uploading || completing}
          className="mt-4 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {completing
            ? "Completing..."
            : "Mark Transfer Complete"}
        </button>
      </div>
    </div>
  );
}